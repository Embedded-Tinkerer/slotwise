// Auto-scheduler: places tasks into free working time around fixed events.
//
// The algorithm is deliberately simple and deterministic so the plan is easy
// to reason about:
//   1. Build free intervals from working hours for each day in the horizon,
//      starting from "now" (anything in the past is never used).
//   2. Subtract busy calendar events (plus an optional buffer after each).
//   3. Order open tasks by priority, then deadline, then creation time.
//   4. Greedily give each task the earliest time that fits, splitting it into
//      chunks when allowed.
// Because it always plans from "now", a task whose block passed without being
// marked done is automatically pushed into the next free slot.

import type {
  CalendarEvent,
  ScheduleResult,
  ScheduledBlock,
  Settings,
  Task,
} from './types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

interface Interval {
  start: number;
  end: number;
}

function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function atLocalMinutes(dayStart: number, minutes: number): number {
  const d = new Date(dayStart);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

function ceilToSlot(t: number, slotMin: number): number {
  const slot = slotMin * MIN;
  return Math.ceil(t / slot) * slot;
}

/** Working-hour windows from now until the end of the horizon. */
export function workingIntervals(settings: Settings, now: number): Interval[] {
  const out: Interval[] = [];
  const firstDay = startOfLocalDay(now);
  for (let i = 0; i < settings.horizonDays; i++) {
    // Step by calendar day via setDate so DST changes are handled.
    const d = new Date(firstDay);
    d.setDate(d.getDate() + i);
    const dayStart = d.getTime();
    const wd = settings.workWeek[d.getDay()];
    if (!wd || !wd.enabled || wd.endMin <= wd.startMin) continue;
    let start = atLocalMinutes(dayStart, wd.startMin);
    const end = atLocalMinutes(dayStart, wd.endMin);
    if (end <= now) continue;
    if (start < now) start = ceilToSlot(now, settings.slotMin);
    if (start < end) out.push({ start, end });
  }
  return out;
}

/** Remove [cut.start, cut.end) from every interval. */
function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    if (cut.end <= iv.start || cut.start >= iv.end) {
      out.push(iv);
      continue;
    }
    if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start });
    if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end });
  }
  return out;
}

export function freeIntervals(
  events: CalendarEvent[],
  settings: Settings,
  now: number,
): Interval[] {
  let free = workingIntervals(settings, now);
  for (const ev of events) {
    if (!ev.busy || ev.allDay) continue;
    const start = Date.parse(ev.start);
    const end = Date.parse(ev.end) + settings.bufferMin * MIN;
    if (!(end > start)) continue;
    free = subtract(free, { start, end });
  }
  // Re-align starts that now begin mid-slot (e.g. after a 10:50 meeting).
  return free
    .map((iv) => ({ start: ceilToSlot(iv.start, settings.slotMin), end: iv.end }))
    .filter((iv) => iv.end > iv.start);
}

export function compareTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const da = a.deadline ? Date.parse(a.deadline) : Infinity;
  const db = b.deadline ? Date.parse(b.deadline) : Infinity;
  if (da !== db) return da - db;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function remainingMinutes(t: Task): number {
  return Math.max(0, t.durationMin - t.doneMin);
}

export function schedule(
  tasks: Task[],
  events: CalendarEvent[],
  settings: Settings,
  now: number = Date.now(),
): ScheduleResult {
  let free = freeIntervals(events, settings, now);
  const blocks: ScheduledBlock[] = [];
  const atRisk: string[] = [];
  const unscheduled: ScheduleResult['unscheduled'] = [];
  const finishBy: Record<string, string> = {};

  const open = tasks
    .filter((t) => !t.completed && remainingMinutes(t) > 0)
    .sort(compareTasks);

  for (const task of open) {
    let remaining = remainingMinutes(task) * MIN;
    const notBefore = task.startAfter ? Date.parse(task.startAfter) : 0;
    const minChunk = task.splittable
      ? Math.min(Math.max(task.minChunkMin, settings.slotMin) * MIN, remaining)
      : remaining;
    let lastEnd = 0;
    const next: Interval[] = [];

    for (const iv of free) {
      if (remaining <= 0) {
        next.push(iv);
        continue;
      }
      let start = Math.max(iv.start, ceilToSlot(notBefore, settings.slotMin));
      const usable = iv.end - start;
      // A chunk must be at least minChunk long unless it finishes the task.
      const need = Math.min(minChunk, remaining);
      if (usable < need) {
        next.push(iv);
        continue;
      }
      const take = Math.min(usable, remaining);
      const end = start + take;
      blocks.push({
        taskId: task.id,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
      remaining -= take;
      lastEnd = end;
      if (start > iv.start) next.push({ start: iv.start, end: start });
      if (end < iv.end) next.push({ start: end, end: iv.end });
    }
    free = next.sort((a, b) => a.start - b.start);

    if (remaining > 0) {
      unscheduled.push({ taskId: task.id, remainingMin: Math.round(remaining / MIN) });
      if (task.deadline) atRisk.push(task.id);
      continue;
    }
    finishBy[task.id] = new Date(lastEnd).toISOString();
    if (task.deadline && lastEnd > Date.parse(task.deadline)) atRisk.push(task.id);
  }

  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { blocks, atRisk, unscheduled, finishBy };
}

export const _internal = { DAY, MIN, subtract, ceilToSlot };
