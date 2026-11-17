import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DateTimeField } from '../components/DateTimeField';
import { Button, Card, Chip, Label, SectionTitle } from '../components/ui';
import { fmtDateTime, fmtDuration, fmtMinutesOfDay, fmtTime } from '../format';
import { useStore } from '../store';
import { isConfigured, type ProviderId } from '../sync/auth';
import { SOURCE_COLORS, useTheme } from '../theme';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ConnectionCard({ id, name, hint }: { id: ProviderId; name: string; hint: string }) {
  const t = useTheme();
  const { connections, connect, disconnect, syncAll, synced } = useStore();
  const c = connections[id];
  const configured = isConfigured(id);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.dot, { backgroundColor: SOURCE_COLORS[id] }]} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{name}</Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {c?.account
              ? `${c.account}${c.lastSync ? ` · synced ${fmtTime(c.lastSync)}` : ''} · ${synced[id].length} events`
              : hint}
          </Text>
        </View>
      </View>
      {c?.error && <Text style={{ color: t.danger, marginTop: 8, fontSize: 13 }}>{c.error}</Text>}
      {!configured && (
        <Text style={{ color: t.warn, marginTop: 8, fontSize: 13 }}>
          This build has no {name} client ID yet. Follow docs/OAUTH_SETUP.md in the repo, then rebuild.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {c?.account ? (
          <>
            <Button
              kind="secondary"
              label={c.syncing ? 'Syncing…' : 'Sync now'}
              disabled={c.syncing}
              onPress={syncAll}
              style={{ flex: 1 }}
            />
            <Button kind="danger" label="Disconnect" onPress={() => disconnect(id)} style={{ flex: 1 }} />
          </>
        ) : (
          <Button label={`Connect ${name}`} disabled={!configured} onPress={() => connect(id)} style={{ flex: 1 }} />
        )}
      </View>
    </Card>
  );
}

function PersonalBlocks() {
  const t = useTheme();
  const { localEvents, saveEvent, deleteEvent, now } = useStore();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<string | undefined>();
  const [lengthMin, setLength] = useState(60);
  const upcoming = localEvents
    .filter((e) => Date.parse(e.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const add = () => {
    if (!title.trim() || !start) return;
    saveEvent({
      title: title.trim(),
      start,
      end: new Date(Date.parse(start) + lengthMin * 60_000).toISOString(),
    });
    setTitle('');
    setStart(undefined);
  };

  return (
    <>
      <SectionTitle>Personal blocks</SectionTitle>
      <Text style={{ color: t.textMuted, marginBottom: 8 }}>
        Fixed time that is not on a synced calendar, such as the gym or school pickup.
      </Text>
      {upcoming.map((e) => (
        <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{e.title}</Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              {fmtDateTime(e.start)} to {fmtTime(e.end)}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert('Remove block?', e.title, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => deleteEvent(e.id) },
              ])
            }
            hitSlop={10}
          >
            <Text style={{ color: t.danger, fontWeight: '600' }}>Remove</Text>
          </Pressable>
        </Card>
      ))}
      <Card>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Block name"
          placeholderTextColor={t.textMuted}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />
        <Label>Starts</Label>
        <DateTimeField value={start} onChange={setStart} allowNone={false} defaultHour={12} />
        <Label>Length</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[30, 60, 90, 120].map((m) => (
            <Chip key={m} label={fmtDuration(m)} selected={lengthMin === m} onPress={() => setLength(m)} />
          ))}
        </View>
        <Button label="Add block" onPress={add} disabled={!title.trim() || !start} style={{ marginTop: 6 }} />
      </Card>
    </>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const { settings, updateSettings } = useStore();

  const setDay = (i: number, patch: Partial<(typeof settings.workWeek)[number]>) => {
    const workWeek = settings.workWeek.map((d, j) => (j === i ? { ...d, ...patch } : d));
    updateSettings({ workWeek });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle>Calendars</SectionTitle>
      <ConnectionCard id="google" name="Google Calendar" hint="Personal calendar" />
      <ConnectionCard id="microsoft" name="Outlook" hint="Work calendar (Microsoft 365)" />

      <SectionTitle>Working hours</SectionTitle>
      <Text style={{ color: t.textMuted, marginBottom: 8 }}>Tasks are only scheduled inside these hours.</Text>
      <Card>
        {settings.workWeek.map((d, i) => (
          <View key={i} style={[styles.dayRow, i > 0 && { borderTopWidth: 1, borderColor: t.border }]}>
            <Text style={{ color: t.text, width: 40, fontWeight: '700' }}>{DAY_NAMES[i]}</Text>
            <Switch value={d.enabled} onValueChange={(v) => setDay(i, { enabled: v })} />
            {d.enabled ? (
              <View style={styles.hours}>
                <TimeStepper value={d.startMin} onChange={(v) => setDay(i, { startMin: Math.min(v, d.endMin - 30) })} />
                <Text style={{ color: t.textMuted }}>to</Text>
                <TimeStepper value={d.endMin} onChange={(v) => setDay(i, { endMin: Math.max(v, d.startMin + 30) })} />
              </View>
            ) : (
              <Text style={{ color: t.textMuted, marginLeft: 8 }}>Off</Text>
            )}
          </View>
        ))}
      </Card>

      <SectionTitle>Scheduling</SectionTitle>
      <Label>Break after each meeting</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[0, 5, 10, 15].map((m) => (
          <Chip
            key={m}
            label={m ? `${m} min` : 'None'}
            selected={settings.bufferMin === m}
            onPress={() => updateSettings({ bufferMin: m })}
          />
        ))}
      </View>
      <Label>Plan ahead</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[7, 14, 28].map((d) => (
          <Chip
            key={d}
            label={`${d} days`}
            selected={settings.horizonDays === d}
            onPress={() => updateSettings({ horizonDays: d })}
          />
        ))}
      </View>

      <PersonalBlocks />
    </ScrollView>
  );
}

function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTheme();
  const step = (d: number) => onChange(Math.max(0, Math.min(24 * 60, value + d)));
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => step(-30)} hitSlop={8} style={[styles.stepBtn, { backgroundColor: t.surfaceAlt }]}>
        <Text style={{ color: t.text, fontWeight: '800' }}>−</Text>
      </Pressable>
      <Text style={{ color: t.text, minWidth: 64, textAlign: 'center', fontSize: 13 }}>{fmtMinutesOfDay(value)}</Text>
      <Pressable onPress={() => step(30)} hitSlop={8} style={[styles.stepBtn, { backgroundColor: t.surfaceAlt }]}>
        <Text style={{ color: t.text, fontWeight: '800' }}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  hours: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end', gap: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
