// Core data types shared by the scheduler, storage and UI.

/** 1 = ASAP, 2 = High, 3 = Medium, 4 = Low */
export type Priority = 1 | 2 | 3 | 4;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'ASAP',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

export interface Task {
  id: string;
  title: string;
  notes?: string;
  /** Total effort in minutes. */
  durationMin: number;
  /** Minutes already worked (logged when a block is marked done). */
  doneMin: number;
  priority: Priority;
  /** ISO timestamp the task must be finished by. */
  deadline?: string;
  /** ISO timestamp before which the task must not be scheduled. */
  startAfter?: string;
  /** Whether the scheduler may split the task across several blocks. */
  splittable: boolean;
  /** Smallest block the task can be split into, in minutes. */
  minChunkMin: number;
  completed: boolean;
  createdAt: string;
  /** Set when the task was imported from Google Tasks. */
  external?: { source: 'googleTasks'; listId: string; taskId: string; listTitle?: string };
}

export type EventSource = 'local' | 'google' | 'microsoft';

/** A fixed calendar commitment the scheduler must work around. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  source: EventSource;
  /** Free/transparent events do not block time. */
  busy: boolean;
}

/** One block of time the scheduler assigned to a task. */
export interface ScheduledBlock {
  taskId: string;
  start: string; // ISO
  end: string; // ISO
}

export interface WorkDay {
  enabled: boolean;
  /** Minutes after midnight. */
  startMin: number;
  endMin: number;
}

export interface Settings {
  /** Index 0 = Sunday ... 6 = Saturday. */
  workWeek: WorkDay[];
  /** How many days ahead to schedule. */
  horizonDays: number;
  /** Gap kept free after every meeting, in minutes. */
  bufferMin: number;
  /** Snap block starts to this many minutes. */
  slotMin: number;
  /** Import Google Tasks as schedulable tasks when Google is connected. */
  googleTasks: boolean;
  /** Gemini model used by "Add with AI". */
  geminiModel: string;
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  /** Tasks whose planned finish is later than their deadline. */
  atRisk: string[];
  /** Tasks that could not be fully placed within the horizon. */
  unscheduled: { taskId: string; remainingMin: number }[];
  /** Planned finish per task id (ISO). */
  finishBy: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  workWeek: [
    { enabled: false, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: true, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: true, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: true, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: true, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: true, startMin: 9 * 60, endMin: 17 * 60 },
    { enabled: false, startMin: 9 * 60, endMin: 17 * 60 },
  ],
  horizonDays: 14,
  bufferMin: 0,
  slotMin: 15,
  googleTasks: true,
  geminiModel: 'gemini-flash-latest',
};
