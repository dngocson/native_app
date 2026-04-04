import { storage } from "@/store/storage";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import {
  DEFAULT_TIMES,
  type DoseRecord,
  type Drug,
  STORAGE_KEY_DATA,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_PHOTOS,
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
    name: `Drug #${i + 1}`,
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

// ─── Time helpers ─────────────────────────────────────────────────────────────

export const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
};

export const formatTime = (h: number, m: number) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export const nowAsTimeString = () => {
  const now = new Date();
  return formatTime(now.getHours(), now.getMinutes());
};

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

export async function scheduleSlotNotifications(times: string[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (let i = 0; i < times.length; i++) {
    const { h, m } = parseTime(times[i]);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${TIME_ICONS[i]} Time to take your medication!`,
        body: `${TIME_LABELS[i]} — ${times[i]}. Open the app to confirm.`,
        data: { slotIndex: i, slotKey: TIME_FIELDS[i] },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: h,
        minute: m,
      },
    });
  }
}
