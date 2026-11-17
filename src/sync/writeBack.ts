// Puts planned task blocks on a dedicated "Slotwise" calendar in Google and/or
// Outlook, so the people you work with see that time as busy.
//
// Each run diffs the blocks for the next few days against what was written
// last time: new blocks are created, blocks that moved or disappeared are
// deleted. Past blocks are left alone as a record of what was planned.

import type { ScheduledBlock } from '../types';
import { getAccessToken, type ProviderId } from './auth';

export const SLOTWISE_CALENDAR_NAME = 'Slotwise';
export const WRITE_AHEAD_DAYS = 7;

export interface WriteBackState {
  calendarId?: string;
  /** block key -> remote event id */
  events: Record<string, string>;
}

export interface BlockToWrite extends ScheduledBlock {
  title: string;
}

export const blockKey = (b: ScheduledBlock) => `${b.taskId}|${b.start}|${b.end}`;

async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

// ---------- provider specifics ----------

const G = 'https://www.googleapis.com/calendar/v3';
const M = 'https://graph.microsoft.com/v1.0';

async function ensureCalendar(p: ProviderId, token: string, known?: string): Promise<string> {
  if (p === 'google') {
    if (known && (await api(token, `${G}/calendars/${encodeURIComponent(known)}`))) return known;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cal = await api<{ id: string }>(token, `${G}/calendars`, {
      method: 'POST',
      body: JSON.stringify({ summary: SLOTWISE_CALENDAR_NAME, description: 'Task time planned by Slotwise', timeZone: tz }),
    });
    return cal!.id;
  }
  const list = await api<{ value: { id: string; name: string }[] }>(token, `${M}/me/calendars?$select=id,name&$top=100`);
  const found = list?.value.find((c) => c.id === known) ?? list?.value.find((c) => c.name === SLOTWISE_CALENDAR_NAME);
  if (found) return found.id;
  const cal = await api<{ id: string }>(token, `${M}/me/calendars`, {
    method: 'POST',
    body: JSON.stringify({ name: SLOTWISE_CALENDAR_NAME }),
  });
  return cal!.id;
}

async function createEvent(p: ProviderId, token: string, calendarId: string, b: BlockToWrite): Promise<string> {
  if (p === 'google') {
    const ev = await api<{ id: string }>(token, `${G}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        summary: b.title,
        description: 'Planned by Slotwise',
        start: { dateTime: b.start },
        end: { dateTime: b.end },
        transparency: 'opaque',
        reminders: { useDefault: false },
      }),
    });
    return ev!.id;
  }
  const ev = await api<{ id: string }>(token, `${M}/me/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      subject: b.title,
      body: { contentType: 'text', content: 'Planned by Slotwise' },
      start: { dateTime: b.start.replace(/Z$/, ''), timeZone: 'UTC' },
      end: { dateTime: b.end.replace(/Z$/, ''), timeZone: 'UTC' },
      showAs: 'busy',
      isReminderOn: false,
    }),
  });
  return ev!.id;
}

async function deleteEvent(p: ProviderId, token: string, calendarId: string, id: string): Promise<void> {
  const url =
    p === 'google'
      ? `${G}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`
      : `${M}/me/events/${encodeURIComponent(id)}`;
  await api(token, url, { method: 'DELETE' });
}

// ---------- diff ----------

export function diffBlocks(
  state: WriteBackState,
  desired: BlockToWrite[],
  now: number,
): { create: BlockToWrite[]; remove: [string, string][]; keep: Record<string, string> } {
  const want = new Map(desired.map((b) => [blockKey(b), b]));
  const keep: Record<string, string> = {};
  const remove: [string, string][] = [];
  for (const [key, id] of Object.entries(state.events)) {
    const end = Date.parse(key.split('|')[2]);
    if (want.has(key)) keep[key] = id;
    else if (end > now) remove.push([key, id]);
    // Past blocks are forgotten but left on the calendar.
  }
  const create = desired.filter((b) => !(blockKey(b) in keep));
  return { create, remove, keep };
}

/** Writes the desired blocks and returns the new state to store. */
export async function writeBlocks(
  p: ProviderId,
  state: WriteBackState,
  desired: BlockToWrite[],
  now: number = Date.now(),
): Promise<WriteBackState> {
  const token = await getAccessToken(p);
  const calendarId = await ensureCalendar(p, token, state.calendarId);
  // A new calendar means nothing we remember exists any more.
  const base: WriteBackState = calendarId === state.calendarId ? state : { calendarId, events: {} };
  const { create, remove, keep } = diffBlocks(base, desired, now);
  for (const [, id] of remove) await deleteEvent(p, token, calendarId, id);
  const events = { ...keep };
  for (const b of create) events[blockKey(b)] = await createEvent(p, token, calendarId, b);
  return { calendarId, events };
}

/** Removes every future block written so far (when write-back is turned off). */
export async function clearBlocks(p: ProviderId, state: WriteBackState, now: number = Date.now()): Promise<WriteBackState> {
  if (!state.calendarId) return { events: {} };
  const token = await getAccessToken(p);
  const { remove } = diffBlocks(state, [], now);
  for (const [, id] of remove) await deleteEvent(p, token, state.calendarId, id);
  return { calendarId: state.calendarId, events: {} };
}
