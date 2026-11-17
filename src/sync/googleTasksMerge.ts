// Pure merge logic for Google Tasks (no React Native imports, unit tested).

import type { Task } from '../types';

export interface GoogleTaskItem {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  notes?: string;
  /** Google Tasks only stores a date; the time part is always midnight UTC. */
  due?: string;
}

/** Google's due date (midnight UTC) as the end of that local day's work, 5 PM. */
export function dueToDeadline(due: string): string {
  const [y, m, d] = due.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 17, 0, 0, 0).toISOString();
}

const DEFAULT_IMPORT_MIN = 30;

/**
 * Merges Google Tasks into the local task list. Durations, priorities and
 * other Slotwise-only fields the user set are kept. Imported tasks that are
 * no longer open in Google are marked completed. Tasks the user deleted here
 * (listed in `ignored`) are not re-imported.
 */
export function mergeGoogleTasks(
  tasks: Task[],
  remote: GoogleTaskItem[],
  ignored: string[],
  newId: () => string,
  nowIso: string,
): Task[] {
  const byRemoteId = new Map(remote.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const merged = tasks.map((t) => {
    if (t.external?.source !== 'googleTasks') return t;
    const r = byRemoteId.get(t.external.taskId);
    if (!r) return t.completed ? t : { ...t, completed: true };
    seen.add(r.id);
    return {
      ...t,
      title: r.title,
      notes: r.notes,
      deadline: r.due ? dueToDeadline(r.due) : undefined,
      // Keep a local completion; the store pushes it to Google.
      completed: t.completed,
      external: { ...t.external, listId: r.listId, listTitle: r.listTitle },
    };
  });
  for (const r of remote) {
    if (seen.has(r.id) || ignored.includes(r.id)) continue;
    merged.push({
      id: newId(),
      title: r.title,
      notes: r.notes,
      durationMin: DEFAULT_IMPORT_MIN,
      doneMin: 0,
      priority: r.due ? 3 : 4,
      deadline: r.due ? dueToDeadline(r.due) : undefined,
      splittable: true,
      minChunkMin: 30,
      completed: false,
      createdAt: nowIso,
      external: { source: 'googleTasks', listId: r.listId, taskId: r.id, listTitle: r.listTitle },
    });
  }
  return merged;
}
