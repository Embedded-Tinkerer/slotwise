import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectPrompt, toProjectPlan } from '../src/ai/projectPlan.ts';

test('prompt includes deadline and existing steps', () => {
  const p = buildProjectPrompt(
    {
      description: 'Bring up the PA test bench',
      deadline: new Date(2030, 0, 10, 17).toISOString(),
      existingSteps: [{ title: 'Order parts', durationMin: 30, completed: true }],
    },
    new Date(2030, 0, 7, 9),
  );
  assert.match(p, /finished by 2030-01-10T17:00:00/);
  assert.match(p, /- Order parts \(30 min, done\)/);
  assert.match(p, /Bring up the PA test bench/);
});

test('validates and normalises the plan', () => {
  const plan = toProjectPlan({
    name: ' Bench ',
    sequential: true,
    summary: 'Tight',
    steps: [
      { title: 'Draft plan', durationMin: 100, priority: 2, notes: ' Reviewed ' },
      { title: '', durationMin: 30 },
      { title: 'Huge', durationMin: 5000, priority: 0, splittable: false },
      { title: 'NaN', durationMin: 'x' },
    ],
  });
  assert.equal(plan.name, 'Bench');
  assert.equal(plan.steps.length, 3);
  assert.deepEqual(plan.steps[0], { title: 'Draft plan', durationMin: 105, notes: 'Reviewed', priority: 2, splittable: true });
  assert.equal(plan.steps[1].durationMin, 480);
  assert.equal(plan.steps[1].priority, 3);
  assert.equal(plan.steps[1].splittable, false);
  assert.equal(plan.steps[2].durationMin, 60);
});

test('falls back sensibly on junk', () => {
  const plan = toProjectPlan(null);
  assert.equal(plan.name, 'New project');
  assert.equal(plan.sequential, true);
  assert.deepEqual(plan.steps, []);
});
