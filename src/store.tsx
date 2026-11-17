// App state: tasks, projects, recurring rules, events, settings and connected
// calendars, persisted to AsyncStorage. The plan is derived from state, so it
// is recomputed whenever anything changes and every minute while the app is
// open. Side effects (calendar write-back, reminders) follow the plan.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { syncReminders } from './notify';
import { buildSchedTasks, parseRecurringId } from './plan';
import { schedule, type SchedTask } from './scheduler';
import { isSignedIn, signIn, signOut, type ProviderId } from './sync/auth';
import {
  fetchGoogleEvents,
  fetchMicrosoftEvents,
  googleAccount,
  microsoftAccount,
} from './sync/calendars';
import { fetchGoogleTasks, setGoogleTaskDone } from './sync/googleTasks';
import { mergeGoogleTasks } from './sync/googleTasksMerge';
import {
  WRITE_AHEAD_DAYS,
  clearBlocks,
  writeBlocks,
  type BlockToWrite,
  type WriteBackState,
} from './sync/writeBack';
import {
  DEFAULT_SETTINGS,
  PROJECT_COLORS,
  type CalendarEvent,
  type Project,
  type RecurringRule,
  type ScheduleResult,
  type Settings,
  type Task,
} from './types';

export interface Connection {
  account?: string;
  lastSync?: string;
  error?: string;
  syncing?: boolean;
}

interface Persisted {
  tasks: Task[];
  projects: Project[];
  rules: RecurringRule[];
  localEvents: CalendarEvent[];
  synced: Record<ProviderId, CalendarEvent[]>;
  settings: Settings;
  connections: Partial<Record<ProviderId, Connection>>;
  /** Google Tasks ids the user deleted here, so they are not re-imported. */
  ignoredGoogleTasks: string[];
  writeBack: Record<ProviderId, WriteBackState>;
}

const STORAGE_KEY = 'slotwise_state_v1';
const AUTO_SYNC_MS = 15 * 60_000;
const WRITE_DEBOUNCE_MS = 15_000;

const EMPTY: Persisted = {
  tasks: [],
  projects: [],
  rules: [],
  localEvents: [],
  synced: { google: [], microsoft: [] },
  settings: DEFAULT_SETTINGS,
  connections: {},
  ignoredGoogleTasks: [],
  writeBack: { google: { events: {} }, microsoft: { events: {} } },
};

type NewTask = Partial<Task> & Pick<Task, 'title' | 'durationMin' | 'priority'>;

interface Store extends Persisted {
  loaded: boolean;
  now: number;
  plan: ScheduleResult;
  allEvents: CalendarEvent[];
  /** Stored tasks plus recurring instances, as the scheduler saw them. */
  lookup: (id: string) => SchedTask | undefined;
  saveTask: (t: NewTask) => string;
  deleteTask: (id: string) => void;
  completeTask: (id: string, done?: boolean) => void;
  logProgress: (id: string, minutes: number) => void;
  /** Adds time to a task that needs longer than planned. */
  extendTask: (id: string, minutes: number) => void;
  /** Push a task (or skip a recurring occurrence) until later. */
  snoozeTask: (id: string, untilIso: string) => void;
  pinTask: (id: string, startIso: string | undefined) => void;
  saveProject: (p: Partial<Project> & Pick<Project, 'name'>) => string;
  deleteProject: (id: string) => void;
  moveStep: (taskId: string, dir: -1 | 1) => void;
  saveRule: (r: Partial<RecurringRule> & Pick<RecurringRule, 'title' | 'durationMin' | 'freq'>) => void;
  deleteRule: (id: string) => void;
  saveEvent: (e: Omit<CalendarEvent, 'id' | 'source' | 'busy' | 'allDay'> & { id?: string }) => void;
  deleteEvent: (id: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  connect: (p: ProviderId) => Promise<void>;
  disconnect: (p: ProviderId) => Promise<void>;
  syncAll: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Upgrades data saved by older versions of the app. */
function migrate(saved: Partial<Persisted> & { settings?: Partial<Settings> & { workWeek?: Settings['schedules']['work'] } }): Persisted {
  const oldWeek = saved.settings?.workWeek;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved.settings,
    schedules: {
      ...DEFAULT_SETTINGS.schedules,
      ...(oldWeek ? { work: oldWeek } : {}),
      ...saved.settings?.schedules,
    },
  };
  delete (settings as { workWeek?: unknown }).workWeek;
  return {
    ...EMPTY,
    ...saved,
    settings,
    synced: { ...EMPTY.synced, ...saved.synced },
    writeBack: { ...EMPTY.writeBack, ...saved.writeBack },
    ignoredGoogleTasks: saved.ignoredGoogleTasks ?? [],
    projects: saved.projects ?? [],
    rules: saved.rules ?? [],
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load once.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState(migrate(JSON.parse(raw)));
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  // Clock tick so slipped tasks roll forward without user action.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const patchConnection = useCallback((p: ProviderId, c: Partial<Connection>) => {
    setState((s) => ({
      ...s,
      connections: { ...s.connections, [p]: { ...s.connections[p], ...c } },
    }));
  }, []);

