// Run with: npm test  (uses Node's built-in test runner + type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../src/scheduler.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import type { CalendarEvent, Task } from '../src/types.ts';

// Monday 2030-01-07 08:00 local time.
const MONDAY_8AM = new Date(2030, 0, 7, 8, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2030, 0, day, h, m).toISOString();

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: p.id,
    durationMin: 60,
    doneMin: 0,
    priority: 3,
    splittable: true,
    minChunkMin: 30,
    completed: false,
    createdAt: new Date(2030, 0, 1).toISOString(),
    ...p,
  };
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, title: id, start, end, allDay: false, source: 'local', busy: true };
}

test('places a task at the start of the work day', () => {
  const r = schedule([task({ id: 'a' })], [], DEFAULT_SETTINGS, MONDAY_8AM);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].start, at(7, 9));
  assert.equal(r.blocks[0].end, at(7, 10));
});

test('higher priority goes first', () => {
  const r = schedule(
    [task({ id: 'low', priority: 4 }), task({ id: 'asap', priority: 1 })],
    [],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.equal(r.blocks[0].taskId, 'asap');
  assert.equal(r.blocks[1].taskId, 'low');
  assert.equal(r.blocks[1].start, at(7, 10));
});

test('works around meetings and splits when allowed', () => {
  const r = schedule(
    [task({ id: 'a', durationMin: 120 })],
    [event('standup', at(7, 10), at(7, 11))],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.deepEqual(
    r.blocks.map((b) => [b.start, b.end]),
    [
      [at(7, 9), at(7, 10)],
      [at(7, 11), at(7, 12)],
    ],
  );
});

test('non-splittable tasks wait for a big enough gap', () => {
  const r = schedule(
    [task({ id: 'a', durationMin: 120, splittable: false })],
    [event('standup', at(7, 10), at(7, 11))],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].start, at(7, 11));
});

test('skips weekends and flags deadlines it cannot meet', () => {
  // Friday 16:00, 3h task due Friday 18:00 -> 1h Fri, 2h Monday, at risk.
  const fri4pm = new Date(2030, 0, 11, 16, 0).getTime();
  const r = schedule(
    [task({ id: 'a', durationMin: 180, deadline: at(11, 18) })],
    [],
    DEFAULT_SETTINGS,
    fri4pm,
  );
  assert.equal(r.blocks[1].start, at(14, 9));
  assert.deepEqual(r.atRisk, ['a']);
});

test('reschedules from now: past time is never used', () => {
  const noon = new Date(2030, 0, 7, 12, 7).getTime();
  const r = schedule([task({ id: 'a' })], [], DEFAULT_SETTINGS, noon);
  assert.equal(r.blocks[0].start, at(7, 12, 15));
});

test('completed work and done minutes are respected', () => {
  const r = schedule(
    [task({ id: 'done', completed: true }), task({ id: 'half', durationMin: 90, doneMin: 60 })],
    [],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].end, at(7, 9, 30));
});

test('free/all-day events do not block time', () => {
  const r = schedule(
    [task({ id: 'a' })],
    [
      { ...event('holiday', at(7, 0), at(8, 0)), allDay: true },
      { ...event('ooo', at(7, 9), at(7, 12)), busy: false },
    ],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.equal(r.blocks[0].start, at(7, 9));
});

test('reports tasks that do not fit in the horizon', () => {
  const r = schedule(
    [task({ id: 'huge', durationMin: 10_000 })],
    [],
    { ...DEFAULT_SETTINGS, horizonDays: 1 },
    MONDAY_8AM,
  );
  assert.equal(r.unscheduled[0].remainingMin, 10_000 - 8 * 60);
});
