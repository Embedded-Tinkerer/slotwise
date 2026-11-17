// Bottom sheet with actions for a planned task block.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, fmtDateTime, fmtDuration, fmtTime, startOfDay } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS } from '../types';

export interface SheetTarget {
  taskId: string;
  start: number;
  end: number;
  pinned?: boolean;
}

export function BlockSheet({
  target,
  onClose,
  onEdit,
}: {
  target: SheetTarget | null;
  onClose: () => void;
  onEdit: (taskId: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { lookup, logProgress, completeTask, extendTask, snoozeTask, pinTask, now, plan, projects } = useStore();
  const task = target ? lookup(target.taskId) : undefined;
  if (!target || !task) return null;

  const blockMin = Math.round((target.end - target.start) / 60000);
  const recurring = !!task.recurrence;
  const project = projects.find((p) => p.id === task.projectId);
  const risk = plan.atRisk.includes(task.id);
  const tomorrow9 = new Date(addDays(startOfDay(now), 1));
  tomorrow9.setHours(9, 0, 0, 0);

  const act = (f: () => void) => () => {
    f();
    onClose();
  };

  const actions: { label: string; onPress: () => void; hidden?: boolean; tone?: 'accent' | 'muted' }[] = [
    {
      label: recurring ? 'Done' : `Did this block (${fmtDuration(blockMin)})`,
      onPress: act(() => logProgress(task.id, blockMin)),
      tone: 'accent',
    },
    { label: 'Whole task finished', onPress: act(() => completeTask(task.id)), hidden: recurring },
    { label: 'Need 30 more minutes', onPress: act(() => extendTask(task.id, 30)), hidden: recurring },
    {
      label: target.pinned ? 'Unpin (let Slotwise move it)' : `Pin to ${fmtTime(target.start)}`,
      onPress: act(() => pinTask(task.id, target.pinned ? undefined : new Date(target.start).toISOString())),
      hidden: recurring,
    },
    {
      label: recurring ? 'Skip this time' : 'Not today (move to tomorrow)',
      onPress: act(() => snoozeTask(task.id, tomorrow9.toISOString())),
    },
    { label: 'Edit task', onPress: act(() => onEdit(task.id)), hidden: recurring, tone: 'muted' },
  ];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: 16 + insets.bottom }]}>
          <View style={[styles.grab, { backgroundColor: t.border }]} />
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{task.title}</Text>
          <Text style={{ color: t.textMuted, marginTop: 2 }}>
            {fmtTime(target.start)} to {fmtTime(target.end)} ·{' '}
            <Text style={{ color: PRIORITY_COLORS[task.priority] }}>{PRIORITY_LABELS[task.priority]}</Text>
            {project ? ` · ${project.name}` : ''}
            {recurring ? ' · repeats' : ''}
          </Text>
          {task.deadline && !recurring && (
            <Text style={{ color: risk ? t.warn : t.textMuted, marginTop: 2 }}>
              {task.hardDeadline ? 'Hard deadline' : 'Due'} {fmtDateTime(task.deadline)}
              {risk ? ' · at risk' : ''}
            </Text>
          )}
          <View style={{ marginTop: 12 }}>
            {actions
              .filter((a) => !a.hidden)
              .map((a) => (
                <Pressable
                  key={a.label}
                  onPress={a.onPress}
                  style={({ pressed }) => [styles.action, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text
                    style={{
                      color: a.tone === 'accent' ? t.accent : a.tone === 'muted' ? t.textMuted : t.text,
                      fontSize: 16,
                      fontWeight: a.tone === 'accent' ? '800' : '600',
                    }}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  action: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
