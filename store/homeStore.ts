import {
  loadDrugData,
  loadHistory,
  loadPhotos,
  loadTimes,
  nowAsTimeString,
  requestNotificationPermission,
  scheduleSlotNotifications,
  speakDoseReminder,
} from "@/components/home/helpers";
import {
  STORAGE_KEY_DATA,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_PHOTOS,
  STORAGE_KEY_TIME,
  TIME_FIELDS,
  type DoseRecord,
  type Drug,
  type TimeSlotKey,
} from "@/components/home/types";
import { storage } from "@/store/storage";
import { format } from "date-fns";
import * as Speech from "expo-speech";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeState = {
  // ── Persistent data ──
  data: Drug[];
  savedData: Drug[];
  photos: Record<string, string>;
  times: string[];
  history: DoseRecord[];

  // ── UI state ──
  editing: boolean;
  previewUri: string | null;
  editingTimeIndex: number | null;
  doseAlertIndex: number | null;

  // ── Actions ──
  setEditing: (editing: boolean) => void;
  increment: (index: number, field: TimeSlotKey) => void;
  handleSave: () => void;
  handleHeaderPress: (i: number) => void;
  setPreviewUri: (uri: string | null) => void;
  setEditingTimeIndex: (index: number | null) => void;
  setDoseAlertIndex: (index: number | null) => void;
  setTimes: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPhoto: (key: string, uri: string) => void;
  handleDoseConfirm: (
    slotKey: TimeSlotKey,
    drugs: { name: string; qty: number }[],
  ) => void;
  clearHistory: () => void;

  // ── Internal (clock check) ──
  _alertedToday: Record<string, boolean>;
  _lastAlertDate: string;
  checkDoseAlerts: () => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

const initialDrugData = loadDrugData();

export const useHomeStore = create<HomeState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ──
    data: initialDrugData,
    savedData: initialDrugData,
    photos: loadPhotos(),
    times: loadTimes(),
    history: loadHistory(),
    editing: false,
    previewUri: null,
    editingTimeIndex: null,
    doseAlertIndex: null,
    _alertedToday: {},

    // ── Actions ──
    setEditing: (editing) => set({ editing }),

    increment: (index, field) =>
      set((state) => ({
        data: state.data.map((item, i) =>
          i === index ? { ...item, [field]: item[field] + 1 } : item,
        ),
      })),

    handleSave: () => {
      const { data } = get();
      set({ savedData: data, editing: false });
    },

    handleHeaderPress: (i) => {
      const { editing } = get();
      if (!editing) return;
      set((state) => ({
        times: state.times.map((t, idx) => (idx === i ? nowAsTimeString() : t)),
        editingTimeIndex: i,
      }));
    },

    setPreviewUri: (uri) => set({ previewUri: uri }),
    setEditingTimeIndex: (index) => set({ editingTimeIndex: index }),
    setDoseAlertIndex: (index) => set({ doseAlertIndex: index }),

    setTimes: (updater) =>
      set((state) => ({
        times: typeof updater === "function" ? updater(state.times) : updater,
      })),

    setPhoto: (key, uri) =>
      set((state) => ({ photos: { ...state.photos, [key]: uri } })),

    handleDoseConfirm: (slotKey, drugs) => {
      const record: DoseRecord = {
        takenAt: new Date().toISOString(),
        slotKey,
        drugs,
      };
      set((state) => ({
        history: [record, ...state.history],
        doseAlertIndex: null,
      }));
      Speech.stop();
    },

    clearHistory: () => set({ history: [] }),
    _lastAlertDate: format(new Date(), "yyyy-MM-dd"),

    // ── Clock check (called by interval) ──
    checkDoseAlerts: () => {
      const { editing, times, savedData, _alertedToday, _lastAlertDate } =
        get();
      if (editing) return;

      const today = format(new Date(), "yyyy-MM-dd");

      // Reset alerts at midnight
      if (today !== _lastAlertDate) {
        set({ _alertedToday: {}, _lastAlertDate: today });
        return;
      }

      const currentMinute = nowAsTimeString();
      const matchedIndex = times.findIndex(
        (t, i) => t === currentMinute && !_alertedToday[`${i}`],
      );
      if (matchedIndex === -1) return;

      const key = `${matchedIndex}`;
      set({
        _alertedToday: { ..._alertedToday, [key]: true },
        doseAlertIndex: matchedIndex,
      });

      const drugs = savedData
        .filter((d) => d[TIME_FIELDS[matchedIndex]] > 0)
        .map((d) => ({ name: d.name, qty: d[TIME_FIELDS[matchedIndex]] }));
      speakDoseReminder(matchedIndex, drugs);
    },
  })),
);

// ─── Side effects: persist to MMKV on change ─────────────────────────────────

useHomeStore.subscribe(
  (s) => s.savedData,
  (savedData) => storage.set(STORAGE_KEY_DATA, JSON.stringify(savedData)),
);

useHomeStore.subscribe(
  (s) => s.photos,
  (photos) => storage.set(STORAGE_KEY_PHOTOS, JSON.stringify(photos)),
);

useHomeStore.subscribe(
  (s) => s.times,
  (times) => {
    storage.set(STORAGE_KEY_TIME, JSON.stringify(times));
    requestNotificationPermission().then((granted) => {
      if (granted) scheduleSlotNotifications(times);
    });
  },
);

useHomeStore.subscribe(
  (s) => s.history,
  (history) => storage.set(STORAGE_KEY_HISTORY, JSON.stringify(history)),
);
