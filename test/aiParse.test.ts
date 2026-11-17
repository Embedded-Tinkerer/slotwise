import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, localIso, toDrafts } from '../src/ai/parse.ts';

test('prompt carries local time with offset', () => {
  const now = new Date(2030, 0, 7, 19, 5);
  assert.match(buildPrompt('x', now), new RegExp(localIso(now).replace(/[+]/g, '\\+')));
  assert.match(localIso(now), /^2030-01-07T19:05:00[+-]\d\d:\d\d$/);
});

test('normalises tasks and events and drops junk', () => {
  const d = toDrafts({
    tasks: [
      { title: ' Write report ', durationMin: 100, priority: 2, deadline: '2030-01-10T17:00:00-05:00', startAfter: '' },
      { title: '', durationMin: 30, priority: 3 },
      { title: 'Weird', durationMin: 'abc', priority: 9, deadline: 'not a date' },
    ],
    events: [
      { title: 'Gym', start: '2030-01-08T18:00:00-05:00', end: '' },
      { title: 'Bad', start: 'nope', end: 'nope' },
    ],
  });
  assert.equal(d.length, 3);
  assert.deepEqual(d[0], {
    kind: 'task',
    title: 'Write report',
    durationMin: 105,
    priority: 2,
    deadline: '2030-01-10T22:00:00.000Z',
    startAfter: undefined,
    notes: undefined,
    splittable: true,
  });
  assert.equal(d[1].kind === 'task' && d[1].durationMin, 30);
  assert.equal(d[1].kind === 'task' && d[1].priority, 3);
  assert.equal(d[1].kind === 'task' && d[1].deadline, undefined);
  assert.deepEqual(d[2], {
    kind: 'event',
    title: 'Gym',
    start: '2030-01-08T23:00:00.000Z',
    end: '2030-01-09T00:00:00.000Z',
  });
});

test('handles missing lists', () => {
  assert.deepEqual(toDrafts(null), []);
  assert.deepEqual(toDrafts({ tasks: 'x' }), []);
});
