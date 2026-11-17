import { useColorScheme } from 'react-native';
import type { EventSource, Priority } from './types';

const light = {
  bg: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EE',
  text: '#16201D',
  textMuted: '#5E6B66',
  border: '#DCE2DF',
  accent: '#0F766E',
  accentText: '#FFFFFF',
  danger: '#B42318',
  warn: '#B54708',
  warnBg: '#FEF0C7',
  event: '#E4E8EC',
  eventText: '#344054',
};

const dark: typeof light = {
  bg: '#0E1412',
  surface: '#17201D',
  surfaceAlt: '#202B27',
  text: '#E8EEEB',
  textMuted: '#97A39E',
  border: '#2C3934',
  accent: '#2DD4BF',
  accentText: '#04211E',
  danger: '#F97066',
  warn: '#FDB022',
  warnBg: '#3A2A0B',
  event: '#26303A',
  eventText: '#CBD5E1',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  1: '#E04F39',
  2: '#E8912D',
  3: '#2F8F83',
  4: '#7A8A99',
};

export const SOURCE_COLORS: Record<EventSource, string> = {
  local: '#8E7CC3',
  google: '#3B82F6',
  microsoft: '#0EA5E9',
};

export const SOURCE_LABELS: Record<EventSource, string> = {
  local: 'Personal block',
  google: 'Google',
  microsoft: 'Outlook',
};
