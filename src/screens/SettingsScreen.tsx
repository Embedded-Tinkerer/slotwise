import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DEFAULT_GEMINI_MODEL, getGeminiKey, setGeminiKey } from '../ai/gemini';
import { DateTimeField } from '../components/DateTimeField';
import { GeminiKeyForm } from './AIComposer';
import { Button, Card, Chip, Label, SectionTitle } from '../components/ui';
import { fmtDateTime, fmtDuration, fmtMinutesOfDay, fmtTime } from '../format';
import { useStore } from '../store';
import { isConfigured, type ProviderId } from '../sync/auth';
import { ensurePermission } from '../notify';
import { SOURCE_COLORS, useTheme } from '../theme';
import {
  SCHEDULE_LABELS,
  type ScheduleId,
  type WorkDay,
  type WriteBackGoogle,
  type WriteBackOutlook,
} from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ConnectionCard({ id, name, hint }: { id: ProviderId; name: string; hint: string }) {
  const t = useTheme();
  const { connections, connect, disconnect, syncAll, synced, settings, updateSettings } = useStore();
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
      {id === 'google' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '600' }}>Include Google Tasks</Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              Open tasks are imported (30 min by default) and scheduled before their due date.
            </Text>
          </View>
          <Switch value={settings.googleTasks} onValueChange={(v) => updateSettings({ googleTasks: v })} />
        </View>
      )}
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

function GeminiSection() {
  const t = useTheme();
  const { settings, updateSettings } = useStore();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    getGeminiKey().then((k) => setHasKey(!!k));
  }, []);
  return (
    <>
      <SectionTitle>AI assistant (Gemini)</SectionTitle>
      <Card>
        {hasKey ? (
          <>
            <Text style={{ color: t.text, fontWeight: '700' }}>Gemini key saved on this phone</Text>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 6 }}>
              Use “Add with AI” on the Tasks tab to turn a sentence into tasks and fixed blocks.
            </Text>
            <Label>Model</Label>
            <TextInput
              value={settings.geminiModel}
              onChangeText={(v) => updateSettings({ geminiModel: v.trim() })}
              placeholder={DEFAULT_GEMINI_MODEL}
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
            <Button
              kind="danger"
              label="Remove key"
              onPress={async () => {
                await setGeminiKey(null);
                setHasKey(false);
              }}
              style={{ marginTop: 12 }}
            />
          </>
        ) : hasKey === false ? (
          <GeminiKeyForm onSaved={() => setHasKey(true)} />
        ) : null}
      </Card>
    </>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const { settings, updateSettings, connections } = useStore();
  const [which, setWhich] = useState<ScheduleId>('work');
  const week = settings.schedules[which];

  const setDay = (i: number, patch: Partial<WorkDay>) => {
    const next = week.map((d, j) => (j === i ? { ...d, ...patch } : d));
    updateSettings({ schedules: { ...settings.schedules, [which]: next } });
  };

  const enableReminders = async (m: number) => {
    if (m >= 0 && !(await ensurePermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for Slotwise in Android settings to get reminders.');
      return;
    }
    updateSettings({ notifyMin: m });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle>Calendars</SectionTitle>
      <ConnectionCard id="google" name="Google Calendar" hint="Personal calendar" />
      <ConnectionCard id="microsoft" name="Outlook" hint="Work calendar (Microsoft 365)" />

      <SectionTitle>Show planned tasks on my calendars</SectionTitle>
      <Text style={{ color: t.textMuted, marginBottom: 8 }}>
        Adds task blocks for the next 7 days to a separate "Slotwise" calendar so others see you as busy.
      </Text>
      <Label>Google Calendar</Label>
      <View style={styles.wrap}>
        {(['off', 'personal', 'all'] as WriteBackGoogle[]).map((m) => (
          <Chip
            key={m}
            label={m === 'off' ? 'Off' : m === 'personal' ? 'Personal tasks' : 'All tasks'}
            selected={settings.writeGoogle === m}
            onPress={() => updateSettings({ writeGoogle: m })}
          />
        ))}
      </View>
      <Label>Outlook</Label>
      <View style={styles.wrap}>
        {(['off', 'work', 'all'] as WriteBackOutlook[]).map((m) => (
          <Chip
            key={m}
            label={m === 'off' ? 'Off' : m === 'work' ? 'Work tasks' : 'All tasks'}
            selected={settings.writeOutlook === m}
            onPress={() => updateSettings({ writeOutlook: m })}
          />
        ))}
      </View>
      {((settings.writeGoogle !== 'off' && !connections.google?.account) ||
        (settings.writeOutlook !== 'off' && !connections.microsoft?.account)) && (
        <Text style={{ color: t.warn, fontSize: 13 }}>Connect that calendar above for this to take effect.</Text>
      )}

      <SectionTitle>Hours</SectionTitle>
      <Text style={{ color: t.textMuted, marginBottom: 8 }}>
        Work tasks go in work hours, personal tasks and habits in personal hours. Pick which one each task uses.
      </Text>
      <View style={styles.wrap}>
        {(['work', 'personal'] as ScheduleId[]).map((s) => (
          <Chip key={s} label={SCHEDULE_LABELS[s]} selected={which === s} onPress={() => setWhich(s)} />
        ))}
      </View>
      <Card>
        {week.map((d, i) => (
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
      <View style={styles.wrap}>
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
      <View style={styles.wrap}>
        {[7, 14, 28].map((d) => (
          <Chip
            key={d}
            label={`${d} days`}
            selected={settings.horizonDays === d}
            onPress={() => updateSettings({ horizonDays: d })}
          />
        ))}
      </View>
      <Label>Remind me before a task block starts</Label>
      <View style={styles.wrap}>
        {[-1, 0, 5, 10, 15].map((m) => (
          <Chip
            key={m}
            label={m < 0 ? 'Off' : m === 0 ? 'At start' : `${m} min before`}
            selected={settings.notifyMin === m}
            onPress={() => enableReminders(m)}
          />
        ))}
      </View>

      <GeminiSection />

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
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
