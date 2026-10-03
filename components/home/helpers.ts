import { storage } from "@/store/storage";
import { format, set } from "date-fns";
import * as Battery from "expo-battery";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { Platform } from "react-native";
import {
  DEFAULT_TIMES,
  DOSE_NOTIFICATION_CHANNEL_ID,
  type DoseRecord,
  type Drug,
  LEGACY_NOTIFICATION_CHANNEL_IDS,
  type SlotDayState,
  STORAGE_KEY_BATTERY_PROMPT_SHOWN,
  STORAGE_KEY_DATA,
  STORAGE_KEY_FIRST_LAUNCH_DONE,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_NOTES,
  STORAGE_KEY_PHOTOS,
  STORAGE_KEY_SLOT_STATE,
  STORAGE_KEY_TIME,
  TIME_FIELDS,
  TIME_ICONS,
  TIME_LABELS,
} from "./types";

// ─── Notification handler (call once at module level) ─────────────────────────

export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const loadDrugData = (): Drug[] => {
  try {
    const json = storage.getString(STORAGE_KEY_DATA);
    if (json) return JSON.parse(json);
  } catch {}
  return Array.from({ length: 6 }, (_, i) => ({
    name: `Slot #${i + 1}`,
    morning: 0,
    noon: 0,
    evening: 0,
  }));
};

export const loadPhotos = (): Record<string, string> => {
  try {
    const json = storage.getString(STORAGE_KEY_PHOTOS);
    if (json) return JSON.parse(json);
  } catch {}
  return {};
};

export const loadNotes = (): Record<string, string> => {
  try {
    const json = storage.getString(STORAGE_KEY_NOTES);
    if (json) return JSON.parse(json);
  } catch {}
  return {};
};

export const loadTimes = (): string[] => {
  try {
    const json = storage.getString(STORAGE_KEY_TIME);
    if (json) return JSON.parse(json);
  } catch {}
  return DEFAULT_TIMES;
};

export const loadHistory = (): DoseRecord[] => {
  try {
    const json = storage.getString(STORAGE_KEY_HISTORY);
    if (json) return JSON.parse(json);
  } catch {}
  return [];
};

export const loadSlotState = (): SlotDayState => {
  const today = todayKey();
  try {
    const json = storage.getString(STORAGE_KEY_SLOT_STATE);
    if (json) {
      const parsed = JSON.parse(json) as SlotDayState;
      // Yesterday's answers must not silence today's alerts.
      if (parsed?.date === today && parsed.resolved) return parsed;
    }
  } catch {}
  return { date: today, resolved: {} };
};

/** True once the app has ever run the entry-alert check (persists across restarts). */
export const hasCompletedFirstLaunch = (): boolean =>
  storage.getBoolean(STORAGE_KEY_FIRST_LAUNCH_DONE) === true;

export const markFirstLaunchDone = () => {
  storage.set(STORAGE_KEY_FIRST_LAUNCH_DONE, true);
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

export const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
};

export const todayKey = () => format(new Date(), "yyyy-MM-dd");

/** Minutes elapsed since midnight — the unit the dose window is compared in. */
export const minutesOfDay = (d: Date = new Date()) =>
  d.getHours() * 60 + d.getMinutes();

/** "HH:mm" → minutes since midnight, or null when the stored value is junk. */
export const timeToMinutes = (t: string): number | null => {
  const { h, m } = parseTime(t);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

export const formatTime = (h: number, m: number) =>
  format(
    set(new Date(), { hours: h, minutes: m, seconds: 0, milliseconds: 0 }),
    "HH:mm",
  );

export const nowAsTimeString = () => format(new Date(), "HH:mm");

// ─── Speech helpers ───────────────────────────────────────────────────────────

export function buildSpeechText(
  slotLabel: string,
  drugs: { name: string; qty: number }[],
): string {
  if (drugs.length === 0) {
    return `${slotLabel} reminder. No medications scheduled for this time.`;
  }

  const drugParts = drugs.map((d) => {
    const tablet = d.qty === 1 ? "tablet" : "tablets";
    return `${d.qty} ${tablet} of ${d.name}`;
  });

  const list =
    drugParts.length === 1
      ? drugParts[0]
      : drugParts.slice(0, -1).join(", ") + ", and " + drugParts.at(-1);

  return `It's time for your ${slotLabel.toLowerCase()} medications. Please take ${list}.`;
}

export function speakDoseReminder(
  slotIndex: number,
  drugs: { name: string; qty: number }[],
) {
  const text = buildSpeechText(TIME_LABELS[slotIndex], drugs);
  Speech.stop();
  Speech.speak(text, {
    language: "en-US",
    pitch: 1.0,
    rate: 0.9,
  });
}

// ─── Notification helpers ─────────────────────────────────────────────────────

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Request permission (if needed) and re-arm the daily OS notifications.
 * Safe to call on every app start — it cancels before scheduling.
 */
export async function syncSlotNotifications(times: string[]) {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  await scheduleSlotNotifications(times);
  return true;
}

async function ensureDoseChannel() {
  if (Platform.OS !== "android") return;
  for (const id of LEGACY_NOTIFICATION_CHANNEL_IDS) {
    await Notifications.deleteNotificationChannelAsync(id);
  }
  // Without a dedicated MAX channel, reminders land in the default channel,
  // which shows silently in the shade instead of as a heads-up alert.
  await Notifications.setNotificationChannelAsync(DOSE_NOTIFICATION_CHANNEL_ID, {
    name: "Dose reminders",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // Only honoured once the user grants "Do Not Disturb access".
    bypassDnd: true,
    // Alarm stream: rings at alarm volume even when the ringer is silent.
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
}

/**
 * Asks Android (once) to exempt the app from battery optimisation, so Doze
 * and OEM power managers don't defer or kill the dose alarms. Call after the
 * notification permission prompt so the two system dialogs don't overlap.
 */
export async function requestBatteryOptimizationExemption() {
  if (Platform.OS !== "android") return;
  if (storage.getBoolean(STORAGE_KEY_BATTERY_PROMPT_SHOWN)) return;
  if (!(await Battery.isBatteryOptimizationEnabledAsync())) return;

  const pkg = Constants.expoConfig?.android?.package;
  if (!pkg) return;
  storage.set(STORAGE_KEY_BATTERY_PROMPT_SHOWN, true);
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${pkg}` },
    );
  } catch {
    // Some OEM ROMs strip this dialog — fall back to the settings list.
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    ).catch(() => {});
  }
}

export async function scheduleSlotNotifications(times: string[]) {
  await ensureDoseChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (let i = 0; i < times.length; i++) {
    const minutes = timeToMinutes(times[i]);
    if (minutes === null) continue;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${TIME_ICONS[i]} Time to take your medication!`,
        body: `${TIME_LABELS[i]} — ${times[i]}. Open the app to confirm.`,
        data: { slotIndex: i, slotKey: TIME_FIELDS[i] },
        priority: Notifications.AndroidNotificationPriority.MAX,
        sound: "default",
        interruptionLevel: "timeSensitive",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: h,
        minute: m,
        channelId: DOSE_NOTIFICATION_CHANNEL_ID,
      },
    });
  }
}
