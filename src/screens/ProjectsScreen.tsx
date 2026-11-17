import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimeField } from '../components/DateTimeField';
import { Button, Card, Chip, Label, SectionTitle } from '../components/ui';
import { fmtDateTime, fmtDuration } from '../format';
import { remainingMinutes } from '../scheduler';
import { useStore } from '../store';
import { PRIORITY_COLORS, useTheme } from '../theme';
import {
  PRIORITY_LABELS,
  PROJECT_COLORS,
  SCHEDULE_LABELS,
  type Priority,
  type Project,
  type ScheduleId,
  type Task,
} from '../types';
import TaskEditor from './TaskEditor';
import { TaskRow } from './TasksScreen';

function ProjectEditor({ project, onClose }: { project?: Project; onClose: (savedId?: string) => void }) {
  const t = useTheme();
  const { saveProject, deleteProject, tasks } = useStore();
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [deadline, setDeadline] = useState<string | undefined>(project?.deadline);
  const [hard, setHard] = useState(project?.hardDeadline ?? false);
  const [sequential, setSequential] = useState(project?.sequential ?? true);
  const [schedule, setSchedule] = useState<ScheduleId>(project?.schedule ?? 'work');
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 3);
  const [archived, setArchived] = useState(project?.archived ?? false);

  const save = () => {
    if (!name.trim()) return;
    const id = saveProject({
      id: project?.id,
      name: name.trim(),
      color,
      deadline,
      hardDeadline: deadline ? hard : undefined,
      sequential,
      schedule,
      priority,
      archived,
    });
    onClose(id);
  };

  const remove = () => {
    if (!project) return;
    const open = tasks.filter((x) => x.projectId === project.id && !x.completed).length;
    Alert.alert('Delete project?', open ? `This also deletes its ${open} open task${open > 1 ? 's' : ''}.` : project.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteProject(project.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose()}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.header, { borderColor: t.border }]}>
          <Text style={[styles.headerText, { color: t.text }]}>{project ? 'Edit project' : 'New project'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Label>Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. PA test bench bring-up"
            placeholderTextColor={t.textMuted}
            autoFocus={!project}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <Label>Color</Label>
          <View style={styles.wrap}>
            {PROJECT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? t.text : 'transparent' }]}
              />
            ))}
          </View>
          <Label>Deadline</Label>
          <DateTimeField value={deadline} onChange={setDeadline} />
          {deadline && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '600' }}>Hard deadline</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>Steps are scheduled ahead of other work to make it.</Text>
              </View>
              <Switch value={hard} onValueChange={setHard} />
            </View>
          )}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Do steps in order</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>Each step starts only after the one above it.</Text>
            </View>
            <Switch value={sequential} onValueChange={setSequential} />
          </View>
          <Label>Hours</Label>
          <View style={styles.wrap}>
            {(['work', 'personal'] as ScheduleId[]).map((s) => (
              <Chip key={s} label={SCHEDULE_LABELS[s]} selected={schedule === s} onPress={() => setSchedule(s)} />
            ))}
          </View>
          <Label>Default priority for new steps</Label>
          <View style={styles.wrap}>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <Chip key={p} label={PRIORITY_LABELS[p]} color={PRIORITY_COLORS[p]} selected={priority === p} onPress={() => setPriority(p)} />
            ))}
          </View>
          {project && (
            <>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Archived</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>Hidden and not scheduled.</Text>
                </View>
                <Switch value={archived} onValueChange={setArchived} />
              </View>
              <Button kind="danger" label="Delete project" onPress={remove} style={{ marginTop: 20 }} />
            </>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderColor: t.border }]}>
          <Button kind="secondary" label="Cancel" onPress={() => onClose()} style={{ flex: 1 }} />
          <Button label="Save" onPress={save} disabled={!name.trim()} style={{ flex: 1 }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const t = useTheme();
  const { tasks, plan, moveStep } = useStore();
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [editProject, setEditProject] = useState(false);

  const steps = tasks.filter((x) => x.projectId === project.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const open = steps.filter((x) => !x.completed);
  const done = steps.filter((x) => x.completed);
  const left = open.reduce((s, x) => s + remainingMinutes(x), 0);
  const finishTimes = open.map((x) => plan.finishBy[x.id]).filter(Boolean).map((x) => Date.parse(x));
  const finish = finishTimes.length === open.length && open.length ? Math.max(...finishTimes) : undefined;
  const late = finish && project.deadline ? finish > Date.parse(project.deadline) : false;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHead}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontWeight: '700' }}>‹ Projects</Text>
        </Pressable>
        <Pressable onPress={() => setEditProject(true)} hitSlop={10}>
          <Text style={{ color: t.accent, fontWeight: '700' }}>Edit</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.dot, { backgroundColor: project.color }]} />
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', flex: 1 }}>{project.name}</Text>
        </View>
        <Text style={{ color: t.textMuted, marginTop: 4 }}>
          {done.length}/{steps.length} steps done · {fmtDuration(left)} left · {SCHEDULE_LABELS[project.schedule]}
          {project.sequential ? ' · in order' : ''}
        </Text>
        {project.deadline && (
          <Text style={{ color: late ? t.warn : t.textMuted, marginTop: 2 }}>
            {project.hardDeadline ? 'Hard deadline' : 'Deadline'} {fmtDateTime(project.deadline)}
          </Text>
        )}
        {finish !== undefined && (
          <Text style={{ color: late ? t.warn : t.accent, marginTop: 2, fontWeight: '700' }}>
            Planned to finish {fmtDateTime(new Date(finish).toISOString())}
            {late ? ' · after the deadline' : ''}
          </Text>
        )}

        <SectionTitle>Steps</SectionTitle>
        {open.length === 0 && (
          <Text style={{ color: t.textMuted, marginBottom: 8 }}>No open steps. Add the first one below.</Text>
        )}
        {open.map((x, i) => (
          <View key={x.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <View style={styles.reorder}>
              <Pressable onPress={() => moveStep(x.id, -1)} disabled={i === 0} hitSlop={6}>
                <Text style={{ color: i === 0 ? t.border : t.textMuted, fontSize: 16 }}>▲</Text>
              </Pressable>
              <Text style={{ color: t.textMuted, fontWeight: '800' }}>{i + 1}</Text>
              <Pressable onPress={() => moveStep(x.id, 1)} disabled={i === open.length - 1} hitSlop={6}>
                <Text style={{ color: i === open.length - 1 ? t.border : t.textMuted, fontSize: 16 }}>▼</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <TaskRow task={x} onPress={() => setEditing(x)} />
            </View>
          </View>
        ))}
        {done.length > 0 && (
          <>
            <SectionTitle>Done</SectionTitle>
            {done.map((x) => (
              <TaskRow key={x.id} task={x} onPress={() => setEditing(x)} />
            ))}
          </>
        )}
      </ScrollView>
      <View style={[styles.fabWrap, { borderColor: t.border }]}>
        <Button label="+ Add step" onPress={() => setEditing('new')} style={{ flex: 1 }} />
      </View>
      {editing && (
        <TaskEditor
          visible
          task={editing === 'new' ? undefined : editing}
          defaults={{ projectId: project.id, priority: project.priority, schedule: project.schedule }}
          onClose={() => setEditing(null)}
        />
      )}
      {editProject && (
        <ProjectEditor
          project={project}
          onClose={(id) => {
            setEditProject(false);
            if (!id) onBack();
          }}
        />
      )}
    </View>
  );
}

