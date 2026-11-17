import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimeField } from '../components/DateTimeField';
import { Button, Chip, Label } from '../components/ui';
import { fmtDuration } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS, type Priority, type Task } from '../types';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export default function TaskEditor({
  task,
  visible,
  onClose,
}: {
  task?: Task;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const { saveTask, deleteTask, completeTask } = useStore();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [durationMin, setDuration] = useState(task?.durationMin ?? 60);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 3);
  const [deadline, setDeadline] = useState<string | undefined>(task?.deadline);
  const [startAfter, setStartAfter] = useState<string | undefined>(task?.startAfter);
  const [splittable, setSplittable] = useState(task?.splittable ?? true);

  const save = () => {
    if (!title.trim()) return;
    saveTask({
      id: task?.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      durationMin,
      priority,
      deadline,
      startAfter,
      splittable,
      // Never leave more logged progress than the new duration allows.
      doneMin: Math.min(task?.doneMin ?? 0, durationMin),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.header, { borderColor: t.border }]}>
          <Text style={[styles.headerText, { color: t.text }]}>{task ? 'Edit task' : 'New task'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {task?.external && (
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              Synced from Google Tasks{task.external.listTitle ? ` (${task.external.listTitle})` : ''}. Title, notes and
              due date update from Google on each sync; set how long it takes and its priority here. Finishing it
              here ticks it off in Google Tasks.
            </Text>
          )}
          <Label>What needs doing?</Label>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Draft quarterly report"
            placeholderTextColor={t.textMuted}
            autoFocus={!task}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />

          <Label>How long will it take?</Label>
          <View style={styles.wrap}>
            {DURATIONS.map((d) => (
              <Chip key={d} label={fmtDuration(d)} selected={durationMin === d} onPress={() => setDuration(d)} />
            ))}
          </View>
          <View style={styles.stepper}>
            <Button kind="secondary" label="−15m" onPress={() => setDuration(Math.max(15, durationMin - 15))} />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{fmtDuration(durationMin)}</Text>
            <Button kind="secondary" label="+15m" onPress={() => setDuration(durationMin + 15)} />
          </View>

          <Label>Priority</Label>
          <View style={styles.wrap}>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <Chip
                key={p}
                label={PRIORITY_LABELS[p]}
                color={PRIORITY_COLORS[p]}
                selected={priority === p}
                onPress={() => setPriority(p)}
              />
            ))}
          </View>

          <Label>Deadline</Label>
          <DateTimeField value={deadline} onChange={setDeadline} />

          <Label>Don't start before</Label>
          <DateTimeField value={startAfter} onChange={setStartAfter} defaultHour={9} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Can be split into smaller blocks</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>Blocks are at least 30 minutes long.</Text>
            </View>
            <Switch value={splittable} onValueChange={setSplittable} />
          </View>

          <Label>Notes</Label>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top', color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />

          {task && (
            <View style={{ marginTop: 20, gap: 10 }}>
              <Button
                kind="secondary"
                label={task.completed ? 'Mark as not done' : 'Mark as done'}
                onPress={() => {
                  completeTask(task.id, !task.completed);
                  onClose();
                }}
              />
              <Button
                kind="danger"
                label="Delete task"
                onPress={() => {
                  deleteTask(task.id);
                  onClose();
                }}
              />
            </View>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderColor: t.border, backgroundColor: t.bg }]}>
          <Button kind="secondary" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" onPress={save} disabled={!title.trim()} style={{ flex: 1 }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerText: { fontSize: 18, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 40 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
});
