import { Button, ButtonText } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import {
  Table,
  TableBody,
  TableData,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import { useBluetoothStore } from "@/store/bluetoothStore";
import { storage } from "@/store/storage";
import type { RootStackParamList, TabParamList } from "@/types/navigation";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Image as RNImage,
  ScrollView,
  View,
} from "react-native";
import slugify from "slugify";

// ─── Types ────────────────────────────────────────────────────────────────────

type Drug = {
  name: string;
  morning: number;
  noon: number;
  evening: number;
};

type TimeSlotKey = "morning" | "noon" | "evening";

type DoseRecord = {
  takenAt: string; // ISO string
  slotKey: TimeSlotKey;
  drugs: { name: string; qty: number }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_LABELS = ["MORNING", "NOON", "EVENING"] as const;
const TIME_FIELDS: TimeSlotKey[] = ["morning", "noon", "evening"];
const TIME_ICONS = ["🌅", "☀️", "🌙"];
const DEFAULT_TIMES = ["08:30", "12:30", "18:30"];

const STORAGE_KEY_DATA = "home:drugData";
const STORAGE_KEY_PHOTOS = "home:photos";
const STORAGE_KEY_TIME = "home:time";
const STORAGE_KEY_HISTORY = "home:doseHistory";

// ─── Storage helpers ──────────────────────────────────────────────────────────

const loadDrugData = (): Drug[] => {
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

const loadPhotos = (): Record<string, string> => {
  try {
    const json = storage.getString(STORAGE_KEY_PHOTOS);
    if (json) return JSON.parse(json);
  } catch {}
  return {};
};

const loadTimes = (): string[] => {
  try {
    const json = storage.getString(STORAGE_KEY_TIME);
    if (json) return JSON.parse(json);
  } catch {}
  return DEFAULT_TIMES;
};

const loadHistory = (): DoseRecord[] => {
  try {
    const json = storage.getString(STORAGE_KEY_HISTORY);
    if (json) return JSON.parse(json);
  } catch {}
  return [];
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
};

const formatTime = (h: number, m: number) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

const nowAsTimeString = () => {
  const now = new Date();
  return formatTime(now.getHours(), now.getMinutes());
};

// ─── Speech helper ────────────────────────────────────────────────────────────

function buildSpeechText(
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

function speakDoseReminder(
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

// ─── Notification setup ───────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function scheduleSlotNotifications(times: string[]) {
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

// ─── Sub-components ───────────────────────────────────────────────────────────

type SpinnerColumnProps = {
  value: number;
  onUp: () => void;
  onDown: () => void;
};

function SpinnerColumn({ value, onUp, onDown }: SpinnerColumnProps) {
  return (
    <View className="items-center">
      <Pressable
        onPress={onUp}
        className="bg-slate-700 rounded-xl w-14 h-10 items-center justify-center active:bg-slate-600 mb-2"
      >
        <Text className="text-white text-lg">▲</Text>
      </Pressable>
      <View className="bg-slate-700 rounded-xl w-14 h-14 items-center justify-center">
        <Text className="text-white text-2xl font-bold">
          {String(value).padStart(2, "0")}
        </Text>
      </View>
      <Pressable
        onPress={onDown}
        className="bg-slate-700 rounded-xl w-14 h-10 items-center justify-center active:bg-slate-600 mt-2"
      >
        <Text className="text-white text-lg">▼</Text>
      </Pressable>
    </View>
  );
}

type TimePickerModalProps = {
  visible: boolean;
  index: number | null;
  times: string[];
  onClose: () => void;
  onChangeTime: (updater: (prev: string[]) => string[]) => void;
};

function TimePickerModal({
  visible,
  index,
  times,
  onClose,
  onChangeTime,
}: TimePickerModalProps) {
  if (index === null) return null;
  const { h, m } = parseTime(times[index]);

  const adjust = (field: "h" | "m", delta: number) => {
    onChangeTime((prev) => {
      const { h: ph, m: pm } = parseTime(prev[index]);
      const newH = field === "h" ? (ph + delta + 24) % 24 : ph;
      const newM = field === "m" ? (pm + delta + 60) % 60 : pm;
      return prev.map((t, i) => (i === index ? formatTime(newH, newM) : t));
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/80 items-center justify-center px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-slate-800 rounded-2xl p-6 w-72">
            <Text className="text-white font-bold text-base text-center mb-1">
              {TIME_ICONS[index]} {TIME_LABELS[index]}
            </Text>
            <Text className="text-slate-400 text-xs text-center mb-6">
              Set medication time
            </Text>

            <View className="flex-row items-center justify-center gap-4">
              <SpinnerColumn
                value={h}
                onUp={() => adjust("h", 1)}
                onDown={() => adjust("h", -1)}
              />
              <Text className="text-white text-3xl font-bold mb-4">:</Text>
              <SpinnerColumn
                value={m}
                onUp={() => adjust("m", 1)}
                onDown={() => adjust("m", -1)}
              />
            </View>

            <Pressable
              onPress={onClose}
              className="mt-6 bg-emerald-500 active:bg-emerald-600 rounded-xl py-3 items-center"
            >
              <Text className="text-white font-bold">Confirm</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Dose Alert Modal ─────────────────────────────────────────────────────────

type DoseAlertModalProps = {
  visible: boolean;
  slotIndex: number | null;
  data: Drug[];
  onConfirm: (
    slotKey: TimeSlotKey,
    drugs: { name: string; qty: number }[],
  ) => void;
  onDismiss: () => void;
};

function DoseAlertModal({
  visible,
  slotIndex,
  data,
  onConfirm,
  onDismiss,
}: DoseAlertModalProps) {
  if (slotIndex === null) return null;

  const slotKey = TIME_FIELDS[slotIndex];
  const drugs = data
    .filter((d) => d[slotKey] > 0)
    .map((d) => ({ name: d.name, qty: d[slotKey] }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        className="flex-1 bg-black/80 items-center justify-center px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm">
            {/* Header */}
            <View className="items-center mb-4">
              <Text className="text-4xl mb-2">{TIME_ICONS[slotIndex]}</Text>
              <Text className="text-white font-bold text-lg text-center">
                Time to take your medication!
              </Text>
              <Text className="text-slate-400 text-xs text-center mt-1">
                {TIME_LABELS[slotIndex]}
              </Text>
            </View>

            {/* Drug list */}
            <View className="bg-slate-700/50 rounded-xl p-4 mb-6">
              {drugs.length === 0 ? (
                <Text className="text-slate-400 text-sm text-center">
                  No medications scheduled for this time slot.
                </Text>
              ) : (
                drugs.map((d, i) => (
                  <View
                    key={i}
                    className="flex-row items-center justify-between py-2 border-b border-slate-600 last:border-0"
                  >
                    <Text className="text-blue-300 font-bold text-sm flex-1">
                      {d.name}
                    </Text>
                    <View className="bg-emerald-500/20 rounded-lg px-3 py-1 ml-3">
                      <Text className="text-emerald-400 text-sm font-bold">
                        {d.qty} {d.qty === 1 ? "tablet" : "tablets"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={onDismiss}
                className="flex-1 bg-slate-700 active:bg-slate-600 rounded-xl py-3 items-center"
              >
                <Text className="text-slate-300 font-bold text-sm">Skip</Text>
              </Pressable>
              <Pressable
                onPress={() => onConfirm(slotKey, drugs)}
                className="flex-2 bg-emerald-500 active:bg-emerald-600 rounded-xl py-3 px-6 items-center"
              >
                <Text className="text-white font-bold text-sm">✓ Taken</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, "Home">>();
  const { connectedDevice, disconnectDevice } = useBluetoothStore();

  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<Drug[]>(loadDrugData);
  const [photos, setPhotos] = useState<Record<string, string>>(loadPhotos);
  const [times, setTimes] = useState<string[]>(loadTimes);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [doseAlertIndex, setDoseAlertIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<DoseRecord[]>(loadHistory);

  const alertedToday = useRef<Set<string>>(new Set());

  // ── Persist ────────────────────────────────────────────────────────────────

  useEffect(() => {
    storage.set(STORAGE_KEY_DATA, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    storage.set(STORAGE_KEY_PHOTOS, JSON.stringify(photos));
  }, [photos]);

  useEffect(() => {
    storage.set(STORAGE_KEY_TIME, JSON.stringify(times));
  }, [times]);

  useEffect(() => {
    storage.set(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [history]);

  // ── Notifications ─────────────────────────────────────────────────────────

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      if (granted) scheduleSlotNotifications(times);
    });
  }, [times]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const slotIndex = response.notification.request.content.data
          ?.slotIndex as number | undefined;
        if (slotIndex !== undefined) setDoseAlertIndex(slotIndex);
      },
    );
    return () => sub.remove();
  }, []);

  // ── In-app clock ──────────────────────────────────────────────────────────

  useEffect(() => {
    alertedToday.current = new Set();

    const check = () => {
      const now = nowAsTimeString();
      times.forEach((t, i) => {
        const dateKey = `${new Date().toDateString()}-${i}`;
        if (t === now && !alertedToday.current.has(dateKey)) {
          alertedToday.current.add(dateKey);
          setDoseAlertIndex(i);
          // Speak the reminder
          const drugs = data
            .filter((d) => d[TIME_FIELDS[i]] > 0)
            .map((d) => ({ name: d.name, qty: d[TIME_FIELDS[i]] }));
          speakDoseReminder(i, drugs);
        }
      });
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [times, data]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const increment = useCallback(
    (index: number, field: keyof Omit<Drug, "name">) => {
      setData((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, [field]: item[field] + 1 } : item,
        ),
      );
    },
    [],
  );

  const handleHeaderPress = (i: number) => {
    if (!editing) return;
    setTimes((prev) =>
      prev.map((t, idx) => (idx === i ? nowAsTimeString() : t)),
    );
    setEditingTimeIndex(i);
  };

  const handleLabelPress = (label: string) => {
    const key = slugify(label, { lower: true, strict: true, replacement: "-" });
    if (editing) {
      navigation.navigate("Camera", { drugId: key });
    } else if (photos[key]) {
      setPreviewUri(photos[key]);
    }
  };

  const handleDoseConfirm = (
    slotKey: TimeSlotKey,
    drugs: { name: string; qty: number }[],
  ) => {
    const record: DoseRecord = {
      takenAt: new Date().toISOString(),
      slotKey,
      drugs,
    };
    setHistory((prev) => [record, ...prev]);
    setDoseAlertIndex(null);
    Speech.stop();
    Alert.alert(
      "✓ Recorded",
      `Medication logged at ${formatTime(
        new Date().getHours(),
        new Date().getMinutes(),
      )}.`,
    );
  };

  useEffect(() => {
    if (route.params?.photoPath && route.params?.timeSlot) {
      setPhotos((prev) => ({
        ...prev,
        [route.params!.timeSlot]: route.params!.photoPath,
      }));
      navigation.setParams({
        photoPath: undefined as any,
        timeSlot: undefined as any,
      });
    }
  }, [route.params, navigation]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView className="flex-1 bg-slate-900">
      <View className="px-4 pt-14 pb-8">
        {/* Bluetooth Banner */}
        {!connectedDevice ? (
          <Pressable onPress={() => navigation.navigate("BleDevices")}>
            <View className="flex-row items-center bg-blue-600 rounded-2xl px-4 py-4 mb-6 shadow-lg">
              <View className="bg-blue-500 rounded-xl p-3 mr-4">
                <Image
                  size="sm"
                  source={{
                    uri: require("@/assets/images/bluetooth-solid-icon.png"),
                  }}
                  alt="Bluetooth"
                  className="tint-white"
                />
              </View>
              <View className="flex-1">
                <Text className="text-base text-blue-100 mb-1">
                  Turn On Bluetooth and
                </Text>
                <Text className="text-lg font-bold text-white tracking-wide">
                  PRESS TO CONNECT
                </Text>
              </View>
              <View className="bg-white/20 rounded-full p-2">
                <Text className="text-white text-lg">›</Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <Pressable onPress={() => disconnectDevice()}>
            <View className="flex-row items-center bg-blue-600 rounded-2xl px-4 py-4 mb-6 shadow-lg">
              <View className="bg-blue-500 rounded-xl p-3 mr-4">
                <Image
                  size="sm"
                  source={{
                    uri: require("@/assets/images/bluetooth-solid-icon.png"),
                  }}
                  alt="Bluetooth"
                  className="tint-white"
                />
              </View>
              <View className="flex-1">
                <Text className="text-base text-blue-100 mb-1">
                  Tap to disconnect
                </Text>
                <Text className="text-lg font-bold text-white tracking-wide">
                  {connectedDevice.name}
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Drug Table */}
        <View className="rounded-2xl overflow-hidden bg-slate-800 shadow-lg">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-slate-700 border-b-0">
                <TableHead
                  className="bg-transparent px-3 py-3"
                  style={{ flex: 1 }}
                >
                  <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Medicine
                  </Text>
                </TableHead>
                {TIME_LABELS.map((label, i) => (
                  <TableHead
                    key={label}
                    className="bg-transparent px-1 py-3"
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <Pressable
                      onPress={() => handleHeaderPress(i)}
                      className="items-center"
                    >
                      <Text className="text-base mb-1">{TIME_ICONS[i]}</Text>
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        {label}
                      </Text>
                      {editing && (
                        <Text className="text-[9px] text-slate-400 mt-0.5">
                          {times[i]}
                        </Text>
                      )}
                    </Pressable>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.map((item, index) => (
                <TableRow
                  key={index}
                  className={`border-b-0 ${
                    index % 2 === 0 ? "bg-slate-800" : "bg-slate-800/60"
                  }`}
                >
                  <TableData
                    className="px-3 py-2"
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <Pressable
                      onPress={() => handleLabelPress(item.name)}
                      className="bg-blue-500/15 rounded-lg px-3 py-2"
                    >
                      <Text className="text-blue-300 text-sm font-bold">
                        {item.name}
                      </Text>
                      {photos[
                        slugify(item.name, {
                          lower: true,
                          strict: true,
                          replacement: "-",
                        })
                      ] && (
                        <Text className="text-emerald-400 text-[8px] mt-0.5">
                          {editing ? "📷 Retake" : "🖼 View"}
                        </Text>
                      )}
                    </Pressable>
                  </TableData>

                  {TIME_FIELDS.map((field) => (
                    <TableData
                      key={field}
                      className="px-1 py-2"
                      style={{ flex: 1, alignItems: "center" }}
                    >
                      <Pressable
                        onPress={() => editing && increment(index, field)}
                        disabled={!editing}
                        className={`rounded-xl w-12 h-12 items-center justify-center ${
                          editing
                            ? "bg-slate-700 active:bg-slate-600"
                            : "bg-slate-700/50"
                        }`}
                      >
                        <Text className="text-white text-lg font-bold">
                          {item[field]}
                        </Text>
                      </Pressable>
                    </TableData>
                  ))}
                </TableRow>
              ))}

              {/* Time Row */}
              <TableRow className="bg-slate-700/50 border-b-0">
                <TableData className="px-3 py-3" style={{ flex: 1 }}>
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                    Time
                  </Text>
                </TableData>
                {times.map((t, i) => (
                  <TableData
                    key={i}
                    className="px-1 py-3"
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <View className="bg-blue-500/20 rounded-lg px-3 py-1.5">
                      <Text className="text-blue-300 text-sm font-bold">
                        {t}
                      </Text>
                    </View>
                  </TableData>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </View>

        {/* History */}
        {history.length > 0 && (
          <View className="mt-6 bg-slate-800 rounded-2xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                Dose History
              </Text>
              <Pressable
                onPress={() => {
                  Alert.alert(
                    "Clear History",
                    "Are you sure you want to delete all dose history?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Clear",
                        style: "destructive",
                        onPress: () => setHistory([]),
                      },
                    ],
                  );
                }}
                className="bg-rose-500/20 rounded-lg px-3 py-1"
              >
                <Text className="text-rose-400 text-xs font-bold">
                  🗑 Clear
                </Text>
              </Pressable>
            </View>
            {history.slice(0, 5).map((record, i) => {
              const d = new Date(record.takenAt);
              const timeStr = formatTime(d.getHours(), d.getMinutes());
              const dateStr = d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const slotIdx = TIME_FIELDS.indexOf(record.slotKey);
              return (
                <View
                  key={i}
                  className="flex-row items-start py-2 border-b border-slate-700 last:border-0"
                >
                  <Text className="text-base mr-3 mt-0.5">
                    {TIME_ICONS[slotIdx]}
                  </Text>
                  <View className="flex-1">
                    <Text className="text-slate-300 text-xs">
                      {dateStr} — {timeStr}
                    </Text>
                    <Text className="text-slate-400 text-[11px] mt-0.5">
                      {record.drugs
                        .map(
                          (d) =>
                            `${d.name} ×${d.qty} ${d.qty === 1 ? "tablet" : "tablets"}`,
                        )
                        .join(", ")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Action Buttons */}
        <View className="mt-6 flex-row gap-4">
          {!editing ? (
            <Button
              size="lg"
              onPress={() => setEditing(true)}
              className="flex-1 bg-emerald-500 active:bg-emerald-600 rounded-xl h-14"
            >
              <ButtonText className="font-bold text-white text-base tracking-wide">
                ✏️ EDIT
              </ButtonText>
            </Button>
          ) : (
            <Button
              size="lg"
              onPress={() => setEditing(false)}
              className="flex-1 bg-rose-500 active:bg-rose-600 rounded-xl h-14"
            >
              <ButtonText className="font-bold text-white text-base tracking-wide">
                💾 SAVE
              </ButtonText>
            </Button>
          )}
        </View>
      </View>

      {/* Image Preview Modal */}
      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable
          onPress={() => setPreviewUri(null)}
          className="flex-1 bg-black/80 items-center justify-center px-6"
        >
          {previewUri && (
            <View className="w-full rounded-2xl overflow-hidden bg-slate-800">
              <RNImage
                source={{ uri: previewUri }}
                className="w-full aspect-[3/4]"
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setPreviewUri(null)}
                className="py-4 items-center"
              >
                <Text className="text-white font-bold text-base">✕ Close</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={editingTimeIndex !== null}
        index={editingTimeIndex}
        times={times}
        onClose={() => setEditingTimeIndex(null)}
        onChangeTime={setTimes}
      />

      {/* Dose Alert Modal */}
      <DoseAlertModal
        visible={doseAlertIndex !== null}
        slotIndex={doseAlertIndex}
        data={data}
        onConfirm={handleDoseConfirm}
        onDismiss={() => setDoseAlertIndex(null)}
      />
    </ScrollView>
  );
}
