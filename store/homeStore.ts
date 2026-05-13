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
  _alertedToday: Set<string>;
  checkDoseAlerts: () => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useHomeStore = create<HomeState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ──
    data: loadDrugData(),
    savedData: loadDrugData(),
    photos: loadPhotos(),
    times: loadTimes(),
    history: loadHistory(),
    editing: false,
    previewUri: null,
    editingTimeIndex: null,
    doseAlertIndex: null,
    _alertedToday: new Set(),

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

    // ── Clock check (called by interval) ──
    checkDoseAlerts: () => {
      const { editing, times, savedData, _alertedToday } = get();
      if (editing) return;

      const now = nowAsTimeString();
      times.forEach((t, i) => {
        const dateKey = `${format(new Date(), "yyyy-MM-dd")}-${i}`;
        if (t === now && !_alertedToday.has(dateKey)) {
          _alertedToday.add(dateKey);
          set({ doseAlertIndex: i });
          const drugs = savedData
            .filter((d) => d[TIME_FIELDS[i]] > 0)
            .map((d) => ({ name: d.name, qty: d[TIME_FIELDS[i]] }));
          speakDoseReminder(i, drugs);
        }
      });
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
