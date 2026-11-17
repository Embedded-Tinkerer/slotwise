// Turns stored data (tasks, projects, recurring rules) into the list of
// schedulable tasks the scheduler works on. Pure TypeScript, unit tested.

import type { SchedTask } from './scheduler';
import type { Project, RecurringRule, Settings, Task, TimeOfDay } from './types';

export const TIME_OF_DAY_WINDOWS: Record<TimeOfDay, { startMin: number; endMin: number } | undefined> = {
  any: undefined,
  morning: { startMin: 5 * 60, endMin: 12 * 60 },
  afternoon: { startMin: 12 * 60, endMin: 17 * 60 },
  evening: { startMin: 17 * 60, endMin: 23 * 60 },
};

const DAY_MS = 24 * 3600_000;

export function dayKey(d: Date | number): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function startOfDay(t: number): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday 00:00 of the week containing t. */
export function weekStart(t: number): Date {
  const d = startOfDay(t);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d, -dow);
}

export const RECURRING_PREFIX = 'rec:';

export function isRecurringId(id: string): boolean {
  return id.startsWith(RECURRING_PREFIX);
}

/** Parses "rec:<ruleId>:<key>". */
export function parseRecurringId(id: string): { ruleId: string; key: string } | null {
  if (!isRecurringId(id)) return null;
  const rest = id.slice(RECURRING_PREFIX.length);
  const i = rest.indexOf(':');
  if (i < 0) return null;
  return { ruleId: rest.slice(0, i), key: rest.slice(i + 1) };
}

function instance(rule: RecurringRule, key: string, from: Date, to: Date): SchedTask {
  return {
    id: `${RECURRING_PREFIX}${rule.id}:${key}`,
    title: rule.title,
    durationMin: rule.durationMin,
    doneMin: 0,
    priority: rule.priority,
    schedule: rule.schedule,
    startAfter: from.toISOString(),
    notAfter: to.toISOString(),
    deadline: to.toISOString(),
    splittable: false,
    minChunkMin: rule.durationMin,
    completed: false,
    createdAt: rule.createdAt,
    window: TIME_OF_DAY_WINDOWS[rule.timeOfDay],
    recurrence: { ruleId: rule.id, key },
  };
}

/** Occurrences of a rule from today until the end of the horizon. */
export function recurringInstances(rule: RecurringRule, now: number, horizonDays: number): SchedTask[] {
  if (rule.paused) return [];
  const closed = new Set([...rule.done, ...(rule.skipped ?? [])]);
  const today = startOfDay(now);
  const out: SchedTask[] = [];

  if (rule.freq === 'timesPerWeek') {
    const n = Math.max(1, Math.min(7, rule.timesPerWeek ?? 1));
    for (let w = weekStart(now); w.getTime() < today.getTime() + horizonDays * DAY_MS; w = addDays(w, 7)) {
      const wk = dayKey(w);
      const keys = Array.from({ length: n }, (_, i) => `${wk}#${i + 1}`).filter((k) => !closed.has(k));
      if (!keys.length) continue;
      // Spread the remaining sessions over the days left in the week.
      const first = w.getTime() < today.getTime() ? today : w;
      const end = addDays(w, 7);
      const daysLeft = Math.max(1, Math.round((end.getTime() - first.getTime()) / DAY_MS));
      const step = daysLeft / keys.length;
      keys.forEach((k, j) => {
        const from = addDays(first, Math.floor(j * step));
        const to = j === keys.length - 1 ? end : addDays(first, Math.max(Math.floor((j + 1) * step), Math.floor(j * step) + 1));
        out.push(instance(rule, k, from, to));
      });
    }
    return out;
  }

  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(today, i);
    const dow = d.getDay();
    const hit =
      rule.freq === 'daily' ||
      (rule.freq === 'weekdays' && dow >= 1 && dow <= 5) ||
      (rule.freq === 'weekly' && (rule.daysOfWeek ?? []).includes(dow));
    if (!hit) continue;
    const key = dayKey(d);
    if (closed.has(key)) continue;
    out.push(instance(rule, key, d, addDays(d, 1)));
  }
  return out;
}

/**
 * Applies project settings (schedule, deadline, step order) to tasks and
 * appends recurring instances.
 */
export function buildSchedTasks(
  tasks: Task[],
  projects: Project[],
  rules: RecurringRule[],
  settings: Settings,
  now: number,
): SchedTask[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const live = tasks.filter((t) => !(t.projectId && projectById.get(t.projectId)?.archived));
  const out: SchedTask[] = live.map((t) => {
    const p = t.projectId ? projectById.get(t.projectId) : undefined;
    if (!p) return { ...t };
    const inheritDeadline = !t.deadline && !!p.deadline;
    return {
      ...t,
      schedule: t.schedule ?? p.schedule,
      deadline: t.deadline ?? p.deadline,
      hardDeadline: inheritDeadline ? p.hardDeadline : t.hardDeadline,
    };
  });

  // Sequential projects: each open step depends on the previous open step.
  for (const p of projects) {
    if (!p.sequential || p.archived) continue;
    const steps = out
      .filter((t) => t.projectId === p.id && !t.completed)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (let i = 1; i < steps.length; i++) steps[i].dependsOn = [steps[i - 1].id];
  }

  for (const r of rules) out.push(...recurringInstances(r, now, settings.horizonDays));
  return out;
}
