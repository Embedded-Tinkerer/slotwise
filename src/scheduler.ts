// Auto-scheduler: places tasks into free time around fixed events.
//
// The algorithm is deterministic so the plan is easy to reason about:
//   1. Build free intervals per schedule (work hours, personal hours) for each
//      day in the horizon, starting from "now". The past is never used.
//   2. Subtract busy calendar events (plus an optional buffer after each).
//   3. Place pinned tasks at their chosen time.
//   4. Order the rest: ASAP first, then hard deadlines (earliest first), then
//      everything else by priority, deadline and age. A task that depends on
//      another (a later step of a sequential project) is placed after it.
//   5. Give each task the earliest time that fits its schedule, time-of-day
//      window and dependencies, splitting into chunks when allowed.
// Because it always plans from "now", unfinished work rolls forward by itself.

import type {
  CalendarEvent,
  ScheduleId,
  ScheduleResult,
  ScheduledBlock,
  Settings,
  Task,
} from './types';

const MIN = 60_000;

interface Interval {
  start: number;
  end: number;
}

/** Task plus fields derived before scheduling (see plan.ts). */
export type SchedTask = Task & {
  /** Ids of tasks that must finish first. */
  dependsOn?: string[];
  /** Never schedule past this time (used for recurring instances). */
  notAfter?: string;
};

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

