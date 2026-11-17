import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { pickAttachments, type Attachment } from '../ai/attachments';
import { useTheme } from '../theme';

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Attach files" button plus the list of attached files. */
export function AttachmentBar({
  value,
  onChange,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const pick = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { added, skipped } = await pickAttachments(value);
      const names = new Set(value.map((a) => a.name));
      onChange([...value, ...added.filter((a) => !names.has(a.name))]);
      if (skipped) setNote(skipped);
    } catch (e) {
      setNote(`Could not read the file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 10 }}>
      {value.map((a) => (
        <View key={a.name} style={[styles.file, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontSize: 16 }}>{a.mimeType === 'application/pdf' ? '📄' : a.mimeType.startsWith('image/') ? '🖼️' : '📝'}</Text>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '600' }}>
            {a.name}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>{fmtSize(a.size)}</Text>
          <Pressable onPress={() => onChange(value.filter((x) => x !== a))} hitSlop={8}>
            <Text style={{ color: t.danger, fontSize: 16, marginLeft: 6 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={pick} disabled={busy} style={[styles.attach, { borderColor: t.border }]}>
        {busy ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <Text style={{ color: t.accent, fontWeight: '700' }}>📎 Attach files</Text>
        )}
      </Pressable>
      <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>
        PDFs, photos, screenshots and text files, up to 15 MB in total.
      </Text>
      {note && <Text style={{ color: t.warn, fontSize: 12, marginTop: 4 }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  attach: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
