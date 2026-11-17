// App state: tasks, events, settings and connected calendars, persisted to
// AsyncStorage. The schedule is derived from state, so it is recomputed
// whenever anything changes and every minute while the app is open.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { schedule } from './scheduler';
import { isSignedIn, signIn, signOut, type ProviderId } from './sync/auth';
import {
  fetchGoogleEvents,
  fetchMicrosoftEvents,
  googleAccount,
  microsoftAccount,
} from './sync/calendars';
import {
  DEFAULT_SETTINGS,
  type CalendarEvent,
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
  localEvents: CalendarEvent[];
  synced: Record<ProviderId, CalendarEvent[]>;
  settings: Settings;
  connections: Partial<Record<ProviderId, Connection>>;
}

const STORAGE_KEY = 'slotwise_state_v1';
const AUTO_SYNC_MS = 15 * 60_000;

const EMPTY: Persisted = {
  tasks: [],
  localEvents: [],
  synced: { google: [], microsoft: [] },
  settings: DEFAULT_SETTINGS,
  connections: {},
};

interface Store extends Persisted {
  loaded: boolean;
  now: number;
  plan: ScheduleResult;
  allEvents: CalendarEvent[];
  saveTask: (t: Partial<Task> & Pick<Task, 'title' | 'durationMin' | 'priority'>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string, done?: boolean) => void;
  logProgress: (id: string, minutes: number) => void;
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
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Persisted>;
          setState({
            ...EMPTY,
            ...saved,
            settings: { ...DEFAULT_SETTINGS, ...saved.settings },
            synced: { ...EMPTY.synced, ...saved.synced },
          });
        }
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

  const syncProvider = useCallback(
    async (p: ProviderId) => {
      if (!(await isSignedIn(p))) return;
      patchConnection(p, { syncing: true, error: undefined });
      try {
        const from = new Date(Date.now() - 24 * 3600_000);
        const to = new Date(Date.now() + (stateRef.current.settings.horizonDays + 1) * 24 * 3600_000);
        const events = p === 'google' ? await fetchGoogleEvents(from, to) : await fetchMicrosoftEvents(from, to);
        setState((s) => ({ ...s, synced: { ...s.synced, [p]: events } }));
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
    await signOut(p);
    setState((s) => {
      const connections = { ...s.connections };
      delete connections[p];
      return { ...s, connections, synced: { ...s.synced, [p]: [] } };
    });
  }, []);

  const saveTask: Store['saveTask'] = useCallback((t) => {
    setState((s) => {
      const existing = t.id ? s.tasks.find((x) => x.id === t.id) : undefined;
      const task: Task = {
        id: Crypto.randomUUID(),
        doneMin: 0,
        splittable: true,
        minChunkMin: 30,
        completed: false,
        createdAt: new Date().toISOString(),
        ...existing,
        ...t,
      } as Task;
      return {
        ...s,
        tasks: existing ? s.tasks.map((x) => (x.id === task.id ? task : x)) : [...s.tasks, task],
      };
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  }, []);

  const completeTask = useCallback((id: string, done = true) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, completed: done } : t)),
    }));
  }, []);

  const logProgress = useCallback((id: string, minutes: number) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const doneMin = Math.min(t.durationMin, t.doneMin + minutes);
        return { ...t, doneMin, completed: doneMin >= t.durationMin };
      }),
    }));
  }, []);

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

  const allEvents = useMemo(
    () => [...state.localEvents, ...state.synced.google, ...state.synced.microsoft],
    [state.localEvents, state.synced],
  );

  const plan = useMemo(
    () => schedule(state.tasks, allEvents, state.settings, now),
    [state.tasks, allEvents, state.settings, now],
  );

  const value: Store = {
    ...state,
    loaded,
    now,
    plan,
    allEvents,
    saveTask,
    deleteTask,
    completeTask,
    logProgress,
    saveEvent,
    deleteEvent,
    updateSettings,
    connect,
    disconnect,
    syncAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
