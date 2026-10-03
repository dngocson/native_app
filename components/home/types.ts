// ─── Shared Types ─────────────────────────────────────────────────────────────

export type Drug = {
  name: string;
  morning: number;
  noon: number;
  evening: number;
};

export type TimeSlotKey = "morning" | "noon" | "evening";

export type DoseRecord = {
  takenAt: string; // ISO string
  slotKey: TimeSlotKey;
  drugs: { name: string; qty: number }[];
};

/** How the user answered a slot for a given day. */
export type SlotResolution = "taken" | "skipped";

/** Per-day answer sheet — persisted so a restart can't re-ask an answered slot. */
export type SlotDayState = {
  date: string; // yyyy-MM-dd
  resolved: Record<string, SlotResolution>; // keyed by slot index as string
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIME_LABELS = ["MORNING", "NOON", "EVENING"] as const;
export const TIME_FIELDS: TimeSlotKey[] = ["morning", "noon", "evening"];
export const TIME_ICONS = ["🌅", "☀️", "🌙"];
export const DEFAULT_TIMES = ["08:30", "12:30", "18:30"];

export const STORAGE_KEY_DATA = "home:drugData";
export const STORAGE_KEY_PHOTOS = "home:photos";
export const STORAGE_KEY_NOTES = "home:notes";
export const STORAGE_KEY_TIME = "home:time";
export const STORAGE_KEY_HISTORY = "home:doseHistory";
export const STORAGE_KEY_SLOT_STATE = "home:slotState";
export const STORAGE_KEY_FIRST_LAUNCH_DONE = "home:firstLaunchDone";

/** Max characters allowed in a per-drug note. */
export const MAX_NOTE_LENGTH = 50;

/** How long after a scheduled time the modal can still be raised (catch-up). */
export const DOSE_CATCH_UP_MINUTES = 180;

/** How long a dismissed-but-unanswered alert stays quiet before re-appearing. */
export const DOSE_SNOOZE_MINUTES = 5;

/** Android notification channel for dose reminders (high importance = heads-up). */
// Android freezes a channel's sound/importance once created, so any change to
// those settings needs a new id (old ones are deleted on next schedule).
export const DOSE_NOTIFICATION_CHANNEL_ID = "dose-alarm-v2";
export const LEGACY_NOTIFICATION_CHANNEL_IDS = ["dose-reminders"];

export const STORAGE_KEY_BATTERY_PROMPT_SHOWN = "home:batteryPromptShown";

/** In-app clock tick interval. */
export const DOSE_CHECK_INTERVAL_MS = 30_000;