/** Hours windows for one schedule from now until the end of the horizon. */
export function workingIntervals(settings: Settings, now: number, schedule: ScheduleId = 'work'): Interval[] {
  const out: Interval[] = [];
  const week = settings.schedules[schedule];
  const firstDay = startOfLocalDay(now);
  for (let i = 0; i < settings.horizonDays; i++) {
    // Step by calendar day via setDate so DST changes are handled.
    const d = new Date(firstDay);
    d.setDate(d.getDate() + i);
    const dayStart = d.getTime();
    const wd = week?.[d.getDay()];
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
  schedule: ScheduleId = 'work',
): Interval[] {
  let free = workingIntervals(settings, now, schedule);
  for (const ev of events) {
    if (!ev.busy || ev.allDay) continue;
    const start = Date.parse(ev.start);
    const end = Date.parse(ev.end) + settings.bufferMin * MIN;
    if (!(end > start)) continue;
    free = subtract(free, { start, end });
  }
  return realign(free, settings.slotMin);
}

/** Re-align starts that now begin mid-slot (e.g. after a 10:50 meeting). */
function realign(free: Interval[], slotMin: number): Interval[] {
  return free
    .map((iv) => ({ start: ceilToSlot(iv.start, slotMin), end: iv.end }))
    .filter((iv) => iv.end > iv.start);
}

/** 0 = ASAP, 1 = hard deadline, 2 = everything else. */
function tier(t: Task): number {
  if (t.priority === 1) return 0;
  if (t.hardDeadline && t.deadline) return 1;
  return 2;
}

export function compareTasks(a: Task, b: Task): number {
  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta - tb;
  const da = a.deadline ? Date.parse(a.deadline) : Infinity;
  const db = b.deadline ? Date.parse(b.deadline) : Infinity;
  if (ta === 1 && da !== db) return da - db;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (da !== db) return da - db;
  if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function remainingMinutes(t: Task): number {
  return Math.max(0, t.durationMin - t.doneMin);
}

/** Clip an interval to a daily time-of-day window. */
function clipToWindow(iv: Interval, w?: { startMin: number; endMin: number }): Interval | null {
  if (!w) return iv;
  const day = startOfLocalDay(iv.start);
  const start = Math.max(iv.start, atLocalMinutes(day, w.startMin));
  const end = Math.min(iv.end, atLocalMinutes(day, w.endMin));
  return end > start ? { start, end } : null;
}

export function schedule(
  tasks: SchedTask[],
  events: CalendarEvent[],
  settings: Settings,
  now: number = Date.now(),
): ScheduleResult {
  const free: Record<ScheduleId, Interval[]> = {
    work: freeIntervals(events, settings, now, 'work'),
    personal: freeIntervals(events, settings, now, 'personal'),
  };
  const blocks: ScheduledBlock[] = [];
  const atRisk: string[] = [];
  const unscheduled: ScheduleResult['unscheduled'] = [];
  const finishBy: Record<string, number> = {};

  /** Time taken by a block is unavailable to every schedule. */
  const consume = (cut: Interval) => {
    free.work = realign(subtract(free.work, cut), settings.slotMin);
    free.personal = realign(subtract(free.personal, cut), settings.slotMin);
  };

  const open = tasks.filter((t) => !t.completed && remainingMinutes(t) > 0);
  const byId = new Map(open.map((t) => [t.id, t]));

  // Pinned tasks keep their time unless that time is already over.
  const pinnedDone = new Set<string>();
  for (const t of open) {
    if (!t.pinnedStart) continue;
    const start = Date.parse(t.pinnedStart);
    const end = start + remainingMinutes(t) * MIN;
    if (!(end > now)) continue; // slipped: auto-schedule it instead
    blocks.push({ taskId: t.id, start: new Date(start).toISOString(), end: new Date(end).toISOString(), pinned: true });
    consume({ start, end });
    finishBy[t.id] = end;
    pinnedDone.add(t.id);
    if (t.deadline && end > Date.parse(t.deadline)) atRisk.push(t.id);
  }

  const done = new Set<string>(pinnedDone);
  const failed = new Set<string>();
  const visiting = new Set<string>();

  const place = (task: SchedTask) => {
    if (done.has(task.id) || failed.has(task.id)) return;
    if (visiting.has(task.id)) return; // dependency cycle: ignore the edge
    visiting.add(task.id);

    let notBefore = Math.max(now, task.startAfter ? Date.parse(task.startAfter) : 0);
    for (const depId of task.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (!dep) continue; // finished or unknown
      place(dep);
      if (failed.has(depId)) {
        failed.add(task.id);
        unscheduled.push({ taskId: task.id, remainingMin: remainingMinutes(task) });
        if (task.deadline) atRisk.push(task.id);
        visiting.delete(task.id);
        return;
      }
      notBefore = Math.max(notBefore, finishBy[depId] ?? 0);
    }
    notBefore = ceilToSlot(notBefore, settings.slotMin);
    const notAfter = task.notAfter ? Date.parse(task.notAfter) : Infinity;

    let remaining = remainingMinutes(task) * MIN;
    const minChunk = task.splittable
      ? Math.min(Math.max(task.minChunkMin, settings.slotMin) * MIN, remaining)
      : remaining;
    let lastEnd = 0;
    const sched = task.schedule ?? 'work';

    for (const iv of [...free[sched]]) {
      if (remaining <= 0) break;
      const clipped = clipToWindow(iv, task.window);
      if (!clipped) continue;
      const start = ceilToSlot(Math.max(clipped.start, notBefore), settings.slotMin);
      const end = Math.min(clipped.end, notAfter);
      const usable = end - start;
      if (usable < Math.min(minChunk, remaining)) continue;
      const take = Math.min(usable, remaining);
      blocks.push({
        taskId: task.id,
        start: new Date(start).toISOString(),
        end: new Date(start + take).toISOString(),
      });
      consume({ start, end: start + take });
      remaining -= take;
      lastEnd = start + take;
    }

    visiting.delete(task.id);
    if (remaining > 0) {
      failed.add(task.id);
      unscheduled.push({ taskId: task.id, remainingMin: Math.round(remaining / MIN) });
      if (task.deadline && !task.recurrence) atRisk.push(task.id);
      return;
    }
    done.add(task.id);
    finishBy[task.id] = lastEnd;
    if (task.deadline && !task.recurrence && lastEnd > Date.parse(task.deadline)) atRisk.push(task.id);
  };

  for (const t of [...open].sort(compareTasks)) place(t);

  // A pinned task's dependants may already be placed, which is fine: pins win.
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const finishIso: Record<string, string> = {};
  for (const [k, v] of Object.entries(finishBy)) finishIso[k] = new Date(v).toISOString();
  return { blocks, atRisk: [...new Set(atRisk)], unscheduled, finishBy: finishIso };
}

export const _internal = { MIN, subtract, ceilToSlot };
