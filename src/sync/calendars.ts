// Read-only calendar sync: pulls events from Google Calendar and
// Outlook / Microsoft 365 so the scheduler can plan around them.

import type { CalendarEvent } from '../types';
import { getAccessToken } from './auth';

async function getJson<T>(url: string, token: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...headers } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---------- Google ----------

interface GCalList {
  items: { id: string; summary: string; selected?: boolean; primary?: boolean; accessRole: string }[];
}
interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}
interface GEvents {
  items: GEvent[];
  nextPageToken?: string;
}

export async function googleAccount(): Promise<string> {
  const token = await getAccessToken('google');
  const me = await getJson<{ email?: string }>('https://openidconnect.googleapis.com/v1/userinfo', token);
  return me.email ?? 'Google account';
}

export async function fetchGoogleEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const token = await getAccessToken('google');
  const list = await getJson<GCalList>(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
    token,
  );
  // Calendars shown in Google Calendar (checked) count as busy time.
  const cals = list.items.filter((c) => c.primary || c.selected);
  const out: CalendarEvent[] = [];
  for (const cal of cals) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`;
      const page = await getJson<GEvents>(url, token);
      for (const e of page.items) {
        if (e.status === 'cancelled') continue;
        const me = e.attendees?.find((a) => a.self);
        if (me?.responseStatus === 'declined') continue;
        const allDay = !e.start.dateTime;
        out.push({
          id: `google:${cal.id}:${e.id}`,
          title: e.summary || '(busy)',
          start: allDay ? new Date(`${e.start.date}T00:00:00`).toISOString() : e.start.dateTime!,
          end: allDay ? new Date(`${e.end.date}T00:00:00`).toISOString() : e.end.dateTime!,
          allDay,
          source: 'google',
          busy: e.transparency !== 'transparent',
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return out;
}

// ---------- Microsoft (Outlook / Microsoft 365) ----------

interface MsEvent {
  id: string;
  subject?: string;
  isAllDay: boolean;
  isCancelled?: boolean;
  showAs?: string;
  responseStatus?: { response?: string };
  start: { dateTime: string };
  end: { dateTime: string };
}
interface MsPage {
  value: MsEvent[];
  '@odata.nextLink'?: string;
}

export async function microsoftAccount(): Promise<string> {
  const token = await getAccessToken('microsoft');
  const me = await getJson<{ mail?: string; userPrincipalName?: string }>(
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
    token,
  );
  return me.mail || me.userPrincipalName || 'Microsoft account';
}

export async function fetchMicrosoftEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const token = await getAccessToken('microsoft');
  const params = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: 'subject,start,end,isAllDay,isCancelled,showAs,responseStatus',
    $top: '200',
  });
  let url: string | undefined = `https://graph.microsoft.com/v1.0/me/calendarView?${params}`;
  const out: CalendarEvent[] = [];
  while (url) {
    const page: MsPage = await getJson<MsPage>(url, token, { Prefer: 'outlook.timezone="UTC"' });
    for (const e of page.value) {
      if (e.isCancelled || e.responseStatus?.response === 'declined') continue;
      out.push({
        id: `microsoft:${e.id}`,
        title: e.subject || '(busy)',
        // Graph returns UTC wall time without a zone suffix.
        start: new Date(`${e.start.dateTime.replace(/Z$/, '')}Z`).toISOString(),
        end: new Date(`${e.end.dateTime.replace(/Z$/, '')}Z`).toISOString(),
        allDay: e.isAllDay,
        source: 'microsoft',
        busy: e.showAs !== 'free' && e.showAs !== 'workingElsewhere',
      });
    }
    url = page['@odata.nextLink'];
  }
  return out;
}
