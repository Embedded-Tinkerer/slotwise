import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { fmtDateTime, fmtDuration } from '../format';
import { compareTasks, remainingMinutes } from '../scheduler';
import { useStore } from '../store';
import { PRIORITY_COLORS, SOURCE_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS, type RecurringRule, type Task } from '../types';
import AIComposer from './AIComposer';
import RecurringEditor, { describeRule } from './RecurringEditor';
import TaskEditor from './TaskEditor';

type Filter = 'all' | 'work' | 'personal' | 'risk' | `label:${string}` | `project:${string}`;

export function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const t = useTheme();
  const { plan, completeTask, projects } = useStore();
  const risk = plan.atRisk.includes(task.id);
  const unscheduled = plan.unscheduled.find((u) => u.taskId === task.id);
  const next = plan.blocks.find((b) => b.taskId === task.id);
  const finish = plan.finishBy[task.id];
  const project = projects.find((p) => p.id === task.projectId);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.task}>
        <Pressable
          onPress={() => completeTask(task.id, !task.completed)}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.completed }}
          style={[
            styles.check,
            { borderColor: PRIORITY_COLORS[task.priority] },
            task.completed && { backgroundColor: PRIORITY_COLORS[task.priority] },
          ]}
        >
          {task.completed && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.title,
              { color: t.text },
              task.completed && { textDecorationLine: 'line-through', color: t.textMuted },
            ]}
          >
            {task.pinnedStart ? '📌 ' : ''}
            {task.title}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {PRIORITY_LABELS[task.priority]} · {fmtDuration(remainingMinutes(task))}
            {task.doneMin > 0 && !task.completed ? ` left of ${fmtDuration(task.durationMin)}` : ''}
            {task.deadline ? ` · ${task.hardDeadline ? 'hard deadline' : 'due'} ${fmtDateTime(task.deadline)}` : ''}
          </Text>
          {(project || task.external || task.labels?.length) && (
            <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              {project && <Text style={{ color: project.color }}>{project.name}  </Text>}
              {task.external && <Text style={{ color: SOURCE_COLORS.google }}>Google Tasks  </Text>}
              {task.labels?.map((l) => (
                <Text key={l} style={{ color: t.textMuted }}>
                  #{l}{' '}
                </Text>
              ))}
            </Text>
          )}
          {!task.completed && (
            <Text style={{ color: risk || unscheduled ? t.warn : t.accent, fontSize: 13, marginTop: 2 }}>
              {unscheduled
                ? `${fmtDuration(unscheduled.remainingMin)} could not be scheduled`
                : next
                  ? `Starts ${fmtDateTime(next.start)}${finish ? `, done by ${fmtDateTime(finish)}` : ''}`
                  : ''}
              {risk ? ' · may miss deadline' : ''}
            </Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

export default function TasksScreen() {
  const t = useTheme();
  const { tasks, plan, rules, projects, lookup } = useStore();
  const [tab, setTab] = useState<'tasks' | 'recurring'>('tasks');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [editingRule, setEditingRule] = useState<RecurringRule | 'new' | null>(null);
  const [composing, setComposing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const labels = useMemo(() => [...new Set(tasks.flatMap((x) => x.labels ?? []))].sort(), [tasks]);
  const liveProjects = projects.filter((p) => !p.archived);

  const matches = (x: Task) => {
    const q = query.trim().toLowerCase();
    if (q && !`${x.title} ${x.notes ?? ''} ${(x.labels ?? []).join(' ')}`.toLowerCase().includes(q)) return false;
    const sched = lookup(x.id)?.schedule ?? x.schedule ?? 'work';
    if (filter === 'work' || filter === 'personal') return sched === filter;
    if (filter === 'risk') return plan.atRisk.includes(x.id) || plan.unscheduled.some((u) => u.taskId === x.id);
    if (filter.startsWith('label:')) return (x.labels ?? []).includes(filter.slice(6));
    if (filter.startsWith('project:')) return x.projectId === filter.slice(8);
    return true;
  };

  const open = tasks.filter((x) => !x.completed && matches(x)).sort(compareTasks);
  const done = tasks
    .filter((x) => x.completed && matches(x))
    .sort((a, b) => Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt));

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]}>
        {(['tasks', 'recurring'] as const).map((x) => (
          <Pressable key={x} onPress={() => setTab(x)} style={[styles.segBtn, tab === x && { backgroundColor: t.surface }]}>
            <Text style={{ color: tab === x ? t.text : t.textMuted, fontWeight: '700' }}>
              {x === 'tasks' ? `Tasks (${tasks.filter((y) => !y.completed).length})` : `Recurring (${rules.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'tasks' ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks"
            placeholderTextColor={t.textMuted}
            style={[styles.search, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Work" selected={filter === 'work'} onPress={() => setFilter('work')} />
            <Chip label="Personal" selected={filter === 'personal'} onPress={() => setFilter('personal')} />
            <Chip label="At risk" selected={filter === 'risk'} color={t.warn} onPress={() => setFilter('risk')} />
            {liveProjects.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                color={p.color}
                selected={filter === `project:${p.id}`}
                onPress={() => setFilter(`project:${p.id}`)}
              />
            ))}
            {labels.map((l) => (
              <Chip key={l} label={`#${l}`} selected={filter === `label:${l}`} onPress={() => setFilter(`label:${l}`)} />
            ))}
          </ScrollView>

          {open.length === 0 && (
            <Card>
              <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>
                {tasks.length && (query || filter !== 'all') ? 'No matching tasks' : 'No open tasks'}
              </Text>
              <Text style={{ color: t.textMuted }}>
                Add a task with how long it takes, its priority and deadline. Slotwise finds time for it around your
                meetings and moves it if you fall behind.
              </Text>
            </Card>
          )}
          {open.map((x) => (
            <TaskRow key={x.id} task={x} onPress={() => setEditing(x)} />
          ))}
          {done.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionTitle>Completed ({done.length})</SectionTitle>
                <Chip label={showDone ? 'Hide' : 'Show'} onPress={() => setShowDone(!showDone)} />
              </View>
              {showDone && done.map((x) => <TaskRow key={x.id} task={x} onPress={() => setEditing(x)} />)}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {rules.length === 0 && (
            <Card>
              <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>No recurring tasks yet</Text>
              <Text style={{ color: t.textMuted }}>
                Habits and routines like "Gym 3 times a week" or "Weekly report every Friday". Slotwise finds a slot for
                each one and spreads them across the week.
              </Text>
            </Card>
          )}
          {rules.map((r) => {
            const upcoming = plan.blocks.find((b) => lookup(b.taskId)?.recurrence?.ruleId === r.id);
            return (
              <Pressable key={r.id} onPress={() => setEditingRule(r)}>
                <Card style={{ opacity: r.paused ? 0.5 : 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>↻ {r.title}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>
                    {describeRule(r)}
                    {r.paused ? ' · paused' : ''}
                  </Text>
                  {upcoming && !r.paused && (
                    <Text style={{ color: t.accent, fontSize: 13, marginTop: 2 }}>Next: {fmtDateTime(upcoming.start)}</Text>
                  )}
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.fabWrap, { backgroundColor: t.bg, borderColor: t.border }]}>
        {tab === 'tasks' ? (
          <>
            <Button kind="secondary" label="✦ Add with AI" onPress={() => setComposing(true)} style={{ flex: 1 }} />
            <Button label="+ Add task" onPress={() => setEditing('new')} style={{ flex: 1 }} />
          </>
        ) : (
          <Button label="+ Add recurring task" onPress={() => setEditingRule('new')} style={{ flex: 1 }} />
        )}
      </View>
      {composing && <AIComposer visible onClose={() => setComposing(false)} />}
      {editing && (
        <TaskEditor
          visible
          task={editing === 'new' ? undefined : editing}
          defaults={filter.startsWith('project:') ? { projectId: filter.slice(8) } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {editingRule && (
        <RecurringEditor rule={editingRule === 'new' ? undefined : editingRule} onClose={() => setEditingRule(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, marginHorizontal: 16, marginTop: 6 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  content: { padding: 16, paddingBottom: 32 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
  task: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  fabWrap: { padding: 16, borderTopWidth: 1, flexDirection: 'row', gap: 12 },
});
