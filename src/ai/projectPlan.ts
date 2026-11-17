// Prompt, schema and validation for AI project planning: turn a project
// description into ordered steps with effort estimates. Pure TypeScript.

import type { Priority } from '../types';

// Kept local (not imported from ./parse) so this file runs in Node tests as is.
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  const tz = `${off >= 0 ? '+' : '-'}${p(Math.floor(a / 60))}:${p(a % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${tz}`;
}

export interface ProjectPlanInput {
  description: string;
  deadline?: string;
  existingSteps?: { title: string; durationMin: number; completed: boolean }[];
  projectName?: string;
}

export interface PlannedStep {
  title: string;
  durationMin: number;
  notes?: string;
  priority: Priority;
  splittable: boolean;
}

export interface ProjectPlan {
  name: string;
  sequential: boolean;
  steps: PlannedStep[];
  summary?: string;
}

export const PROJECT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Short project name' },
    summary: { type: 'STRING', description: 'One or two sentences on the approach' },
    sequential: { type: 'BOOLEAN', description: 'True if steps must be done in the listed order' },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          durationMin: { type: 'INTEGER', description: 'Focused effort in minutes' },
          notes: { type: 'STRING', description: 'What done looks like, or key details' },
          priority: { type: 'INTEGER', description: '1 ASAP, 2 High, 3 Medium, 4 Low' },
          splittable: { type: 'BOOLEAN', description: 'False if it must be done in one sitting' },
        },
        required: ['title', 'durationMin'],
      },
    },
  },
  required: ['name', 'steps', 'sequential'],
};

export function buildProjectPrompt(input: ProjectPlanInput, now: Date): string {
  const lines = [
    'You are planning a project for one person who uses a planner app that auto-schedules',
    'tasks into their free time. Break the project into concrete, actionable steps.',
    `Current local time: ${localIso(now)}.`,
  ];
  if (input.deadline) lines.push(`The project must be finished by ${localIso(new Date(input.deadline))}.`);
  if (input.projectName) lines.push(`Project name: ${input.projectName}`);
  if (input.existingSteps?.length) {
    lines.push('', 'The project already has these steps (do not repeat them; only add what is missing):');
    for (const s of input.existingSteps) {
      lines.push(`- ${s.title} (${s.durationMin} min${s.completed ? ', done' : ''})`);
    }
  }
  lines.push(
    '',
    'Rules:',
    '- 3 to 15 steps, in the order they should be done. Each step is one sitting or a few sittings of',
    '  focused work, named with a verb ("Draft test plan", "Order parts").',
    '- durationMin is realistic focused effort, rounded to 15 minutes, between 15 and 480.',
    '  Don\'t count waiting time (shipping, reviews by others) as effort; add a short step for',
    '  following up instead.',
    '- sequential is true unless the steps are genuinely independent.',
    '- priority: 3 by default, 2 for steps on the critical path to a tight deadline.',
    '- notes: one short line on what "done" means.',
    '- If a deadline is given and the total effort clearly cannot fit, still plan the work but',
    '  say so in summary.',
    '',
    'Project description:',
    input.description,
  );
  return lines.join('\n');
}

export function toProjectPlan(raw: unknown): ProjectPlan {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const steps: PlannedStep[] = [];
  for (const s of Array.isArray(obj.steps) ? obj.steps : []) {
    const x = s as Record<string, unknown>;
    const title = typeof x.title === 'string' ? x.title.trim() : '';
    if (!title) continue;
    const dur = Math.round(Number(x.durationMin) / 15) * 15;
    const pr = Math.round(Number(x.priority));
    steps.push({
      title,
      durationMin: Number.isFinite(dur) ? Math.min(Math.max(dur, 15), 8 * 60) : 60,
      notes: typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim() : undefined,
      priority: (pr >= 1 && pr <= 4 ? pr : 3) as Priority,
      splittable: x.splittable !== false,
    });
  }
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'New project',
    sequential: obj.sequential !== false,
    summary: typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : undefined,
    steps: steps.slice(0, 25),
  };
}