  // ---------- sync ----------

  const syncProvider = useCallback(
    async (p: ProviderId) => {
      if (!(await isSignedIn(p))) return;
      patchConnection(p, { syncing: true, error: undefined });
      try {
        const from = new Date(Date.now() - 24 * 3600_000);
        const to = new Date(Date.now() + (stateRef.current.settings.horizonDays + 1) * 24 * 3600_000);
        const own = stateRef.current.writeBack.google.calendarId;
        const events =
          p === 'google'
            ? await fetchGoogleEvents(from, to, own ? [own] : [])
            : await fetchMicrosoftEvents(from, to);
        setState((s) => ({ ...s, synced: { ...s.synced, [p]: events } }));
        if (p === 'google' && stateRef.current.settings.googleTasks) {
          const remote = await fetchGoogleTasks();
          // Push completions made here that Google has not seen yet.
          const openRemote = new Set(remote.map((r) => r.id));
          const pending = stateRef.current.tasks.filter(
            (t) => t.completed && t.external && openRemote.has(t.external.taskId),
          );
          for (const t of pending) await setGoogleTaskDone(t.external!.listId, t.external!.taskId, true);
          const stillOpen = remote.filter((r) => !pending.some((t) => t.external!.taskId === r.id));
          setState((s) => ({
            ...s,
            tasks: mergeGoogleTasks(
              s.tasks,
              stillOpen,
              s.ignoredGoogleTasks,
              () => Crypto.randomUUID(),
              new Date().toISOString(),
            ).map((t) => (t.external && !t.schedule ? { ...t, schedule: 'personal' as const } : t)),
          }));
        }
        patchConnection(p, { syncing: false, lastSync: new Date().toISOString() });
      } catch (e) {
        patchConnection(p, { syncing: false, error: (e as Error).message });
      }
    },
    [patchConnection],
  );

  const syncAll = useCallback(async () => {
    setNow(Date.now());
    await Promise.all([syncProvider('google'), syncProvider('microsoft')]);
  }, [syncProvider]);

