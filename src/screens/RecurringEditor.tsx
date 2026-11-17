import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, Label } from '../components/ui';
import { fmtDuration } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import {
  PRIORITY_LABELS,
  SCHEDULE_LABELS,
  type Priority,
  type RecurrenceFreq,
  type RecurringRule,
  type ScheduleId,
  type TimeOfDay,
} from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FREQS: { id: RecurrenceFreq; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'On certain days' },
  { id: 'timesPerWeek', label: 'X times a week' },
];
const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

export function describeRule(r: RecurringRule): string {
  const when =
    r.freq === 'daily'
      ? 'Every day'
      : r.freq === 'weekdays'
        ? 'Weekdays'
        : r.freq === 'weekly'
          ? (r.daysOfWeek ?? []).sort().map((d) => DAY_NAMES[d]).join(', ') || 'No days picked'
          : `${r.timesPerWeek ?? 1}× a week`;
  const tod = r.timeOfDay === 'any' ? '' : ` · ${r.timeOfDay}`;
  return `${when} · ${fmtDuration(r.durationMin)}${tod}`;
}

export default function RecurringEditor({ rule, onClose }: { rule?: RecurringRule; onClose: () => void }) {
  const t = useTheme();
  const { saveRule, deleteRule } = useStore();
  const [title, setTitle] = useState(rule?.title ?? '');
  const [durationMin, setDuration] = useState(rule?.durationMin ?? 30);
  const [freq, setFreq] = useState<RecurrenceFreq>(rule?.freq ?? 'daily');
  const [days, setDays] = useState<number[]>(rule?.daysOfWeek ?? [1]);
  const [times, setTimes] = useState(rule?.timesPerWeek ?? 3);
  const [timeOfDay, setTod] = useState<TimeOfDay>(rule?.timeOfDay ?? 'any');
  const [priority, setPriority] = useState<Priority>(rule?.priority ?? 3);
  const [schedule, setSchedule] = useState<ScheduleId>(rule?.schedule ?? 'personal');
  const [paused, setPaused] = useState(rule?.paused ?? false);

  const save = () => {
    if (!title.trim()) return;
    saveRule({
      id: rule?.id,
      title: title.trim(),
      durationMin,
      freq,
      daysOfWeek: freq === 'weekly' ? days : undefined,
      timesPerWeek: freq === 'timesPerWeek' ? times : undefined,
      timeOfDay,
      priority,
      schedule,
      paused,
    });
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.header, { borderColor: t.border }]}>
          <Text style={[styles.headerText, { color: t.text }]}>{rule ? 'Edit recurring task' : 'New recurring task'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Label>What repeats?</Label>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Gym, Inbox zero, Weekly report"
            placeholderTextColor={t.textMuted}
            autoFocus={!rule}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <Label>How often?</Label>
          <View style={styles.wrap}>
            {FREQS.map((f) => (
              <Chip key={f.id} label={f.label} selected={freq === f.id} onPress={() => setFreq(f.id)} />
            ))}
          </View>
          {freq === 'weekly' && (
            <View style={styles.wrap}>
              {DAY_NAMES.map((n, i) => (
                <Chip
                  key={n}
                  label={n}
                  selected={days.includes(i)}
                  onPress={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])}
                />
              ))}
            </View>
          )}
          {freq === 'timesPerWeek' && (
            <View style={styles.wrap}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} label={`${n}×`} selected={times === n} onPress={() => setTimes(n)} />
              ))}
            </View>
          )}
          <Label>How long each time?</Label>
          <View style={styles.wrap}>
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <Chip key={d} label={fmtDuration(d)} selected={durationMin === d} onPress={() => setDuration(d)} />
            ))}
          </View>
          <Label>Time of day</Label>
          <View style={styles.wrap}>
            {TIMES.map((x) => (
              <Chip key={x.id} label={x.label} selected={timeOfDay === x.id} onPress={() => setTod(x.id)} />
            ))}
          </View>
          <Label>Hours</Label>
          <View style={styles.wrap}>
            {(['work', 'personal'] as ScheduleId[]).map((s) => (
              <Chip key={s} label={SCHEDULE_LABELS[s]} selected={schedule === s} onPress={() => setSchedule(s)} />
            ))}
          </View>
          <Label>Priority</Label>
          <View style={styles.wrap}>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <Chip key={p} label={PRIORITY_LABELS[p]} color={PRIORITY_COLORS[p]} selected={priority === p} onPress={() => setPriority(p)} />
            ))}
          </View>
          {rule && (
            <>
              <View style={styles.switchRow}>
                <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>Paused</Text>
                <Switch value={paused} onValueChange={setPaused} />
              </View>
              <Button
                kind="danger"
                label="Delete recurring task"
                onPress={() => {
                  deleteRule(rule.id);
                  onClose();
                }}
                style={{ marginTop: 20 }}
              />
            </>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderColor: t.border }]}>
          <Button kind="secondary" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            onPress={save}
            disabled={!title.trim() || (freq === 'weekly' && days.length === 0)}
            style={{ flex: 1 }}
          />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
});
