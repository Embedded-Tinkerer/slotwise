import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimeField } from '../components/DateTimeField';
import { Button, Chip, Label } from '../components/ui';
import { fmtDuration } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS, SCHEDULE_LABELS, type Priority, type ScheduleId, type Task } from '../types';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

function ToggleRow({ title, hint, value, onChange }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '600' }}>{title}</Text>
        {hint && <Text style={{ color: t.textMuted, fontSize: 13 }}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export default function TaskEditor({
  task,
  defaults,
  visible,
  onClose,
}: {
  task?: Task;
  defaults?: Partial<Task>;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const { saveTask, deleteTask, completeTask, projects, tasks } = useStore();
  const init = { ...defaults, ...task };
  const [title, setTitle] = useState(init.title ?? '');
  const [notes, setNotes] = useState(init.notes ?? '');
  const [durationMin, setDuration] = useState(init.durationMin ?? 60);
  const [priority, setPriority] = useState<Priority>(init.priority ?? 3);
  const [deadline, setDeadline] = useState<string | undefined>(init.deadline);
  const [hardDeadline, setHard] = useState(init.hardDeadline ?? false);
  const [startAfter, setStartAfter] = useState<string | undefined>(init.startAfter);
  const [pinnedStart, setPinned] = useState<string | undefined>(init.pinnedStart);
  const [splittable, setSplittable] = useState(init.splittable ?? true);
  const [projectId, setProjectId] = useState<string | undefined>(init.projectId);
  const project = projects.find((p) => p.id === projectId);
  const [schedule, setSchedule] = useState<ScheduleId | undefined>(init.schedule);
  const [labels, setLabels] = useState<string[]>(init.labels ?? []);
  const [labelText, setLabelText] = useState('');

  const knownLabels = useMemo(
    () => [...new Set(tasks.flatMap((x) => x.labels ?? []))].filter((l) => !labels.includes(l)).sort(),
    [tasks, labels],
  );
  const effectiveSchedule: ScheduleId = schedule ?? project?.schedule ?? (task?.external ? 'personal' : 'work');

  const addLabel = (l: string) => {
    const v = l.trim().replace(/^#/, '');
    if (v && !labels.includes(v)) setLabels([...labels, v]);
    setLabelText('');
  };

  const save = () => {
    if (!title.trim()) return;
    saveTask({
      id: task?.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      durationMin,
      priority,
      deadline,
      hardDeadline: deadline ? hardDeadline : undefined,
      startAfter,
      pinnedStart,
      splittable,
      projectId,
      schedule: effectiveSchedule,
      labels: labels.length ? labels : undefined,
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

          <Label>When can it happen?</Label>
          <View style={styles.wrap}>
            {(['work', 'personal'] as ScheduleId[]).map((s) => (
              <Chip key={s} label={SCHEDULE_LABELS[s]} selected={effectiveSchedule === s} onPress={() => setSchedule(s)} />
            ))}
          </View>

          {projects.some((p) => !p.archived) && (
            <>
              <Label>Project</Label>
              <View style={styles.wrap}>
                <Chip label="None" selected={!projectId} onPress={() => setProjectId(undefined)} />
                {projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <Chip key={p.id} label={p.name} color={p.color} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
                  ))}
              </View>
            </>
          )}

          <Label>Deadline{project?.deadline && !deadline ? ' (uses the project deadline)' : ''}</Label>
          <DateTimeField value={deadline} onChange={setDeadline} />
          {deadline && (
            <ToggleRow
              title="Hard deadline"
              hint="Scheduled ahead of everything except ASAP work."
              value={hardDeadline}
              onChange={setHard}
            />
          )}

          <Label>Don't start before</Label>
          <DateTimeField value={startAfter} onChange={setStartAfter} defaultHour={9} />

          <Label>Pin to a fixed time</Label>
          <DateTimeField value={pinnedStart} onChange={setPinned} defaultHour={9} />

          <ToggleRow
            title="Can be split into smaller blocks"
            hint="Blocks are at least 30 minutes long."
            value={splittable}
            onChange={setSplittable}
          />

          <Label>Labels</Label>
          <View style={styles.wrap}>
            {labels.map((l) => (
              <Chip key={l} label={`#${l} ✕`} selected onPress={() => setLabels(labels.filter((x) => x !== l))} />
            ))}
            {knownLabels.map((l) => (
              <Chip key={l} label={`#${l}`} onPress={() => addLabel(l)} />
            ))}
          </View>
          <TextInput
            value={labelText}
            onChangeText={(v) => (v.endsWith(',') || v.endsWith(' ') ? addLabel(v.slice(0, -1)) : setLabelText(v))}
            onSubmitEditing={() => addLabel(labelText)}
            placeholder="Add a label, e.g. errands"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />

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