  // Sync on launch and when returning to the app, if stale.
  useEffect(() => {
    if (!loaded) return;
    const maybeSync = () => {
      setNow(Date.now());
      const conns = stateRef.current.connections;
      const stale = (['google', 'microsoft'] as ProviderId[]).some((p) => {
        const last = conns[p]?.lastSync;
        return conns[p]?.account && (!last || Date.now() - Date.parse(last) > AUTO_SYNC_MS);
      });
      if (stale) syncAll();
    };
    maybeSync();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && maybeSync());
    return () => sub.remove();
  }, [loaded, syncAll]);

  const connect = useCallback(
    async (p: ProviderId) => {
      patchConnection(p, { error: undefined });
      try {
        const ok = await signIn(p);
        if (!ok) return;
        const account = p === 'google' ? await googleAccount() : await microsoftAccount();
        patchConnection(p, { account });
        await syncProvider(p);
      } catch (e) {
        patchConnection(p, { error: (e as Error).message });
      }
    },
    [patchConnection, syncProvider],
  );

  const disconnect = useCallback(async (p: ProviderId) => {
    try {
      await clearBlocks(p, stateRef.current.writeBack[p]);
    } catch {
      // Best effort: the calendar can be deleted by hand.
    }
    await signOut(p);
    setState((s) => {
      const connections = { ...s.connections };
      delete connections[p];
      return {
        ...s,
        connections,
        synced: { ...s.synced, [p]: [] },
        writeBack: { ...s.writeBack, [p]: { events: {} } },
      };
    });
  }, []);

  // ---------- derived plan ----------

  const allEvents = useMemo(
    () => [...state.localEvents, ...state.synced.google, ...state.synced.microsoft],
    [state.localEvents, state.synced],
  );

  const schedTasks = useMemo(
    () => buildSchedTasks(state.tasks, state.projects, state.rules, state.settings, now),
    [state.tasks, state.projects, state.rules, state.settings, now],
  );

  const plan = useMemo(() => schedule(schedTasks, allEvents, state.settings, now), [schedTasks, allEvents, state.settings, now]);

  const byId = useMemo(() => new Map(schedTasks.map((t) => [t.id, t])), [schedTasks]);
  const lookup = useCallback((id: string) => byId.get(id), [byId]);

  // ---------- task actions ----------

  /** Mirror a completion change to Google Tasks; retried on the next sync if it fails. */
  const pushCompletion = useCallback(
    (id: string, done: boolean) => {
      const ext = stateRef.current.tasks.find((t) => t.id === id)?.external;
      if (!ext) return;
      setGoogleTaskDone(ext.listId, ext.taskId, done).catch((e) =>
        patchConnection('google', { error: `Could not update Google Tasks: ${(e as Error).message}` }),
      );
    },
    [patchConnection],
  );

  const patchRule = (ruleId: string, f: (r: RecurringRule) => RecurringRule) =>
    setState((s) => ({ ...s, rules: s.rules.map((r) => (r.id === ruleId ? f(r) : r)) }));

  const saveTask: Store['saveTask'] = useCallback((t) => {
    const id = t.id ?? Crypto.randomUUID();
    setState((s) => {
      const existing = s.tasks.find((x) => x.id === id);
      const projectTasks = t.projectId ? s.tasks.filter((x) => x.projectId === t.projectId) : [];
      const task: Task = {
        doneMin: 0,
        splittable: true,
        minChunkMin: 30,
        completed: false,
        createdAt: new Date().toISOString(),
        order: existing?.order ?? (t.projectId ? Math.max(0, ...projectTasks.map((x) => x.order ?? 0)) + 1 : undefined),
        ...existing,
        ...t,
        id,
      } as Task;
      return {
        ...s,
        tasks: existing ? s.tasks.map((x) => (x.id === id ? task : x)) : [...s.tasks, task],
      };
    });
    return id;
  }, []);

  const deleteTask = useCallback((id: string) => {
    const rec = parseRecurringId(id);
    if (rec) {
      patchRule(rec.ruleId, (r) => ({ ...r, skipped: [...(r.skipped ?? []), rec.key] }));
      return;
    }
    setState((s) => {
      const ext = s.tasks.find((t) => t.id === id)?.external;
      return {
        ...s,
        tasks: s.tasks.filter((t) => t.id !== id),
        ignoredGoogleTasks: ext ? [...s.ignoredGoogleTasks, ext.taskId] : s.ignoredGoogleTasks,
      };
    });
  }, []);

  const completeTask = useCallback(
    (id: string, done = true) => {
      const rec = parseRecurringId(id);
      if (rec) {
        patchRule(rec.ruleId, (r) => ({
          ...r,
          done: done ? [...new Set([...r.done, rec.key])] : r.done.filter((k) => k !== rec.key),
        }));
        return;
      }
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, completed: done, completedAt: done ? new Date().toISOString() : undefined } : t,
        ),
      }));
      pushCompletion(id, done);
    },
    [pushCompletion],
  );

  const logProgress = useCallback(
    (id: string, minutes: number) => {
      if (parseRecurringId(id)) {
        completeTask(id, true);
        return;
      }
      const t = stateRef.current.tasks.find((x) => x.id === id);
      if (!t) return;
      const doneMin = Math.min(t.durationMin, t.doneMin + minutes);
      const completed = doneMin >= t.durationMin;
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === id ? { ...x, doneMin, completed, completedAt: completed ? new Date().toISOString() : x.completedAt } : x,
        ),
      }));
      if (completed) pushCompletion(id, true);
    },
    [completeTask, pushCompletion],
  );

  const extendTask = useCallback((id: string, minutes: number) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, durationMin: t.durationMin + minutes, completed: false } : t)),
    }));
  }, []);

  const snoozeTask = useCallback((id: string, untilIso: string) => {
    const rec = parseRecurringId(id);
    if (rec) {
      patchRule(rec.ruleId, (r) => ({ ...r, skipped: [...(r.skipped ?? []), rec.key] }));
      return;
    }
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, startAfter: untilIso, pinnedStart: undefined } : t)),
    }));
  }, []);

  const pinTask = useCallback((id: string, startIso: string | undefined) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, pinnedStart: startIso } : t)) }));
  }, []);

  // ---------- projects ----------

  const saveProject: Store['saveProject'] = useCallback((p) => {
    const id = p.id ?? Crypto.randomUUID();
    setState((s) => {
      const existing = s.projects.find((x) => x.id === id);
      const project: Project = {
        color: PROJECT_COLORS[s.projects.length % PROJECT_COLORS.length],
        sequential: true,
        schedule: 'work',
        priority: 3,
        createdAt: new Date().toISOString(),
        ...existing,
        ...p,
        id,
      };
      return {
        ...s,
        projects: existing ? s.projects.map((x) => (x.id === id ? project : x)) : [...s.projects, project],
      };
    });
    return id;
  }, []);

  const deleteProject = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      projects: s.projects.filter((p) => p.id !== id),
      tasks: s.tasks.filter((t) => t.projectId !== id || t.completed).map((t) => (t.projectId === id ? { ...t, projectId: undefined } : t)),
    }));
  }, []);

  const moveStep = useCallback((taskId: string, dir: -1 | 1) => {
    setState((s) => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t?.projectId) return s;
      const steps = s.tasks
        .filter((x) => x.projectId === t.projectId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const i = steps.findIndex((x) => x.id === taskId);
      const j = i + dir;
      if (j < 0 || j >= steps.length) return s;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      const order = new Map(steps.map((x, k) => [x.id, k + 1]));
      return { ...s, tasks: s.tasks.map((x) => (order.has(x.id) ? { ...x, order: order.get(x.id) } : x)) };
    });
  }, []);

  // ---------- recurring ----------

  const saveRule: Store['saveRule'] = useCallback((r) => {
    setState((s) => {
      const id = r.id ?? Crypto.randomUUID();
      const existing = s.rules.find((x) => x.id === id);
      const rule: RecurringRule = {
        priority: 3,
        schedule: 'personal',
        timeOfDay: 'any',
        done: [],
        createdAt: new Date().toISOString(),
        ...existing,
        ...r,
        id,
      };
      return { ...s, rules: existing ? s.rules.map((x) => (x.id === id ? rule : x)) : [...s.rules, rule] };
    });
  }, []);

  const deleteRule = useCallback((id: string) => {
    setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));
  }, []);

  // ---------- events & settings ----------

  const saveEvent: Store['saveEvent'] = useCallback((e) => {
    setState((s) => {
      const ev: CalendarEvent = {
        id: e.id ?? `local:${Crypto.randomUUID()}`,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: false,
        busy: true,
        source: 'local',
      };
      const exists = s.localEvents.some((x) => x.id === ev.id);
      return {
        ...s,
        localEvents: exists ? s.localEvents.map((x) => (x.id === ev.id ? ev : x)) : [...s.localEvents, ev],
      };
    });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setState((s) => ({ ...s, localEvents: s.localEvents.filter((e) => e.id !== id) }));
  }, []);

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  }, []);

  // ---------- side effects that follow the plan ----------

  // Reminders before blocks start.
  useEffect(() => {
    if (!loaded) return;
    syncReminders(plan.blocks, (id) => byId.get(id)?.title, state.settings.notifyMin, now).catch(() => {});
  }, [loaded, plan.blocks, byId, state.settings.notifyMin, now]);

  // Write planned blocks to Google / Outlook, debounced.
  const writing = useRef(false);
  const accountsKey = `${state.connections.google?.account ?? ''}|${state.connections.microsoft?.account ?? ''}`;
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      if (writing.current) return;
      writing.current = true;
      try {
        const s = stateRef.current;
        const until = Date.now() + WRITE_AHEAD_DAYS * 24 * 3600_000;
        const modes: Record<ProviderId, string> = { google: s.settings.writeGoogle, microsoft: s.settings.writeOutlook };
        for (const p of ['google', 'microsoft'] as ProviderId[]) {
          if (!s.connections[p]?.account) continue;
          const mode = modes[p];
          const wb = s.writeBack[p];
          try {
            let next: WriteBackState;
            if (mode === 'off') {
              if (!Object.keys(wb.events).length) continue;
              next = await clearBlocks(p, wb);
            } else {
              const desired: BlockToWrite[] = [];
              for (const b of plan.blocks) {
                if (Date.parse(b.start) > until) continue;
                const t = byId.get(b.taskId);
                if (!t) continue;
                if (mode !== 'all' && (t.schedule ?? 'work') !== mode) continue;
                desired.push({ ...b, title: t.recurrence ? `↻ ${t.title}` : t.title });
              }
              next = await writeBlocks(p, wb, desired);
            }
            setState((x) => ({ ...x, writeBack: { ...x.writeBack, [p]: next } }));
          } catch (e) {
            patchConnection(p, { error: `Could not update the Slotwise calendar: ${(e as Error).message}` });
          }
        }
      } finally {
        writing.current = false;
      }
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loaded, plan.blocks, byId, state.settings.writeGoogle, state.settings.writeOutlook, accountsKey, patchConnection]);

  const value: Store = {
    ...state,
    loaded,
    now,
    plan,
    allEvents,
    lookup,
    saveTask,
    deleteTask,
    completeTask,
    logProgress,
    extendTask,
    snoozeTask,
    pinTask,
    saveProject,
    deleteProject,
    moveStep,
    saveRule,
    deleteRule,
    saveEvent,
    deleteEvent,
    updateSettings,
    connect,
    disconnect,
    syncAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
