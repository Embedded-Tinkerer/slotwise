import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GEMINI_KEY_URL, draftFromText, getGeminiKey, setGeminiKey } from '../ai/gemini';
import type { Attachment } from '../ai/attachments';
import type { Draft } from '../ai/parse';
import { AttachmentBar } from '../components/AttachmentBar';
import { Button, Card, Label } from '../components/ui';
import { fmtDateTime, fmtDuration, fmtTime } from '../format';
import { useStore } from '../store';
import { PRIORITY_COLORS, SOURCE_COLORS, useTheme } from '../theme';
import { PRIORITY_LABELS } from '../types';

const EXAMPLE =
  'Finish the PA test plan by Thursday, about 3 hours, high priority. Call the landlord tomorrow. Gym Wednesday at 6pm.';

export function GeminiKeyForm({ onSaved }: { onSaved?: () => void }) {
  const t = useTheme();
  const [key, setKey] = useState('');
  return (
    <View>
      <Text style={{ color: t.textMuted }}>
        Get a free API key from Google AI Studio, then paste it here. It is stored only on this phone.
      </Text>
      <Pressable onPress={() => Linking.openURL(GEMINI_KEY_URL)}>
        <Text style={{ color: t.accent, fontWeight: '700', marginVertical: 8 }}>Open Google AI Studio ↗</Text>
      </Pressable>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="Paste API key"
        placeholderTextColor={t.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
      />
      <Button
        label="Save key"
        disabled={!key.trim()}
        onPress={async () => {
          await setGeminiKey(key);
          setKey('');
          onSaved?.();
        }}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

export default function AIComposer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { saveTask, saveEvent, settings } = useStore();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [files, setFiles] = useState<Attachment[]>([]);

  useEffect(() => {
    if (visible) getGeminiKey().then((k) => setHasKey(!!k));
  }, [visible]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await draftFromText(text.trim() || 'Find the tasks and appointments in the attached files.', settings.geminiModel, files);
      setDrafts(d);
      setSkip(new Set());
      if (d.length === 0) setError('Gemini did not find any tasks or appointments in that. Try adding more detail.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    drafts?.forEach((d, i) => {
      if (skip.has(i)) return;
      if (d.kind === 'task') {
        const { kind: _k, ...task } = d;
        saveTask(task);
      } else {
        saveEvent({ title: d.title, start: d.start, end: d.end });
      }
    });
    setText('');
    setDrafts(null);
    onClose();
  };

  const toggle = (i: number) => {
    const next = new Set(skip);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSkip(next);
  };

  const count = drafts ? drafts.length - skip.size : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.header, { borderColor: t.border }]}>
          <Text style={[styles.headerText, { color: t.text }]}>Add with AI</Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>Powered by Gemini</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {hasKey === null ? (
            <ActivityIndicator color={t.accent} />
          ) : !hasKey ? (
            <GeminiKeyForm onSaved={() => setHasKey(true)} />
          ) : (
            <>
              <Label>Describe what you need to get done</Label>
              <TextInput
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setDrafts(null);
                }}
                multiline
                autoFocus
                placeholder={EXAMPLE}
                placeholderTextColor={t.textMuted}
                style={[styles.input, styles.multi, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              />
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>
                Tip: tap the microphone on your keyboard to dictate.
              </Text>
              {!drafts && <AttachmentBar value={files} onChange={setFiles} />}
              {!drafts && (
                <Button
                  label={busy ? 'Thinking…' : 'Turn into tasks'}
                  disabled={busy || (!text.trim() && !files.length)}
                  onPress={run}
                  style={{ marginTop: 12 }}
                />
              )}
              {error && <Text style={{ color: t.danger, marginTop: 12 }}>{error}</Text>}
              {drafts && drafts.length > 0 && (
                <>
                  <Label>Review before adding (tap to skip)</Label>
                  {drafts.map((d, i) => {
                    const off = skip.has(i);
                    const color = d.kind === 'task' ? PRIORITY_COLORS[d.priority] : SOURCE_COLORS.local;
                    return (
                      <Pressable key={i} onPress={() => toggle(i)}>
                        <Card style={[styles.draft, { opacity: off ? 0.4 : 1 }]}>
                          <View style={[styles.bar, { backgroundColor: color }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700' }}>
                              {d.kind === 'task' ? 'TASK' : 'FIXED BLOCK'}
                              {off ? ' · skipped' : ''}
                            </Text>
                            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{d.title}</Text>
                            <Text style={{ color: t.textMuted, fontSize: 13 }}>
                              {d.kind === 'task'
                                ? `${PRIORITY_LABELS[d.priority]} · ${fmtDuration(d.durationMin)}${
                                    d.deadline ? ` · due ${fmtDateTime(d.deadline)}` : ''
                                  }${d.startAfter ? ` · not before ${fmtDateTime(d.startAfter)}` : ''}`
                                : `${fmtDateTime(d.start)} to ${fmtTime(d.end)}`}
                            </Text>
                          </View>
                        </Card>
                      </Pressable>
                    );
                  })}
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>
                    You can change anything after adding it from the Tasks or Calendars tab.
                  </Text>
                </>
              )}
            </>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderColor: t.border }]}>
          <Button kind="secondary" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
          {drafts && drafts.length > 0 && (
            <Button label={`Add ${count}`} disabled={count === 0} onPress={add} style={{ flex: 1 }} />
          )}
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
  multi: { minHeight: 120, textAlignVertical: 'top' },
  draft: { flexDirection: 'row', gap: 12 },
  bar: { width: 4, borderRadius: 2 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
});