export default function ProjectsScreen() {
  const t = useTheme();
  const { projects, tasks, plan } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const current = projects.find((p) => p.id === openId);
  if (current) return <ProjectDetail project={current} onBack={() => setOpenId(null)} />;

  const visible = projects.filter((p) => showArchived || !p.archived);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        {visible.length === 0 && (
          <Card>
            <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>No projects yet</Text>
            <Text style={{ color: t.textMuted }}>
              A project groups steps under one deadline. Turn on "Do steps in order" and each step is only scheduled
              after the one before it, so you can see when the whole thing will be done.
            </Text>
          </Card>
        )}
        {visible.map((p) => {
          const steps = tasks.filter((x) => x.projectId === p.id);
          const open = steps.filter((x) => !x.completed);
          const done = steps.length - open.length;
          const pct = steps.length ? done / steps.length : 0;
          const risk = open.some((x) => plan.atRisk.includes(x.id));
          return (
            <Pressable key={p.id} onPress={() => setOpenId(p.id)}>
              <Card style={{ opacity: p.archived ? 0.5 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.dot, { backgroundColor: p.color }]} />
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{p.name}</Text>
                  {risk && <Text style={{ color: t.warn, fontWeight: '700', fontSize: 12 }}>AT RISK</Text>}
                </View>
                <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 4 }}>
                  {done}/{steps.length} steps · {fmtDuration(open.reduce((s, x) => s + remainingMinutes(x), 0))} left
                  {p.deadline ? ` · due ${fmtDateTime(p.deadline)}` : ''}
                </Text>
                <View style={[styles.progress, { backgroundColor: t.surfaceAlt }]}>
                  <View style={{ width: `${pct * 100}%`, backgroundColor: p.color, height: '100%', borderRadius: 3 }} />
                </View>
              </Card>
            </Pressable>
          );
        })}
        {projects.some((p) => p.archived) && (
          <Chip label={showArchived ? 'Hide archived' : 'Show archived'} onPress={() => setShowArchived(!showArchived)} />
        )}
      </ScrollView>
      <View style={[styles.fabWrap, { borderColor: t.border }]}>
        <Button label="+ New project" onPress={() => setCreating(true)} style={{ flex: 1 }} />
      </View>
      {creating && (
        <ProjectEditor
          onClose={(id) => {
            setCreating(false);
            if (id) setOpenId(id);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerText: { fontSize: 18, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 40 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: 34, height: 34, borderRadius: 17, marginRight: 10, marginBottom: 10, borderWidth: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  content: { padding: 16, paddingBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  progress: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  reorder: { alignItems: 'center', paddingTop: 10, width: 22 },
  fabWrap: { padding: 16, borderTopWidth: 1, flexDirection: 'row' },
});
