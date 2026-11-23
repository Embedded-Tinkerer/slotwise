import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRows, diffForPush, markPushed, type SyncableState } from '../src/cloudMerge.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import type { Task } from '../src/types.ts';

const task = (id: string, title = id): Task => ({
  id,
  title,
  durationMin: 30,
  doneMin: 0,
  priority: 3,
  splittable: true,
  minChunkMin: 30,
  completed: false,
  createdAt: '2030-01-01T00:00:00.000Z',
});

const empty = (): SyncableState => ({
  tasks: [],
  projects: [],
  rules: [],
  localEvents: [],
  synced: { google: [], microsoft: [] },
  connections: {},
  settings: DEFAULT_SETTINGS,
  ignoredGoogleTasks: [],
  cloud: { hashes: {} },
  remoteCalendars: {},
});

test('a fresh device pushes everything once, then nothing', () => {
  let s = { ...empty(), tasks: [task('a')] };
  const d = diffForPush(s);
  assert.deepEqual(d.upserts.map((r) => r.kind).sort(), ['prefs', 'task']);
  s = markPushed(s, d);
  assert.deepEqual(diffForPush(s), { upserts: [], deletes: [] });
});

test('local edits and deletes are pushed', () => {
  let s = markPushed({ ...empty(), tasks: [task('a'), task('b')] }, diffForPush({ ...empty(), tasks: [task('a'), task('b')] }));
  s = { ...s, tasks: [task('a', 'A2')] };
  const d = diffForPush(s);
  assert.deepEqual(d.upserts.map((r) => r.id), ['a']);
  assert.deepEqual(d.deletes.map((r) => `${r.kind}:${r.id}`), ['task:b']);
});

test('pulled rows add, update and delete items', () => {
  let s = { ...empty(), tasks: [task('a'), task('b')] };
  s = markPushed(s, diffForPush(s));
  s = applyRows(s, [
    { kind: 'task', id: 'c', data: task('c'), updated_at: '2030-01-02T00:00:00Z' },
    { kind: 'task', id: 'a', data: task('a', 'from phone'), updated_at: '2030-01-03T00:00:00Z' },
    { kind: 'task', id: 'b', data: null, deleted: true, updated_at: '2030-01-01T00:00:00Z' },
  ]);
  assert.deepEqual(s.tasks.map((t) => `${t.id}:${t.title}`), ['a:from phone', 'c:c']);
  assert.equal(s.cloud.lastPull, '2030-01-03T00:00:00Z');
  assert.deepEqual(diffForPush(s), { upserts: [], deletes: [] });
});

test('unpushed local edits win over remote changes', () => {
  let s = { ...empty(), tasks: [task('a')] };
  s = markPushed(s, diffForPush(s));
  s = { ...s, tasks: [task('a', 'edited here')] };
  s = applyRows(s, [{ kind: 'task', id: 'a', data: task('a', 'edited there'), updated_at: '2030-01-02T00:00:00Z' }]);
  assert.equal(s.tasks[0].title, 'edited here');
  assert.equal(diffForPush(s).upserts.length, 1);
});

test('an echo of a known row does not bring back a local delete', () => {
  let s = { ...empty(), tasks: [task('a')] };
  s = markPushed(s, diffForPush(s));
  s = { ...s, tasks: [] };
  s = applyRows(s, [{ kind: 'task', id: 'a', data: task('a'), updated_at: '2030-01-02T00:00:00Z' }]);
  assert.equal(s.tasks.length, 0);
  assert.deepEqual(diffForPush(s).deletes.map((r) => r.id), ['a']);
});

test('calendar events flow from the connected device only', () => {
  const ev = { id: 'm1', title: 'Standup', start: '2030-01-07T15:00:00Z', end: '2030-01-07T15:30:00Z', allDay: false, source: 'microsoft' as const, busy: true };
  const phone = { ...empty(), synced: { google: [], microsoft: [ev] }, connections: { microsoft: { account: 'me@work', lastSync: 'now' } } };
  const rows = diffForPush(phone).upserts;
  assert.ok(rows.some((r) => r.kind === 'calevents' && r.id === 'microsoft'));
  let web = applyRows(empty(), rows.map((r) => ({ ...r, updated_at: '2030-01-07T00:00:00Z' })));
  assert.equal(web.synced.microsoft[0].title, 'Standup');
  assert.equal(web.remoteCalendars.microsoft?.account, 'me@work');
  // The web app never pushes or deletes the phone's calendar rows.
  web = markPushed(web, diffForPush(web));
  const d = diffForPush(web);
  assert.ok(!d.upserts.some((r) => r.kind === 'calevents'));
  assert.ok(!d.deletes.some((r) => r.kind === 'calevents'));
});

test('device-only settings are not synced', () => {
  const phone = { ...empty(), settings: { ...DEFAULT_SETTINGS, writeOutlook: 'work' as const, bufferMin: 10 } };
  const rows = diffForPush(phone).upserts.map((r) => ({ ...r, updated_at: '2030-01-07T00:00:00Z' }));
  const web = applyRows(empty(), rows);
  assert.equal(web.settings.bufferMin, 10);
  assert.equal(web.settings.writeOutlook, 'off');
  assert.deepEqual(diffForPush(web).upserts, []);
});
