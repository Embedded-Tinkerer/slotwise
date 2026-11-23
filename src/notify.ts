// Local reminders shortly before each planned task block starts.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { fmtTime } from './format';
import type { ScheduledBlock } from './types';

const CHANNEL = 'blocks';
const LOOKAHEAD_MS = 36 * 3600_000;
const MAX_SCHEDULED = 40;

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

let lastSignature = '';

/**
 * Replaces all scheduled reminders with one per upcoming block. Cheap to call
 * often: it does nothing when the upcoming blocks have not changed.
 */
export async function syncReminders(
  blocks: ScheduledBlock[],
  titleOf: (taskId: string) => string | undefined,
  minutesBefore: number,
  now: number = Date.now(),
): Promise<void> {
  if (Platform.OS === 'web') return;
  const upcoming =
    minutesBefore < 0
      ? []
      : blocks
          .filter((b) => {
            const fire = Date.parse(b.start) - minutesBefore * 60_000;
            return fire > now + 5_000 && fire < now + LOOKAHEAD_MS;
          })
          .slice(0, MAX_SCHEDULED);
  const signature = `${minutesBefore}|${upcoming.map((b) => `${b.taskId}@${b.start}`).join(',')}`;
  if (signature === lastSignature) return;
  lastSignature = signature;

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!upcoming.length) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();
  for (const b of upcoming) {
    const title = titleOf(b.taskId);
    if (!title) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: minutesBefore ? `In ${minutesBefore} min: ${title}` : `Now: ${title}`,
        body: `${fmtTime(b.start)} to ${fmtTime(b.end)}`,
        data: { taskId: b.taskId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.parse(b.start) - minutesBefore * 60_000),
        channelId: CHANNEL,
      },
    });
  }
}
