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

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIME_LABELS = ["MORNING", "NOON", "EVENING"] as const;
export const TIME_FIELDS: TimeSlotKey[] = ["morning", "noon", "evening"];
export const TIME_ICONS = ["🌅", "☀️", "🌙"];
export const DEFAULT_TIMES = ["08:30", "12:30", "18:30"];

export const STORAGE_KEY_DATA = "home:drugData";
export const STORAGE_KEY_PHOTOS = "home:photos";
export const STORAGE_KEY_TIME = "home:time";
export const STORAGE_KEY_HISTORY = "home:doseHistory";
