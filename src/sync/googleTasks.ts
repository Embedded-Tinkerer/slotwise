// Google Tasks: import open tasks as schedulable Slotwise tasks, and tick
// them off in Google when they are finished here.

import { getAccessToken } from './auth';
import type { GoogleTaskItem } from './googleTasksMerge';

export { mergeGoogleTasks } from './googleTasksMerge';

const BASE = 'https://tasks.googleapis.com/tasks/v1';

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Google Tasks HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function fetchGoogleTasks(): Promise<GoogleTaskItem[]> {
  const token = await getAccessToken('google');
  const lists = await call<{ items?: { id: string; title: string }[] }>(token, `${BASE}/users/@me/lists?maxResults=100`);
  const out: GoogleTaskItem[] = [];
  for (const list of lists.items ?? []) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ showCompleted: 'false', showHidden: 'false', maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await call<{
        items?: { id: string; title?: string; notes?: string; due?: string; status: string; deleted?: boolean }[];
        nextPageToken?: string;
      }>(token, `${BASE}/lists/${encodeURIComponent(list.id)}/tasks?${params}`);
      for (const t of page.items ?? []) {
        if (t.deleted || t.status === 'completed' || !t.title?.trim()) continue;
        out.push({ id: t.id, listId: list.id, listTitle: list.title, title: t.title.trim(), notes: t.notes, due: t.due });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return out;
}

export async function setGoogleTaskDone(listId: string, taskId: string, done: boolean): Promise<void> {
  const token = await getAccessToken('google');
  await call(token, `${BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(done ? { status: 'completed' } : { status: 'needsAction', completed: null }),
  });
}
