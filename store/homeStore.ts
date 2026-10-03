import {
  hasCompletedFirstLaunch,
  loadDrugData,
  loadHistory,
  loadNotes,
  loadPhotos,
  loadSlotState,
  loadTimes,
  markFirstLaunchDone,
  minutesOfDay,
  speakDoseReminder,
  syncSlotNotifications,
  timeToMinutes,
  todayKey,
} from "@/components/home/helpers";
import {
  DOSE_CATCH_UP_MINUTES,
  DOSE_SNOOZE_MINUTES,
  STORAGE_KEY_DATA,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_NOTES,
  STORAGE_KEY_PHOTOS,
  STORAGE_KEY_SLOT_STATE,
  STORAGE_KEY_TIME,
  TIME_FIELDS,
  type DoseRecord,
  type Drug,
  type SlotDayState,
  type SlotResolution,
  type TimeSlotKey,
} from "@/components/home/types";
import { BLE_DATA_TYPE, BLE_EVENT_TYPE } from "@/constants/theme";
import { useBluetoothStore } from "@/store/bluetoothStore";
import { storage } from "@/store/storage";
import { navigate } from "@/utils/NavigationService";
import * as Speech from "expo-speech";
import slugify from "slugify";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeState = {
  /**
   * Working copy edited while `editing === true`. Deliberately NOT
   * persisted to MMKV (no subscribe below) — so if the app is killed
   * mid-edit, the next launch re-reads `savedData` from storage into both
   * `data` and `savedData`, discarding any unsaved temp changes instead of
   * resurrecting them. Only committed via `handleSave()` → `savedData`.
   */
  data: Drug[];

  // ── Persistent data ──
  savedData: Drug[];
  photos: Record<string, string>;
  notes: Record<string, string>;
  times: string[];
  history: DoseRecord[];

  // ── UI state ──
  editing: boolean;
  previewUri: string | null;
  editingTimeIndex: number | null;
  doseAlertIndex: number | null;
  /** Photo-or-note chooser popup, opened from a drug label press. */
  labelPicker: { key: string; label: string } | null;
  /** Note editor (editing mode) / viewer (view mode) for a drug. */
  noteModal: { key: string; label: string; mode: "edit" | "view" } | null;
  /** Shown from `handleSave()` when no BLE device is connected. */
  bluetoothRequiredPromptVisible: boolean;
  /** True while `handleSave()` is writing the plan to the board over BLE. */
  saving: boolean;

  // ── Actions ──
  setEditing: (editing: boolean) => void;
  increment: (index: number, field: TimeSlotKey) => void;
  decrement: (index: number, field: TimeSlotKey) => void;
  handleSave: () => Promise<void>;
  handleHeaderPress: (i: number) => void;
  setPreviewUri: (uri: string | null) => void;
  setEditingTimeIndex: (index: number | null) => void;
  setTimes: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPhoto: (key: string, uri: string) => void;
  setNote: (key: string, note: string) => void;

  /** Drug label pressed — open the photo-or-note chooser popup. */
  openLabelPicker: (label: string) => void;
  closeLabelPicker: () => void;
  /**
   * Camera icon pressed in the chooser. Closes the popup; in view mode with
   * an existing photo it opens the preview directly. Returns the drug key
   * when the screen still needs to navigate to the Camera screen (editing
   * mode) — null otherwise.
   */
  pickCameraFromLabelPicker: () => string | null;
  /** Note icon pressed in the chooser — opens the note editor/viewer. */
  pickNoteFromLabelPicker: () => void;
  /** Save button in the note editor — persists the note and closes it. */
  saveNote: (text: string) => void;
  closeNoteModal: () => void;
  handleDoseConfirm: (
    slotKey: TimeSlotKey,
    drugs: { name: string; qty: number }[],
  ) => void;
  /** "Skip" button — resolves the slot for today without writing history. */
  handleDoseSkip: () => void;
  /** Tap-outside / back button — hide now, re-ask in DOSE_SNOOZE_MINUTES. */
  snoozeDoseAlert: () => void;
  clearHistory: () => void;

  /** Open the modal for a slot (notification tap), unless already answered. */
  openDoseAlert: (slotIndex: number) => void;

  /** "Go connect" chosen from the Bluetooth-required prompt. */
  goConnectBluetooth: () => void;
  /** "Undo changes" chosen from the Bluetooth-required prompt — restores
   * drug quantities to how they were when Edit was pressed, exits editing. */
  revertPendingEdit: () => void;
  /** Tap-outside / back — just hides the prompt, keeps editing untouched. */
  dismissBluetoothRequiredPrompt: () => void;

  // ── Internal ──
  /** Snapshot of `data` taken when Edit was pressed — lets "Undo changes"
   * restore drug quantities if Save is blocked by a missing BLE connection. */
  _dataBeforeEdit: Drug[] | null;
  /** Per-day answer sheet, persisted to MMKV. */
  _slotState: SlotDayState;
  /** slotIndex → epoch ms before which the slot stays quiet. */
  _snoozedUntil: Record<string, number>;
  checkDoseAlerts: (opts?: { ignoreCatchUp?: boolean }) => void;
  /**
   * Call once when the screen mounts. On the very first run ever (fresh
   * install, or app data cleared) it raises the alert for the nearest slot
   * whose time has already passed "today", ignoring the catch-up cap — so
   * the user always sees one popup on entry, whatever time they installed
   * the app. Every later mount behaves like a normal `checkDoseAlerts()`.
   */
  checkInitialDoseAlert: () => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

const initialDrugData = loadDrugData();

export const useHomeStore = create<HomeState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ──
    data: initialDrugData,
    savedData: initialDrugData,
    photos: loadPhotos(),
    notes: loadNotes(),
    times: loadTimes(),
    history: loadHistory(),
    editing: false,
    previewUri: null,
    editingTimeIndex: null,
    doseAlertIndex: null,
    labelPicker: null,
    noteModal: null,
    bluetoothRequiredPromptVisible: false,
    saving: false,
    _dataBeforeEdit: null,
    _slotState: loadSlotState(),
    _snoozedUntil: {},

    // ── Actions ──
    setEditing: (editing) =>
      set((state) => ({
        editing,
        // Snapshot drug quantities on the way in, drop it on the way out —
        // it's only needed to power "Undo changes" while editing is active.
        _dataBeforeEdit: editing ? state.data : null,
      })),

    increment: (index, field) =>
      set((state) => ({
        data: state.data.map((item, i) =>
          i === index ? { ...item, [field]: item[field] + 1 } : item,
        ),
      })),

    decrement: (index, field) =>
      set((state) => ({
        data: state.data.map((item, i) =>
          i === index
            ? { ...item, [field]: Math.max(0, item[field] - 1) }
            : item,
        ),
      })),

    handleSave: async () => {
      if (get().saving) return;
      const { connectedDevice, sendPayload } = useBluetoothStore.getState();

      // No point committing drug quantities the device will never receive —
      // ask the user to connect or undo instead (mục 3, popup 2 lựa chọn).
      if (!connectedDevice) {
        set({ bluetoothRequiredPromptVisible: true });
        return;
      }

      const { data, times } = get();
      set({ saving: true });
      const sent = await sendPayload({
        type: BLE_DATA_TYPE.EVENT,
        message: {
          name: BLE_EVENT_TYPE.SETTING_ALARM_TIME,
          time: times,
          drugslot: data,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        },
      });

      // Only commit what the board actually received; on failure stay in
      // edit mode so the user can retry (the BLE error is in bluetoothStore).
      if (!sent) {
        set({ saving: false });
        return;
      }
      set({
        saving: false,
        savedData: data,
        editing: false,
        _dataBeforeEdit: null,
      });
    },
    handleHeaderPress: (i) => {
      const { editing } = get();
      if (!editing) return;
      set(() => ({
        editingTimeIndex: i,
      }));
    },

    setPreviewUri: (uri) => set({ previewUri: uri }),
    setEditingTimeIndex: (index) => set({ editingTimeIndex: index }),

    setTimes: (updater) =>
      set((state) => ({
        times: typeof updater === "function" ? updater(state.times) : updater,
      })),

    setPhoto: (key, uri) =>
      set((state) => ({ photos: { ...state.photos, [key]: uri } })),

    setNote: (key, note) =>
      set((state) => ({ notes: { ...state.notes, [key]: note } })),

    openLabelPicker: (label) => {
      const key = slugify(label, { lower: true, strict: true, replacement: "-" });
      set({ labelPicker: { key, label } });
    },
    closeLabelPicker: () => set({ labelPicker: null }),

    pickCameraFromLabelPicker: () => {
      const { labelPicker, editing, photos } = get();
      if (!labelPicker) return null;
      const { key } = labelPicker;
      set({ labelPicker: null });
      if (editing) return key;
      if (photos[key]) set({ previewUri: photos[key] });
      return null;
    },

    pickNoteFromLabelPicker: () => {
      const { labelPicker, editing } = get();
      if (!labelPicker) return;
      const { key, label } = labelPicker;
      set({
        labelPicker: null,
        noteModal: { key, label, mode: editing ? "edit" : "view" },
      });
    },

    saveNote: (text) => {
      const { noteModal } = get();
      if (!noteModal) return;
      get().setNote(noteModal.key, text.trim());
      set({ noteModal: null });
    },
    closeNoteModal: () => set({ noteModal: null }),

    handleDoseConfirm: (slotKey, drugs) => {
      const record: DoseRecord = {
        takenAt: new Date().toISOString(),
        slotKey,
        drugs,
      };
      const slotIndex = TIME_FIELDS.indexOf(slotKey);
      set((state) => ({
        history: [record, ...state.history],
        doseAlertIndex: null,
        _slotState: resolveSlot(state._slotState, slotIndex, "taken"),
      }));
      Speech.stop();
    },

    handleDoseSkip: () => {
      const { doseAlertIndex } = get();
      set((state) => ({
        doseAlertIndex: null,
        _slotState:
          doseAlertIndex === null
            ? state._slotState
            : resolveSlot(state._slotState, doseAlertIndex, "skipped"),
      }));
      Speech.stop();
    },

    snoozeDoseAlert: () => {
      const { doseAlertIndex } = get();
      if (doseAlertIndex === null) {
        set({ doseAlertIndex: null });
        return;
      }
      set((state) => ({
        doseAlertIndex: null,
        _snoozedUntil: {
          ...state._snoozedUntil,
          [`${doseAlertIndex}`]: Date.now() + DOSE_SNOOZE_MINUTES * 60_000,
        },
      }));
      Speech.stop();
    },

    clearHistory: () => set({ history: [] }),

    openDoseAlert: (slotIndex) => {
      if (slotIndex < 0 || slotIndex >= TIME_FIELDS.length) return;
      const slotState = rollOverDay(get()._slotState);
      if (slotState.resolved[`${slotIndex}`]) {
        // Already taken/skipped today — nothing to ask.
        set({ _slotState: slotState });
        return;
      }
      set({ _slotState: slotState, doseAlertIndex: slotIndex });

      const field = TIME_FIELDS[slotIndex];
      const drugs = get()
        .savedData.filter((d) => d[field] > 0)
        .map((d) => ({ name: d.name, qty: d[field] }));
      speakDoseReminder(slotIndex, drugs);
    },

    goConnectBluetooth: () => {
      set({ bluetoothRequiredPromptVisible: false });
      navigate("BleDevices");
    },

    revertPendingEdit: () => {
      const { _dataBeforeEdit } = get();
      set((state) => ({
        data: _dataBeforeEdit ?? state.data,
        editing: false,
        _dataBeforeEdit: null,
        bluetoothRequiredPromptVisible: false,
      }));
    },

    dismissBluetoothRequiredPrompt: () =>
      set({ bluetoothRequiredPromptVisible: false }),

    // ── Clock check (interval + AppState resume) ──
    checkDoseAlerts: (opts) => {
      const { editing, times, savedData, doseAlertIndex, _snoozedUntil } =
        get();

      // Roll the day over first, otherwise a session that survives midnight
      // keeps yesterday's answers and never alerts again.
      const slotState = rollOverDay(get()._slotState);
      if (slotState !== get()._slotState) {
        set({ _slotState: slotState, _snoozedUntil: {} });
      }

      // Modal already open, or the user is mid-edit: bail WITHOUT marking
      // anything, so the next tick re-evaluates and nothing is lost.
      if (editing || doseAlertIndex !== null) return;

      const now = Date.now();
      const nowMin = minutesOfDay();
      const catchUpCap = opts?.ignoreCatchUp
        ? Number.POSITIVE_INFINITY
        : DOSE_CATCH_UP_MINUTES;

      // Pick the latest slot that is due, unanswered and not snoozed.
      // A window (not an exact "HH:mm" equality) is what makes catch-up work:
      // JS timers are frozen while the app is backgrounded, so the one tick
      // that fell inside the scheduled minute may simply never have happened.
      let dueIndex = -1;
      let dueMin = -1;
      for (let i = 0; i < times.length; i++) {
        const slotMin = timeToMinutes(times[i]);
        if (slotMin === null) continue;

        const lateBy = nowMin - slotMin;
        if (lateBy < 0 || lateBy > catchUpCap) continue;
        if (slotState.resolved[`${i}`]) continue;
        if ((_snoozedUntil[`${i}`] ?? 0) > now) continue;

        if (slotMin > dueMin) {
          dueMin = slotMin;
          dueIndex = i;
        }
      }
      if (dueIndex === -1) return;

      set({ doseAlertIndex: dueIndex });

      const field = TIME_FIELDS[dueIndex];
      const drugs = savedData
        .filter((d) => d[field] > 0)
        .map((d) => ({ name: d.name, qty: d[field] }));
      speakDoseReminder(dueIndex, drugs);
    },

    checkInitialDoseAlert: () => {
      const alreadyLaunched = hasCompletedFirstLaunch();
      if (alreadyLaunched) {
        get().checkDoseAlerts();
        return;
      }
      markFirstLaunchDone();
      get().checkDoseAlerts({ ignoreCatchUp: true });
    },
  })),
);

