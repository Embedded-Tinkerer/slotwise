import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, TextInput, View } from 'react-native';

import { useTheme } from '../theme';

import { addDays, fmtDateTime, startOfDay } from '../format';
import { Chip } from './ui';

function at(d: Date, h: number, m = 0): string {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
}

/** Quick picks plus a native date and time picker on Android. */
export function DateTimeField({
  value,
  onChange,
  allowNone = true,
  defaultHour = 17,
}: {
  value?: string;
  onChange: (iso: string | undefined) => void;
  allowNone?: boolean;
  defaultHour?: number;
}) {
  const today = startOfDay(Date.now());
  const daysToFriday = (5 - today.getDay() + 7) % 7 || 7;
  const quick: { label: string; iso: string }[] = [
    { label: 'Today', iso: at(today, defaultHour) },
    { label: 'Tomorrow', iso: at(addDays(today, 1), defaultHour) },
    { label: 'Friday', iso: at(addDays(today, daysToFriday), defaultHour) },
    { label: 'Next week', iso: at(addDays(today, 7), defaultHour) },
  ];
  const matched = quick.find((q) => q.iso === value);
  const t = useTheme();

  const pickCustom = () => {
    if (Platform.OS !== 'android') return;
    const initial = value ? new Date(value) : new Date(at(today, defaultHour));
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      onChange: (ev, date) => {
        if (ev.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (ev2, time) => {
            if (ev2.type !== 'set' || !time) return;
            onChange(time.toISOString());
          },
        });
      },
    });
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {allowNone && <Chip label="None" selected={!value} onPress={() => onChange(undefined)} />}
      {quick.map((q) => (
        <Chip key={q.label} label={q.label} selected={matched?.label === q.label} onPress={() => onChange(q.iso)} />
      ))}
      {Platform.OS === 'android' && (
        <Chip
          label={value && !matched ? fmtDateTime(value) : 'Pick date…'}
          selected={!!value && !matched}
          onPress={pickCustom}
        />
      )}
      {Platform.OS === 'web' && (
        <TextInput
          // Renders as a native browser date-time input.
          {...({ type: 'datetime-local' } as object)}
          value={value ? toLocalInput(value) : ''}
          onChangeText={(v) => {
            if (!v) return;
            const d = new Date(v);
            if (!Number.isNaN(d.getTime())) onChange(d.toISOString());
          }}
          style={{
            borderWidth: 1,
            borderColor: t.border,
            color: t.text,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            marginTop: 4,
          }}
        />
      )}
    </View>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
