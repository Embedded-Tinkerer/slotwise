// Core data types shared by the scheduler, storage and UI.

/** 1 = ASAP, 2 = High, 3 = Medium, 4 = Low */
export type Priority = 1 | 2 | 3 | 4;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'ASAP',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/** Which set of hours a task may be scheduled in. */
export type ScheduleId = 'work' | 'personal';

export const SCHEDULE_LABELS: Record<ScheduleId, string> = {
  work: 'Work hours',
  personal: 'Personal hours',
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
  /** Hard deadlines are scheduled ahead of everything except ASAP work. */
  hardDeadline?: boolean;
  /** ISO timestamp before which the task must not be scheduled. */
  startAfter?: string;
  /** Pin the task to this exact start time instead of auto-scheduling it. */
  pinnedStart?: string;
  /** Whether the scheduler may split the task across several blocks. */
  splittable: boolean;
  /** Smallest block the task can be split into, in minutes. */
  minChunkMin: number;
  /** Work or personal hours. Defaults to work. */
  schedule?: ScheduleId;
  projectId?: string;
  /** Position inside the project; lower comes first. */
  order?: number;
  labels?: string[];
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  /** Set when the task was imported from Google Tasks. */
  external?: { source: 'googleTasks'; listId: string; taskId: string; listTitle?: string };
  /** Set on task instances generated from a recurring rule (never stored). */
  recurrence?: { ruleId: string; key: string };
  /** Only schedule inside this time-of-day window (minutes after midnight). */
  window?: { startMin: number; endMin: number };
}

export interface Project {
  id: string;
  name: string;
  color: string;
  deadline?: string;
  hardDeadline?: boolean;
  /** When true, each step can only start after the previous one is done. */
  sequential: boolean;
  schedule: ScheduleId;
  priority: Priority;
  archived?: boolean;
  createdAt: string;
}

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'timesPerWeek';

export type TimeOfDay = 'any' | 'morning' | 'afternoon' | 'evening';


/** A task that repeats, such as a habit or a weekly chore. */
export interface RecurringRule {
  id: string;
  title: string;
  durationMin: number;
  priority: Priority;
  schedule: ScheduleId;
  freq: RecurrenceFreq;
  /** For 'weekly': which days (0 = Sunday). */
  daysOfWeek?: number[];
  /** For 'timesPerWeek'. */
  timesPerWeek?: number;
  timeOfDay: TimeOfDay;
  /** Occurrence keys that are done (YYYY-MM-DD, or YYYY-MM-DD#n for times per week). */
  done: string[];
  /** Occurrence keys skipped this time. */
  skipped?: string[];
  paused?: boolean;
  createdAt: string;
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
  pinned?: boolean;
}

export interface WorkDay {
  enabled: boolean;
  /** Minutes after midnight. */
  startMin: number;
  endMin: number;
}

export type WriteBackGoogle = 'off' | 'personal' | 'all';
export type WriteBackOutlook = 'off' | 'work' | 'all';

export interface Settings {
  /** Index 0 = Sunday ... 6 = Saturday. */
  schedules: Record<ScheduleId, WorkDay[]>;
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
  /** Put planned task blocks on a "Slotwise" calendar. */
  writeGoogle: WriteBackGoogle;
  writeOutlook: WriteBackOutlook;
  /** Minutes before a block starts to notify; -1 turns reminders off. */
  notifyMin: number;
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

const day = (enabled: boolean, startH: number, endH: number): WorkDay => ({
  enabled,
  startMin: startH * 60,
  endMin: endH * 60,
});

export const DEFAULT_SETTINGS: Settings = {
  schedules: {
    work: [
      day(false, 9, 17),
      day(true, 9, 17),
      day(true, 9, 17),
      day(true, 9, 17),
      day(true, 9, 17),
      day(true, 9, 17),
      day(false, 9, 17),
    ],
    personal: [
      day(true, 9, 18),
      day(true, 18, 21),
      day(true, 18, 21),
      day(true, 18, 21),
      day(true, 18, 21),
      day(true, 18, 21),
      day(true, 9, 18),
    ],
  },
  horizonDays: 14,
  bufferMin: 0,
  slotMin: 15,
  googleTasks: true,
  geminiModel: 'gemini-flash-latest',
  writeGoogle: 'off',
  writeOutlook: 'off',
  notifyMin: 5,
};

export const PROJECT_COLORS = ['#0F766E', '#7C3AED', '#DB2777', '#EA580C', '#2563EB', '#65A30D', '#0891B2', '#9333EA'];
