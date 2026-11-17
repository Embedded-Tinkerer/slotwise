import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGoogleTasks, dueToDeadline } from '../src/sync/googleTasksMerge.ts';
import type { Task } from '../src/types.ts';

let n = 0;
const newId = () => `id${++n}`;
const NOW = '2030-01-07T12:00:00.000Z';

test('imports new Google Tasks with defaults', () => {
  const out = mergeGoogleTasks(
    [],
    [
      { id: 'g1', listId: 'L', listTitle: 'My Tasks', title: 'Pay rent', due: '2030-01-09T00:00:00.000Z' },
      { id: 'g2', listId: 'L', listTitle: 'My Tasks', title: 'Someday' },
    ],
    [],
    newId,
    NOW,
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].durationMin, 30);
  assert.equal(out[0].priority, 3);
  assert.equal(out[0].deadline, new Date(2030, 0, 9, 17).toISOString());
  assert.equal(out[1].priority, 4);
  assert.equal(out[1].deadline, undefined);
});

test('due date stays on the same calendar day in any time zone', () => {
  const d = new Date(dueToDeadline('2030-03-01T00:00:00.000Z'));
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 17);
});

test('keeps local edits, updates Google fields, completes removed tasks', () => {
  const existing: Task[] = [
    {
      id: 'a', title: 'Old', durationMin: 90, doneMin: 0, priority: 1, splittable: true, minChunkMin: 30,
      completed: false, createdAt: NOW, external: { source: 'googleTasks', listId: 'L', taskId: 'g1' },
    },
    {
      id: 'b', title: 'Gone', durationMin: 30, doneMin: 0, priority: 3, splittable: true, minChunkMin: 30,
      completed: false, createdAt: NOW, external: { source: 'googleTasks', listId: 'L', taskId: 'g9' },
    },
  ];
  const out = mergeGoogleTasks(existing, [{ id: 'g1', listId: 'L', listTitle: 'Work', title: 'New' }], [], newId, NOW);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'New');
  assert.equal(out[0].durationMin, 90);
  assert.equal(out[0].priority, 1);
  assert.equal(out[1].completed, true);
});

test('does not re-import tasks deleted locally', () => {
  const out = mergeGoogleTasks([], [{ id: 'g1', listId: 'L', listTitle: 'x', title: 'X' }], ['g1'], newId, NOW);
  assert.equal(out.length, 0);
});
