import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { fmtDateTime, fmtDuration } from '../format';
import { compareTasks, remainingMinutes } from '../scheduler';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS, type Task } from '../types';
import TaskEditor from './TaskEditor';

export default function TasksScreen() {
  const t = useTheme();
  const { tasks, plan, completeTask } = useStore();
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);

  const firstBlock = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of plan.blocks) if (!m.has(b.taskId)) m.set(b.taskId, b.start);
    return m;
  }, [plan.blocks]);

  const open = tasks.filter((x) => !x.completed).sort(compareTasks);
  const done = tasks.filter((x) => x.completed);

  const renderTask = (task: Task) => {
    const risk = plan.atRisk.includes(task.id);
    const unscheduled = plan.unscheduled.find((u) => u.taskId === task.id);
    const next = firstBlock.get(task.id);
    const finish = plan.finishBy[task.id];
    return (
      <Pressable key={task.id} onPress={() => setEditing(task)}>
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
              {task.title}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              {PRIORITY_LABELS[task.priority]} · {fmtDuration(remainingMinutes(task))}
              {task.doneMin > 0 && !task.completed ? ` left of ${fmtDuration(task.durationMin)}` : ''}
              {task.deadline ? ` · due ${fmtDateTime(task.deadline)}` : ''}
            </Text>
            {!task.completed && (
              <Text style={{ color: risk || unscheduled ? t.warn : t.accent, fontSize: 13, marginTop: 2 }}>
                {unscheduled
                  ? `${fmtDuration(unscheduled.remainingMin)} could not be scheduled`
                  : next
                    ? `Starts ${fmtDateTime(next)}${finish ? `, done by ${fmtDateTime(finish)}` : ''}`
                    : ''}
                {risk ? ' · may miss deadline' : ''}
              </Text>
            )}
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        {open.length === 0 && (
          <Card>
            <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>No open tasks</Text>
            <Text style={{ color: t.textMuted }}>
              Add a task with how long it takes, its priority and deadline. Slotwise finds time for it around your
              meetings and moves it if you fall behind.
            </Text>
          </Card>
        )}
        {open.map(renderTask)}
        {done.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionTitle>Completed ({done.length})</SectionTitle>
              <Chip label={showDone ? 'Hide' : 'Show'} onPress={() => setShowDone(!showDone)} />
            </View>
            {showDone && done.map(renderTask)}
          </>
        )}
      </ScrollView>
      <View style={[styles.fabWrap, { backgroundColor: t.bg, borderColor: t.border }]}>
        <Button label="+ Add task" onPress={() => setEditing('new')} />
      </View>
      {editing && (
        <TaskEditor
          visible
          task={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
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
  fabWrap: { padding: 16, borderTopWidth: 1 },
});
