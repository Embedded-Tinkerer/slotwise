// Hour-grid calendar used for the day view (one column) and week view
// (seven columns). Overlapping items are laid out side by side.

import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { fmtTime, sameLocalDay } from '../format';
import { useTheme } from '../theme';

export interface TimelineItem {
  key: string;
  start: number;
  end: number;
  title: string;
  subtitle?: string;
  color: string;
  kind: 'event' | 'task';
  taskId?: string;
  pinned?: boolean;
  warn?: boolean;
}

interface Placed extends TimelineItem {
  lane: number;
  lanes: number;
}

/** Greedy lane assignment within clusters of overlapping items. */
function layout(items: TimelineItem[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

export function Timeline({
  days,
  items,
  now,
  hourHeight = 56,
  scrollToMin = 8 * 60,
  onPressItem,
  onPressDay,
}: {
  days: Date[];
  items: TimelineItem[];
  now: number;
  hourHeight?: number;
  scrollToMin?: number;
  onPressItem?: (item: TimelineItem) => void;
  onPressDay?: (day: Date) => void;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const compact = days.length > 1;
  const gutter = compact ? 34 : 46;

  useEffect(() => {
    const y = Math.max(0, (scrollToMin / 60) * hourHeight - 8);
    const id = setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
  }, [scrollToMin, hourHeight, days.length]);

  const perDay = days.map((d) => {
    const dayStart = d.getTime();
    const dayEnd = dayStart + 24 * 3600_000;
    return layout(
      items
        .filter((i) => i.end > dayStart && i.start < dayEnd)
        .map((i) => ({ ...i, start: Math.max(i.start, dayStart), end: Math.min(i.end, dayEnd) })),
    );
  });

  const y = (ms: number, dayStart: number) => ((ms - dayStart) / 3600_000) * hourHeight;

  return (
    <View style={{ flex: 1 }}>
      {compact && (
        <View style={[styles.header, { borderColor: t.border, paddingLeft: gutter }]}>
          {days.map((d) => {
            const today = sameLocalDay(d, now);
            return (
              <Pressable key={d.toISOString()} style={styles.headCell} onPress={() => onPressDay?.(d)}>
                <Text style={{ color: today ? t.accent : t.textMuted, fontSize: 11, fontWeight: '700' }}>
                  {d.toLocaleDateString([], { weekday: 'narrow' })}
                </Text>
                <Text style={{ color: today ? t.accent : t.text, fontSize: 15, fontWeight: '800' }}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <ScrollView ref={scroll} contentContainerStyle={{ height: 24 * hourHeight + 16 }}>
        <View style={{ flexDirection: 'row', height: 24 * hourHeight }}>
          <View style={{ width: gutter }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text
                key={h}
                style={[styles.hour, { top: h * hourHeight - 7, color: t.textMuted, fontSize: compact ? 9 : 11 }]}
              >
                {h === 0 ? '' : compact ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
              </Text>
            ))}
          </View>
          {days.map((d, di) => {
            const dayStart = d.getTime();
            const isToday = sameLocalDay(d, now);
            return (
              <View
                key={d.toISOString()}
                style={[styles.col, { borderColor: t.border, borderLeftWidth: compact || di > 0 ? StyleSheet.hairlineWidth : 0 }]}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <View
                    key={h}
                    style={[styles.line, { top: h * hourHeight, borderColor: t.border }]}
                  />
                ))}
                {perDay[di].map((it) => {
                  const top = y(it.start, dayStart);
                  const height = Math.max(compact ? 14 : 20, y(it.end, dayStart) - top - 2);
                  const width = 100 / it.lanes;
                  const isTask = it.kind === 'task';
                  const past = it.end <= now;
                  return (
                    <Pressable
                      key={it.key}
                      onPress={() => onPressItem?.(it)}
                      style={[
                        styles.item,
                        {
                          top: top + 1,
                          height,
                          left: `${it.lane * width}%`,
                          width: `${width}%`,
                          backgroundColor: isTask ? it.color : t.event,
                          borderLeftColor: it.color,
                          opacity: past ? 0.5 : 1,
                          borderWidth: it.warn ? 2 : 0,
                          borderColor: t.warn,
                          paddingHorizontal: compact ? 2 : 6,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={height > 34 ? 2 : 1}
                        style={{
                          color: isTask ? '#FFFFFF' : t.eventText,
                          fontSize: compact ? 9 : 13,
                          fontWeight: '700',
                        }}
                      >
                        {it.pinned ? '📌 ' : ''}
                        {it.title}
                      </Text>
                      {!compact && height > 38 && (
                        <Text numberOfLines={1} style={{ color: isTask ? '#FFFFFFCC' : t.eventText, fontSize: 11 }}>
                          {fmtTime(it.start)} to {fmtTime(it.end)}
                          {it.subtitle ? ` · ${it.subtitle}` : ''}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
                {isToday && (
                  <View style={[styles.now, { top: y(now, dayStart), backgroundColor: t.danger }]}>
                    <View style={[styles.nowDot, { backgroundColor: t.danger }]} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 4 },
  headCell: { flex: 1, alignItems: 'center' },
  hour: { position: 'absolute', right: 4 },
  col: { flex: 1, position: 'relative' },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  item: {
    position: 'absolute',
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  now: { position: 'absolute', left: 0, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
});