// ─── Slot-state helpers ───────────────────────────────────────────────────────

/** Return a fresh answer sheet when the calendar day changed. */
function rollOverDay(state: SlotDayState): SlotDayState {
  const today = todayKey();
  return state.date === today ? state : { date: today, resolved: {} };
}

function resolveSlot(
  state: SlotDayState,
  slotIndex: number,
  resolution: SlotResolution,
): SlotDayState {
  if (slotIndex < 0) return state;
  const base = rollOverDay(state);
  return {
    date: base.date,
    resolved: { ...base.resolved, [`${slotIndex}`]: resolution },
  };
}

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
  (s) => s.notes,
  (notes) => storage.set(STORAGE_KEY_NOTES, JSON.stringify(notes)),
);

useHomeStore.subscribe(
  (s) => s.times,
  (times) => {
    storage.set(STORAGE_KEY_TIME, JSON.stringify(times));
    // Changing a time clears that slot's snooze, otherwise a slot moved to
    // "now" could stay silent for the rest of the snooze window.
    useHomeStore.setState({ _snoozedUntil: {} });
    syncSlotNotifications(times);
  },
);

useHomeStore.subscribe(
  (s) => s.history,
  (history) => storage.set(STORAGE_KEY_HISTORY, JSON.stringify(history)),
);

useHomeStore.subscribe(
  (s) => s._slotState,
  (slotState) => storage.set(STORAGE_KEY_SLOT_STATE, JSON.stringify(slotState)),
);
