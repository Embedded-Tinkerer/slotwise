import React, { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BlockSheet, type SheetTarget } from '../components/BlockSheet';
import { Timeline, type TimelineItem } from '../components/Timeline';
import { Card } from '../components/ui';
import { addDays, fmtDay, fmtDuration, fmtTime, sameLocalDay, startOfDay } from '../format';
import { weekStart } from '../plan';
import { useStore } from '../store';
import { PRIORITY_COLORS, SOURCE_COLORS, SOURCE_LABELS, useTheme } from '../theme';
import { PRIORITY_LABELS, type Task } from '../types';
import TaskEditor from './TaskEditor';

type Mode = 'day' | 'week' | 'list';

export default function PlanScreen() {
  const t = useTheme();
  const store = useStore();
  const { plan, tasks, allEvents, now, syncAll, completeTask, logProgress, lookup, projects, settings } = store;
  const [mode, setMode] = useState<Mode>('day');
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()).getTime());
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const today = startOfDay(now);
  const day = new Date(anchor);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const colorFor = (taskId: string) => {
    const task = lookup(taskId);
    if (!task) return t.accent;
    const p = task.projectId ? projectById.get(task.projectId) : undefined;
    return p?.color ?? PRIORITY_COLORS[task.priority];
  };

  const items: TimelineItem[] = useMemo(() => {
    const out: TimelineItem[] = [];
    for (const e of allEvents) {
      if (e.allDay) continue;
      out.push({
        key: e.id + e.start,
        start: Date.parse(e.start),
        end: Date.parse(e.end),
        title: e.title,
        subtitle: SOURCE_LABELS[e.source],
        color: SOURCE_COLORS[e.source],
        kind: 'event',
      });
    }
    for (const b of plan.blocks) {
      const task = lookup(b.taskId);
      if (!task) continue;
      out.push({
        key: `${b.taskId}@${b.start}`,
        start: Date.parse(b.start),
        end: Date.parse(b.end),
        title: task.recurrence ? `↻ ${task.title}` : task.title,
        subtitle: PRIORITY_LABELS[task.priority],
        color: colorFor(b.taskId),
        kind: 'task',
        taskId: b.taskId,
        pinned: b.pinned,
        warn: plan.atRisk.includes(b.taskId),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, plan, lookup, projectById]);

  const openItem = (it: TimelineItem) => {
    if (it.kind !== 'task' || !it.taskId) return;
    setSheet({ taskId: it.taskId, start: it.start, end: it.end, pinned: it.pinned });
  };
  const editTask = (id: string) => setEditing(tasks.find((x) => x.id === id) ?? null);

  // Current or next block today, for the quick "now" card.
  const current = plan.blocks.find((b) => Date.parse(b.start) <= now && now < Date.parse(b.end));
  const next = current ?? plan.blocks.find((b) => Date.parse(b.start) > now && sameLocalDay(b.start, now));
  const nextTask = next ? lookup(next.taskId) : undefined;

  const atRisk = plan.atRisk.map((id) => lookup(id)?.title).filter(Boolean) as string[];
  const unscheduled = plan.unscheduled.filter((u) => !lookup(u.taskId)?.recurrence);

  const shift = (n: number) => setAnchor(addDays(day, n * (mode === 'week' ? 7 : 1)).getTime());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const firstWork = Math.min(
    ...[...settings.schedules.work, ...settings.schedules.personal].filter((d) => d.enabled).map((d) => d.startMin),
    8 * 60,
  );
  const scrollTo = sameLocalDay(day, now) || mode === 'week' ? Math.max(0, (now - today.getTime()) / 60000 - 90) : firstWork - 30;

  const dayItems = (d: Date) => items.filter((i) => sameLocalDay(i.start, d)).sort((a, b) => a.start - b.start);
  const dueOn = (d: Date) => tasks.filter((x) => x.deadline && sameLocalDay(x.deadline, d));
  const allDayOn = (d: Date) => allEvents.filter((e) => e.allDay && sameLocalDay(e.start, d));

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    setRefreshing(false);
  };

  const headerLabel =
    mode === 'week'
      ? `${fmtDay(weekDays[0])} to ${fmtDay(weekDays[6])}`
      : sameLocalDay(day, now)
        ? `Today, ${fmtDay(day)}`
        : fmtDay(day);

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'web' && !store.cloudStatus.email && (
        <View style={[styles.banner, { backgroundColor: t.surfaceAlt }]}>
          <Text style={{ color: t.text, fontSize: 13 }}>
            {store.cloudStatus.configured
              ? 'Sign in under Settings → "Sync between phone and web" to see your phone\'s tasks and calendars here.'
              : 'Sync is not set up in this build, so changes stay in this browser.'}
          </Text>
        </View>
      )}
      {/* Mode switch and navigation */}
      <View style={styles.toolbar}>
        <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]}>
          {(['day', 'week', 'list'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.segBtn, mode === m && { backgroundColor: t.surface }]}
            >
              <Text style={{ color: mode === m ? t.text : t.textMuted, fontWeight: '700', fontSize: 13 }}>
                {m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Agenda'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.nav}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.navBtn}>
            <Text style={{ color: t.text, fontSize: 20 }}>‹</Text>
          </Pressable>
          <Pressable onPress={() => setAnchor(today.getTime())} hitSlop={6}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>Today</Text>
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.navBtn}>
            <Text style={{ color: t.text, fontSize: 20 }}>›</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.dateLabel, { color: t.text }]}>{headerLabel}</Text>

      {/* Now / next card */}
      {next && nextTask && (
        <Pressable
          onPress={() => setSheet({ taskId: next.taskId, start: Date.parse(next.start), end: Date.parse(next.end), pinned: next.pinned })}
          style={[styles.nowCard, { backgroundColor: t.surface, borderColor: current ? t.accent : t.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: current ? t.accent : t.textMuted, fontSize: 12, fontWeight: '800' }}>
              {current ? `NOW · until ${fmtTime(next.end)}` : `NEXT · ${fmtTime(next.start)}`}
            </Text>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
              {nextTask.title}
            </Text>
          </View>
          {current && (
            <Pressable
              onPress={() => logProgress(next.taskId, Math.round((Date.parse(next.end) - Date.parse(next.start)) / 60000))}
              style={[styles.doneBtn, { backgroundColor: t.accent }]}
            >
              <Text style={{ color: t.accentText, fontWeight: '800' }}>Done</Text>
            </Pressable>
          )}
        </Pressable>
      )}

      {(atRisk.length > 0 || unscheduled.length > 0) && (
        <View style={[styles.warn, { backgroundColor: t.warnBg }]}>
          {atRisk.length > 0 && (
            <Text style={{ color: t.warn, fontWeight: '700' }} numberOfLines={2}>
              May miss deadline: {atRisk.join(', ')}
            </Text>
          )}
          {unscheduled.length > 0 && (
            <Text style={{ color: t.warn }}>
              {unscheduled.length} task{unscheduled.length > 1 ? 's' : ''} did not fit in the next {settings.horizonDays} days.
            </Text>
          )}
        </View>
      )}

      {mode !== 'list' && (
        <>
          {mode === 'day' && (dueOn(day).length > 0 || allDayOn(day).length > 0) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
              {allDayOn(day).map((e) => (
                <View key={e.id} style={[styles.pill, { backgroundColor: t.event }]}>
                  <Text style={{ color: t.eventText, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {e.title}
                  </Text>
                </View>
              ))}
              {dueOn(day).map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() => completeTask(task.id, !task.completed)}
                  style={[styles.pill, { borderColor: PRIORITY_COLORS[task.priority], borderWidth: 1, backgroundColor: t.surface }]}
                >
                  <Text
                    style={[
                      { color: t.text, fontSize: 12, fontWeight: '600' },
                      task.completed && { textDecorationLine: 'line-through', color: t.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {task.completed ? '✓ ' : '○ '}Due: {task.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Timeline
            days={mode === 'week' ? weekDays : [day]}
            items={items}
            now={now}
            hourHeight={mode === 'week' ? 40 : 60}
            scrollToMin={scrollTo}
            onPressItem={openItem}
            onPressDay={(d) => {
              setAnchor(d.getTime());
              setMode('day');
            }}
          />
        </>
      )}

      {mode === 'list' && (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {Array.from({ length: 7 }, (_, i) => addDays(day, i)).map((d) => {
            const its = dayItems(d);
            const due = dueOn(d).filter((x) => !x.completed);
            if (!its.length && !due.length) return null;
            const focus = its.filter((i) => i.kind === 'task').reduce((s, i) => s + (i.end - i.start) / 60000, 0);
            return (
              <View key={d.toISOString()}>
                <Text style={[styles.listDay, { color: t.textMuted }]}>
                  {sameLocalDay(d, now) ? 'Today' : fmtDay(d)} · {fmtDuration(focus)} of tasks
                </Text>
                {due.map((x) => (
                  <Text key={x.id} style={{ color: t.text, marginBottom: 6 }}>
                    ○ Due: {x.title}
                  </Text>
                ))}
                {its.map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={() => openItem(it)}
                    style={[
                      styles.row,
                      { backgroundColor: it.kind === 'task' ? t.surface : t.event, borderColor: t.border, opacity: it.end <= now ? 0.55 : 1 },
                    ]}
                  >
                    <View style={[styles.bar, { backgroundColor: it.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '600' }}>
                        {fmtTime(it.start)} to {fmtTime(it.end)}
                      </Text>
                      <Text style={{ color: it.kind === 'task' ? t.text : t.eventText, fontWeight: '700', fontSize: 15 }}>
                        {it.pinned ? '📌 ' : ''}
                        {it.title}
                      </Text>
                      <Text style={{ color: it.warn ? t.warn : t.textMuted, fontSize: 12 }}>
                        {it.subtitle}
                        {it.warn ? ' · at risk' : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {items.length === 0 && (
            <Card>
              <Text style={{ color: t.textMuted }}>
                Nothing planned yet. Add tasks and they will be placed into your free time.
              </Text>
            </Card>
          )}
        </ScrollView>
      )}

      <BlockSheet target={sheet} onClose={() => setSheet(null)} onEdit={editTask} />
      {editing && <TaskEditor visible task={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 12, marginTop: 6, padding: 10, borderRadius: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navBtn: { paddingHorizontal: 6 },
  dateLabel: { fontSize: 17, fontWeight: '800', paddingHorizontal: 16, marginTop: 8, marginBottom: 6 },
  nowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 10,
  },
  doneBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  warn: { marginHorizontal: 16, borderRadius: 10, padding: 10, marginBottom: 8 },
  chips: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 220 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  listDay: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 12 },
  bar: { width: 4, borderRadius: 2 },
});
