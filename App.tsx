import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import PlanScreen from './src/screens/PlanScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TasksScreen from './src/screens/TasksScreen';
import { StoreProvider, useStore } from './src/store';
import { useTheme } from './src/theme';

type Tab = 'plan' | 'tasks' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plan', label: 'Plan', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '☰' },
  { id: 'settings', label: 'Calendars', icon: '⚙' },
];
const TITLES: Record<Tab, string> = { plan: 'Your plan', tasks: 'Tasks', settings: 'Calendars & hours' };

function Shell() {
  const t = useTheme();
  const scheme = useColorScheme();
  const { loaded } = useStore();
  const [tab, setTab] = useState<Tab>('plan');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Text style={[styles.brand, { color: t.accent }]}>Slotwise</Text>
        <Text style={[styles.title, { color: t.text }]}>{TITLES[tab]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {!loaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
        ) : tab === 'plan' ? (
          <PlanScreen />
        ) : tab === 'tasks' ? (
          <TasksScreen />
        ) : (
          <SettingsScreen />
        )}
      </View>
      <View style={[styles.tabs, { borderColor: t.border, backgroundColor: t.surface }]}>
        {TABS.map((x) => {
          const active = x.id === tab;
          return (
            <Pressable
              key={x.id}
              onPress={() => setTab(x.id)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={{ fontSize: 20, color: active ? t.accent : t.textMuted }}>{x.icon}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? t.accent : t.textMuted }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  brand: { fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
});
