import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/ui';
import { addDays, fmtDay, fmtDuration, fmtTime, sameLocalDay, startOfDay } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, SOURCE_COLORS, SOURCE_LABELS, useTheme } from '../theme';
import { PRIORITY_LABELS, type CalendarEvent, type ScheduledBlock, type Task } from '../types';

type Item =
  | { kind: 'event'; start: number; end: number; event: CalendarEvent }
  | { kind: 'task'; start: number; end: number; block: ScheduledBlock; task: Task };

export default function PlanScreen() {
  const t = useTheme();
  const { plan, tasks, allEvents, now, syncAll, logProgress, completeTask, connections } = useStore();
  const [dayOffset, setDayOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const today = startOfDay(now);
  const day = addDays(today, dayOffset);
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    for (const e of allEvents) {
      if (e.allDay || !sameLocalDay(e.start, day)) continue;
      list.push({ kind: 'event', start: Date.parse(e.start), end: Date.parse(e.end), event: e });
    }
    for (const b of plan.blocks) {
      const task = taskById.get(b.taskId);
      if (!task || !sameLocalDay(b.start, day)) continue;
      list.push({ kind: 'task', start: Date.parse(b.start), end: Date.parse(b.end), block: b, task });
    }
    return list.sort((a, b) => a.start - b.start);
  }, [allEvents, plan.blocks, taskById, day]);

  const allDay = allEvents.filter((e) => e.allDay && sameLocalDay(e.start, day));
  const dueToday = tasks.filter((x) => x.deadline && sameLocalDay(x.deadline, day));
  const warnings = [
    ...plan.atRisk.map((id) => taskById.get(id)?.title).filter(Boolean),
  ] as string[];
  const unscheduledCount = plan.unscheduled.length;
  const focusMin = items.filter((i) => i.kind === 'task').reduce((s, i) => s + (i.end - i.start) / 60000, 0);

  const onTaskPress = (item: Extract<Item, { kind: 'task' }>) => {
    const blockMin = Math.round((item.end - item.start) / 60000);
    Alert.alert(item.task.title, `${fmtTime(item.start)} to ${fmtTime(item.end)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Did this block (${fmtDuration(blockMin)})`, onPress: () => logProgress(item.task.id, blockMin) },
      { text: 'Task finished', onPress: () => completeTask(item.task.id) },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    setRefreshing(false);
  };

  const connected = Object.values(connections).some((c) => c?.account);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.days}
      >
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(today, i);
          const selected = i === dayOffset;
          return (
            <Pressable
              key={i}
              onPress={() => setDayOffset(i)}
              style={[
                styles.day,
                { backgroundColor: selected ? t.accent : t.surface, borderColor: selected ? t.accent : t.border },
              ]}
            >
              <Text style={{ color: selected ? t.accentText : t.textMuted, fontSize: 12, fontWeight: '600' }}>
                {i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' })}
              </Text>
              <Text style={{ color: selected ? t.accentText : t.text, fontSize: 18, fontWeight: '700' }}>
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={[styles.heading, { color: t.text }]}>{fmtDay(day)}</Text>
        <Text style={{ color: t.textMuted, marginBottom: 12 }}>
          {fmtDuration(focusMin)} of task time planned
          {connected ? ' · pull down to sync calendars' : ''}
        </Text>

        {(warnings.length > 0 || unscheduledCount > 0) && (
          <View style={[styles.warn, { backgroundColor: t.warnBg }]}>
            {warnings.length > 0 && (
              <Text style={{ color: t.warn, fontWeight: '700' }}>
                May miss deadline: {warnings.join(', ')}
              </Text>
            )}
            {unscheduledCount > 0 && (
              <Text style={{ color: t.warn, marginTop: warnings.length ? 4 : 0 }}>
                {unscheduledCount} task{unscheduledCount > 1 ? 's' : ''} did not fit in the planning window.
              </Text>
            )}
          </View>
        )}

        {allDay.map((e) => (
          <View key={e.id} style={[styles.allDay, { backgroundColor: t.event }]}>
            <Text style={{ color: t.eventText, fontWeight: '600' }} numberOfLines={1}>
              All day · {e.title}
            </Text>
          </View>
        ))}

        {dueToday.length > 0 && (
          <View style={[styles.dueBox, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.dueHead, { color: t.textMuted }]}>Due this day</Text>
            {dueToday.map((task) => (
              <Pressable
                key={task.id}
                onPress={() => completeTask(task.id, !task.completed)}
                style={styles.dueRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed }}
              >
                <View
                  style={[
                    styles.dueCheck,
                    { borderColor: PRIORITY_COLORS[task.priority] },
                    task.completed && { backgroundColor: PRIORITY_COLORS[task.priority] },
                  ]}
                >
                  {task.completed && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>}
                </View>
                <Text
                  style={[
                    { flex: 1, color: t.text, fontWeight: '600' },
                    task.completed && { textDecorationLine: 'line-through', color: t.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
                {task.external && <Text style={[styles.badge, { color: SOURCE_COLORS.google }]}>Google Tasks</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {items.length === 0 && (
          <Card>
            <Text style={{ color: t.textMuted }}>
              Nothing planned for this day. Add tasks and they will be placed into your free working time.
            </Text>
          </Card>
        )}

        {items.map((item) => {
          const past = item.end <= now;
          const isNow = item.start <= now && now < item.end;
          if (item.kind === 'event') {
            const e = item.event;
            return (
              <View
                key={e.id + item.start}
                style={[styles.row, { backgroundColor: t.event, opacity: past ? 0.55 : 1 }]}
              >
                <View style={[styles.bar, { backgroundColor: SOURCE_COLORS[e.source] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.time, { color: t.eventText }]}>
                    {fmtTime(item.start)} to {fmtTime(item.end)}
                  </Text>
                  <Text style={[styles.title, { color: t.eventText }]} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <Text style={{ color: t.eventText, fontSize: 12, opacity: 0.8 }}>
                    {SOURCE_LABELS[e.source]}
                    {e.busy ? '' : ' · free'}
                  </Text>
                </View>
              </View>
            );
          }
          const risk = plan.atRisk.includes(item.task.id);
          return (
            <Pressable
              key={`${item.task.id}-${item.start}`}
              onPress={() => onTaskPress(item)}
              style={[
                styles.row,
                {
                  backgroundColor: t.surface,
                  borderColor: isNow ? t.accent : t.border,
                  borderWidth: isNow ? 2 : 1,
                  opacity: past ? 0.55 : 1,
                },
              ]}
            >
              <View style={[styles.bar, { backgroundColor: PRIORITY_COLORS[item.task.priority] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.time, { color: t.textMuted }]}>
                  {isNow ? 'Now · ' : ''}
                  {fmtTime(item.start)} to {fmtTime(item.end)}
                </Text>
                <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
                  {item.task.title}
                </Text>
                <Text style={{ color: risk ? t.warn : t.textMuted, fontSize: 12 }}>
                  {PRIORITY_LABELS[item.task.priority]}
                  {item.task.deadline ? ` · due ${fmtDay(item.task.deadline)} ${fmtTime(item.task.deadline)}` : ''}
                  {risk ? ' · at risk' : ''}
                  {item.task.external ? ' · Google Tasks' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  days: { paddingHorizontal: 16, paddingVertical: 10 },
  day: {
    width: 58,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginRight: 8,
  },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  warn: { borderRadius: 12, padding: 12, marginBottom: 12 },
  allDay: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  bar: { width: 4, borderRadius: 2 },
  dueBox: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  dueHead: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dueCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', marginVertical: 2 },
});
