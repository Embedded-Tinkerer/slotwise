// Pure sync logic between local state and the cloud "items" table.
//
// Each syncable thing (a task, project, recurring rule, personal block, the
// shared preferences, and the calendar events a device pulled) is one row
// keyed by (kind, id). For every row we remember the JSON we last exchanged
// with the cloud. A local item whose JSON differs from that is "dirty":
//   - on pull, a dirty local item wins over the remote copy (it is pushed next);
//   - on push, dirty items are upserted and items that vanished are deleted.
// Single-user, so per-item "last writer wins" is enough.

import type { CalendarEvent, Project, RecurringRule, Settings, Task } from './types';

export type Provider = 'google' | 'microsoft';
export type ItemKind = 'task' | 'project' | 'rule' | 'event' | 'calevents' | 'prefs';

export interface CloudMeta {
  /** Highest server updated_at seen (ISO). */
  lastPull?: string;
  /** item key -> JSON last exchanged with the cloud */
  hashes: Record<string, string>;
}

export interface RemoteCalendar {
  account?: string;
  lastSync?: string;
}

export interface SyncableState {
  tasks: Task[];
  projects: Project[];
  rules: RecurringRule[];
  localEvents: CalendarEvent[];
  synced: Record<Provider, CalendarEvent[]>;
  connections: Partial<Record<Provider, { account?: string; lastSync?: string }>>;
  settings: Settings;
  ignoredGoogleTasks: string[];
  cloud: CloudMeta;
  /** Calendars connected on another device, as last synced. */
  remoteCalendars: Partial<Record<Provider, RemoteCalendar>>;
}

export interface Row {
  kind: ItemKind;
  id: string;
  data: unknown;
  deleted?: boolean;
  updated_at?: string;
}

/** Settings that stay on each device instead of syncing. */
export const DEVICE_SETTINGS: (keyof Settings)[] = ['writeGoogle', 'writeOutlook', 'notifyMin', 'geminiModel'];

const PROVIDERS: Provider[] = ['google', 'microsoft'];

export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`;

function sharedSettings(s: Settings): Partial<Settings> {
  const out: Partial<Settings> = { ...s };
  for (const k of DEVICE_SETTINGS) delete out[k];
  return out;
}

/** Everything this device would upload, keyed by item key. */
export function extractItems(s: SyncableState): Map<string, Row> {
  const m = new Map<string, Row>();
  const add = (kind: ItemKind, id: string, data: unknown) => m.set(itemKey(kind, id), { kind, id, data });
  for (const t of s.tasks) add('task', t.id, t);
  for (const p of s.projects) add('project', p.id, p);
  for (const r of s.rules) add('rule', r.id, r);
  for (const e of s.localEvents) add('event', e.id, e);
  add('prefs', 'main', { settings: sharedSettings(s.settings), ignoredGoogleTasks: s.ignoredGoogleTasks });
  // Only a device that is connected to a calendar publishes its events.
  for (const p of PROVIDERS) {
    const c = s.connections[p];
    if (c?.account) add('calevents', p, { events: s.synced[p], account: c.account, lastSync: c.lastSync });
  }
  return m;
}

const json = (x: unknown) => JSON.stringify(x);

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

/** Applies pulled rows. Local edits not yet pushed win over remote ones. */
export function applyRows<S extends SyncableState>(s: S, rows: Row[]): S {
  if (!rows.length) return s;
  const local = extractItems(s);
  const hashes = { ...s.cloud.hashes };
  let next: S = { ...s };
  let lastPull = s.cloud.lastPull;

  for (const row of rows) {
    if (row.updated_at && (!lastPull || row.updated_at > lastPull)) lastPull = row.updated_at;
    const key = itemKey(row.kind, row.id);
    const mine = local.get(key);
    // Local edit to an item we had synced before, not pushed yet: keep it.
    // (Items never synced, like a fresh install's default settings, take the remote copy.)
    if (mine && key in hashes && json(mine.data) !== hashes[key]) continue;
    // Deleted here, and the remote copy is the version we already knew: keep it deleted.
    if (!mine && key in hashes && !row.deleted && json(row.data) === hashes[key] && row.kind !== 'calevents') continue;

    if (row.kind === 'calevents') {
      const p = row.id as Provider;
      if (!PROVIDERS.includes(p) || s.connections[p]?.account) continue;
      const d = (row.data ?? {}) as { events?: CalendarEvent[]; account?: string; lastSync?: string };
      next = {
        ...next,
        synced: { ...next.synced, [p]: row.deleted ? [] : (d.events ?? []) },
        remoteCalendars: { ...next.remoteCalendars, [p]: row.deleted ? undefined : { account: d.account, lastSync: d.lastSync } },
      };
    } else if (row.kind === 'prefs') {
      if (!row.deleted) {
        const d = (row.data ?? {}) as { settings?: Partial<Settings>; ignoredGoogleTasks?: string[] };
        const incoming = { ...d.settings };
        for (const k of DEVICE_SETTINGS) delete incoming[k];
        next = {
          ...next,
          settings: { ...next.settings, ...incoming },
          ignoredGoogleTasks: d.ignoredGoogleTasks ?? next.ignoredGoogleTasks,
        };
      }
    } else {
      const field = ({ task: 'tasks', project: 'projects', rule: 'rules', event: 'localEvents' } as const)[row.kind];
      const list = next[field] as { id: string }[];
      next = {
        ...next,
        [field]: row.deleted ? list.filter((x) => x.id !== row.id) : upsertById(list, row.data as { id: string }),
      };
    }

    if (row.deleted) delete hashes[key];
    else if (row.kind === 'prefs') {
      // Rebuilt from merged state (device-only settings left out), so record that.
      hashes[key] = json(extractItems(next).get(key)!.data);
    } else hashes[key] = json(row.data);
  }

  return { ...next, cloud: { lastPull, hashes } };
}

/** What needs uploading: changed items, and items deleted locally. */
export function diffForPush(s: SyncableState): { upserts: Row[]; deletes: Row[] } {
  const items = extractItems(s);
  const upserts: Row[] = [];
  for (const [key, row] of items) if (json(row.data) !== s.cloud.hashes[key]) upserts.push(row);
  const deletes: Row[] = [];
  for (const key of Object.keys(s.cloud.hashes)) {
    if (items.has(key)) continue;
    const i = key.indexOf(':');
    const kind = key.slice(0, i) as ItemKind;
    // Calendar rows belong to whichever device is connected; never delete them here.
    if (kind === 'calevents' || kind === 'prefs') continue;
    deletes.push({ kind, id: key.slice(i + 1), data: null, deleted: true });
  }
  return { upserts, deletes };
}

/** Records a successful push. */
export function markPushed<S extends SyncableState>(s: S, pushed: { upserts: Row[]; deletes: Row[] }): S {
  const hashes = { ...s.cloud.hashes };
  for (const r of pushed.upserts) hashes[itemKey(r.kind, r.id)] = json(r.data);
  for (const r of pushed.deletes) delete hashes[itemKey(r.kind, r.id)];
  return { ...s, cloud: { ...s.cloud, hashes } };
}
