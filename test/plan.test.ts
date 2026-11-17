import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedTasks, dayKey, parseRecurringId, recurringInstances } from '../src/plan.ts';
import { schedule } from '../src/scheduler.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import type { Project, RecurringRule, Task } from '../src/types.ts';

const MONDAY_8AM = new Date(2030, 0, 7, 8, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2030, 0, day, h, m).toISOString();

const rule = (p: Partial<RecurringRule>): RecurringRule => ({
  id: 'r',
  title: 'Habit',
  durationMin: 30,
  priority: 3,
  schedule: 'personal',
  freq: 'daily',
  timeOfDay: 'any',
  done: [],
  createdAt: at(1, 0),
  ...p,
});

const task = (p: Partial<Task> & { id: string }): Task => ({
  title: p.id,
  durationMin: 60,
  doneMin: 0,
  priority: 3,
  splittable: true,
  minChunkMin: 30,
  completed: false,
  createdAt: at(1, 0),
  ...p,
});

test('daily habit: one instance per day, done days skipped', () => {
  const inst = recurringInstances(rule({ done: ['2030-01-08'] }), MONDAY_8AM, 3);
  assert.deepEqual(inst.map((i) => i.recurrence!.key), ['2030-01-07', '2030-01-09']);
  assert.deepEqual(parseRecurringId(inst[0].id), { ruleId: 'r', key: '2030-01-07' });
});

test('weekly and weekdays rules', () => {
  const wk = recurringInstances(rule({ freq: 'weekly', daysOfWeek: [5] }), MONDAY_8AM, 14);
  assert.deepEqual(wk.map((i) => i.recurrence!.key), ['2030-01-11', '2030-01-18']);
  const wd = recurringInstances(rule({ freq: 'weekdays' }), MONDAY_8AM, 7);
  assert.equal(wd.length, 5);
});

test('3 times a week spreads over the week and lands on different days', () => {
  const inst = recurringInstances(rule({ freq: 'timesPerWeek', timesPerWeek: 3, schedule: 'personal' }), MONDAY_8AM, 7);
  assert.equal(inst.length, 3);
  const r = schedule(inst, [], DEFAULT_SETTINGS, MONDAY_8AM);
  const days = new Set(r.blocks.map((b) => dayKey(Date.parse(b.start))));
  assert.equal(days.size, 3);
});

test('times per week counts sessions already done', () => {
  const inst = recurringInstances(
    rule({ freq: 'timesPerWeek', timesPerWeek: 3, done: ['2030-01-07#1', '2030-01-07#2'] }),
    MONDAY_8AM,
    7,
  );
  assert.deepEqual(inst.map((i) => i.recurrence!.key), ['2030-01-07#3']);
});

test('evening habit is placed in the evening window', () => {
  const inst = recurringInstances(rule({ timeOfDay: 'evening' }), MONDAY_8AM, 1);
  const r = schedule(inst, [], DEFAULT_SETTINGS, MONDAY_8AM);
  assert.equal(r.blocks[0].start, at(7, 18));
});

test('projects pass on schedule, deadline and step order', () => {
  const project: Project = {
    id: 'p',
    name: 'Launch',
    color: '#000',
    deadline: at(9, 17),
    hardDeadline: true,
    sequential: true,
    schedule: 'work',
    priority: 3,
    createdAt: at(1, 0),
  };
  const tasks = [
    task({ id: 'b', projectId: 'p', order: 2, priority: 1 }),
    task({ id: 'a', projectId: 'p', order: 1 }),
    task({ id: 'c', projectId: 'p', order: 3, completed: true }),
  ];
  const st = buildSchedTasks(tasks, [project], [], DEFAULT_SETTINGS, MONDAY_8AM);
  const b = st.find((t) => t.id === 'b')!;
  assert.deepEqual(b.dependsOn, ['a']);
  assert.equal(b.deadline, at(9, 17));
  assert.equal(b.hardDeadline, true);
  const r = schedule(st, [], DEFAULT_SETTINGS, MONDAY_8AM);
  assert.deepEqual(r.blocks.map((x) => x.taskId), ['a', 'b']);
});

test('tasks in archived projects are not scheduled', () => {
  const st = buildSchedTasks(
    [task({ id: 'x', projectId: 'p' })],
    [{ id: 'p', name: 'Old', color: '#000', sequential: false, schedule: 'work', priority: 3, archived: true, createdAt: at(1, 0) }],
    [],
    DEFAULT_SETTINGS,
    MONDAY_8AM,
  );
  assert.equal(st.length, 0);
});
