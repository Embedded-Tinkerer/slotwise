import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { draftProject, getGeminiKey } from '../ai/gemini';
import type { PlannedStep, ProjectPlan } from '../ai/projectPlan';
import { DateTimeField } from '../components/DateTimeField';
import { Button, Card, Chip, Label } from '../components/ui';
import { fmtDuration } from '../format';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { SCHEDULE_LABELS, type Project, type ScheduleId } from '../types';
import { GeminiKeyForm } from './AIComposer';

const EXAMPLE =
  'Bring up the new PA test bench: write a test plan, build the fixture, write the automation scripts, run characterization and write up the results for the team.';

/**
 * Describe a project and Gemini drafts ordered steps with time estimates.
 * With `project`, it adds missing steps to an existing project instead.
 */
export default function AIProjectPlanner({
  project,
  onClose,
}: {
  project?: Project;
  onClose: (projectId?: string) => void;
}) {
  const t = useTheme();
  const { saveProject, saveTask, tasks, settings } = useStore();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>(project?.deadline);
  const [hard, setHard] = useState(project?.hardDeadline ?? false);
  const [schedule, setSchedule] = useState<ScheduleId>(project?.schedule ?? 'work');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);

  useEffect(() => {
    getGeminiKey().then((k) => setHasKey(!!k));
  }, []);

  const existing = project
    ? tasks.filter((x) => x.projectId === project.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await draftProject(
        {
          description: description.trim() || (project ? 'Add whatever steps are missing.' : ''),
          deadline,
          projectName: project?.name,
          existingSteps: existing.map((x) => ({ title: x.title, durationMin: x.durationMin, completed: x.completed })),
        },
        settings.geminiModel,
      );
      if (!p.steps.length) setError('Gemini did not suggest any steps. Try adding more detail.');
      setPlan(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateStep = (i: number, patch: Partial<PlannedStep>) =>
    plan && setPlan({ ...plan, steps: plan.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const removeStep = (i: number) => plan && setPlan({ ...plan, steps: plan.steps.filter((_, j) => j !== i) });
  const moveStep = (i: number, d: number) => {
    if (!plan) return;
    const steps = [...plan.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setPlan({ ...plan, steps });
  };

  const create = () => {
    if (!plan || !plan.steps.length) return;
    const projectId = project
      ? project.id
      : saveProject({
          name: plan.name,
          deadline,
          hardDeadline: deadline ? hard : undefined,
          sequential: plan.sequential,
          schedule,
          priority: 3,
        });
    if (project && deadline !== project.deadline) saveProject({ ...project, deadline, hardDeadline: deadline ? hard : undefined });
    const base = Math.max(0, ...existing.map((x) => x.order ?? 0));
    plan.steps.forEach((s, i) =>
      saveTask({
        title: s.title,
        notes: s.notes,
        durationMin: s.durationMin,
        priority: s.priority,
        splittable: s.splittable,
        projectId,
        schedule: project?.schedule ?? schedule,
        order: base + i + 1,
      }),
    );
    onClose(projectId);
  };

  const total = plan?.steps.reduce((s, x) => s + x.durationMin, 0) ?? 0;

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose()}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.header, { borderColor: t.border }]}>
          <Text style={[styles.headerText, { color: t.text }]}>
            {project ? `Add steps to ${project.name}` : 'Plan a project with AI'}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>Gemini drafts the steps; you review before anything is added</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {hasKey === null ? (
            <ActivityIndicator color={t.accent} />
          ) : !hasKey ? (
            <GeminiKeyForm onSaved={() => setHasKey(true)} />
          ) : !plan ? (
            <>
              <Label>{project ? 'What else needs to happen? (optional)' : 'What is the project?'}</Label>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                autoFocus
                placeholder={project ? 'e.g. We also need a review with the team' : EXAMPLE}
                placeholderTextColor={t.textMuted}
                style={[styles.input, styles.multi, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              />
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>
                Include the goal, what "done" looks like and anything you already know about the work.
              </Text>
              <Label>Deadline</Label>
              <DateTimeField value={deadline} onChange={setDeadline} />
              {deadline && (
                <View style={styles.switchRow}>
                  <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>Hard deadline</Text>
                  <Switch value={hard} onValueChange={setHard} />
                </View>
              )}
              {!project && (
                <>
                  <Label>Hours</Label>
                  <View style={styles.wrap}>
                    {(['work', 'personal'] as ScheduleId[]).map((s) => (
                      <Chip key={s} label={SCHEDULE_LABELS[s]} selected={schedule === s} onPress={() => setSchedule(s)} />
                    ))}
                  </View>
                </>
              )}
              {error && <Text style={{ color: t.danger, marginTop: 12 }}>{error}</Text>}
            </>
          ) : (
            <>
              {!project && (
                <>
                  <Label>Project name</Label>
                  <TextInput
                    value={plan.name}
                    onChangeText={(v) => setPlan({ ...plan, name: v })}
                    style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
                  />
                </>
              )}
              {plan.summary && <Text style={{ color: t.textMuted, marginTop: 10 }}>{plan.summary}</Text>}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Do steps in order</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>
                    {plan.steps.length} steps · {fmtDuration(total)} of work
                  </Text>
                </View>
                <Switch value={plan.sequential} onValueChange={(v) => setPlan({ ...plan, sequential: v })} disabled={!!project} />
              </View>
              <Label>Steps (edit, reorder or remove)</Label>
              {plan.steps.map((s, i) => (
                <Card key={i} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: t.textMuted, fontWeight: '800', width: 18 }}>{i + 1}</Text>
                    <TextInput
                      value={s.title}
                      onChangeText={(v) => updateStep(i, { title: v })}
                      style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: 15, paddingVertical: 2 }}
                    />
                    <Pressable onPress={() => removeStep(i)} hitSlop={8}>
                      <Text style={{ color: t.danger, fontSize: 16 }}>✕</Text>
                    </Pressable>
                  </View>
                  {s.notes && <Text style={{ color: t.textMuted, fontSize: 12, marginLeft: 26 }}>{s.notes}</Text>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 26 }}>
                    <Pressable onPress={() => updateStep(i, { durationMin: Math.max(15, s.durationMin - 15) })} style={[styles.mini, { backgroundColor: t.surfaceAlt }]}>
                      <Text style={{ color: t.text, fontWeight: '800' }}>−</Text>
                    </Pressable>
                    <Text style={{ color: t.text, minWidth: 54, textAlign: 'center' }}>{fmtDuration(s.durationMin)}</Text>
                    <Pressable onPress={() => updateStep(i, { durationMin: s.durationMin + 15 })} style={[styles.mini, { backgroundColor: t.surfaceAlt }]}>
                      <Text style={{ color: t.text, fontWeight: '800' }}>+</Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => moveStep(i, -1)} hitSlop={6}>
                      <Text style={{ color: i === 0 ? t.border : t.textMuted, fontSize: 16 }}>▲</Text>
                    </Pressable>
                    <Pressable onPress={() => moveStep(i, 1)} hitSlop={6}>
                      <Text style={{ color: i === plan.steps.length - 1 ? t.border : t.textMuted, fontSize: 16 }}>▼</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
              <Pressable onPress={() => setPlan(null)}>
                <Text style={{ color: t.accent, fontWeight: '700', marginTop: 4 }}>‹ Change the description and try again</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderColor: t.border }]}>
          <Button kind="secondary" label="Cancel" onPress={() => onClose()} style={{ flex: 1 }} />
          {hasKey && !plan && (
            <Button
              label={busy ? 'Planning…' : 'Draft steps'}
              disabled={busy || (!project && !description.trim())}
              onPress={run}
              style={{ flex: 1 }}
            />
          )}
          {plan && (
            <Button
              label={project ? `Add ${plan.steps.length} steps` : 'Create & schedule'}
              disabled={!plan.steps.length || (!project && !plan.name.trim())}
              onPress={create}
              style={{ flex: 1 }}
            />
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
  multi: { minHeight: 140, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  mini: { width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
});
