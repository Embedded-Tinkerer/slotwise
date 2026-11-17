// Prompt, response schema and validation for turning a sentence into tasks
// and calendar blocks. Pure TypeScript so it can be unit tested in Node.

import type { Priority } from '../types';

export interface DraftTask {
  kind: 'task';
  title: string;
  durationMin: number;
  priority: Priority;
  deadline?: string;
  startAfter?: string;
  notes?: string;
  splittable: boolean;
}

export interface DraftEvent {
  kind: 'event';
  title: string;
  start: string;
  end: string;
}

export type Draft = DraftTask | DraftEvent;

/** Gemini structured-output schema (OpenAPI subset). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          durationMin: { type: 'INTEGER', description: 'Estimated effort in minutes' },
          priority: { type: 'INTEGER', description: '1 ASAP, 2 High, 3 Medium, 4 Low' },
          deadline: { type: 'STRING', description: 'ISO 8601 with offset, or empty' },
          startAfter: { type: 'STRING', description: 'ISO 8601 with offset, or empty' },
          splittable: { type: 'BOOLEAN' },
          notes: { type: 'STRING' },
        },
        required: ['title', 'durationMin', 'priority'],
      },
    },
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          start: { type: 'STRING', description: 'ISO 8601 with offset' },
          end: { type: 'STRING', description: 'ISO 8601 with offset' },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
  required: ['tasks', 'events'],
};

function offsetString(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Local wall-clock time as ISO 8601 with the device's UTC offset. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${offsetString(d)}`;
}

export function buildPrompt(text: string, now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  return [
    'You turn a person\'s note into items for their planner app.',
    `Current local time: ${localIso(now)} (${weekday}).`,
    '',
    'Return two lists:',
    '- tasks: work the app should find time for. Estimate durationMin realistically if not given',
    '  (round to 15 minutes). priority: 1 = ASAP/urgent, 2 = high/important, 3 = normal, 4 = low/someday.',
    '  deadline: when it must be finished ("by Friday" means Friday 17:00 local). startAfter only if the',
    '  person says not to start before some time. splittable: false only for things that must be done in',
    '  one sitting. Leave deadline/startAfter as empty strings when not stated.',
    '- events: fixed appointments with a specific time (meetings, gym at 6, doctor). If no end is given,',
    '  assume one hour.',
    'Use ISO 8601 with the same UTC offset as the current time. Resolve relative dates ("tomorrow",',
    '"next Tuesday") from the current local time. Keep titles short and in the person\'s words.',
    '',
    'Note:',
    text,
  ].join('\n');
}

function validDate(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s.trim()) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Validates and normalises the model's JSON. Anything malformed is dropped. */
export function toDrafts(raw: unknown): Draft[] {
  const out: Draft[] = [];
  const obj = (raw ?? {}) as { tasks?: unknown[]; events?: unknown[] };
  for (const t of Array.isArray(obj.tasks) ? obj.tasks : []) {
    const x = t as Record<string, unknown>;
    const title = typeof x.title === 'string' ? x.title.trim() : '';
    if (!title) continue;
    const dur = Math.round(Number(x.durationMin) / 15) * 15;
    const pr = Math.round(Number(x.priority));
    out.push({
      kind: 'task',
      title,
      durationMin: Number.isFinite(dur) ? Math.min(Math.max(dur, 15), 16 * 60) : 30,
      priority: (pr >= 1 && pr <= 4 ? pr : 3) as Priority,
      deadline: validDate(x.deadline),
      startAfter: validDate(x.startAfter),
      notes: typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim() : undefined,
      splittable: x.splittable !== false,
    });
  }
  for (const e of Array.isArray(obj.events) ? obj.events : []) {
    const x = e as Record<string, unknown>;
    const title = typeof x.title === 'string' ? x.title.trim() : '';
    const start = validDate(x.start);
    let end = validDate(x.end);
    if (!title || !start) continue;
    if (!end || Date.parse(end) <= Date.parse(start)) {
      end = new Date(Date.parse(start) + 3600_000).toISOString();
    }
    out.push({ kind: 'event', title, start, end });
  }
  return out;
}
