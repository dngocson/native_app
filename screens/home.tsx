import { BluetoothBanner } from "@/components/home/BluetoothBanner";
import { DoseAlertModal } from "@/components/home/DoseAlertModal";
import { DoseHistory } from "@/components/home/DoseHistory";
import { DrugTable } from "@/components/home/DrugTable";
import { TimePickerModal } from "@/components/home/TimePickerModal";
import {
  formatTime,
  loadDrugData,
  loadHistory,
  loadPhotos,
  loadTimes,
  nowAsTimeString,
  requestNotificationPermission,
  scheduleSlotNotifications,
  setupNotificationHandler,
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
import { Button, ButtonText } from "@/components/ui/button";
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

setupNotificationHandler();

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, "Home">>();
  const { connectedDevice, disconnectDevice } = useBluetoothStore();

  const [editing, setEditing] = useState(false);

  const [data, setData] = useState<Drug[]>(loadDrugData);
  const [savedData, setSavedData] = useState<Drug[]>(loadDrugData);
  const savedDataRef = useRef<Drug[]>(savedData);

  const [photos, setPhotos] = useState<Record<string, string>>(loadPhotos);
  const [times, setTimes] = useState<string[]>(loadTimes);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [doseAlertIndex, setDoseAlertIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<DoseRecord[]>(loadHistory);

  const alertedToday = useRef<Set<string>>(new Set());
  const editingRef = useRef(editing);

  useEffect(() => {
    savedDataRef.current = savedData;
  }, [savedData]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    storage.set(STORAGE_KEY_DATA, JSON.stringify(savedData));
  }, [savedData]);

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
    const check = () => {
      // Suppress alerts while the user is actively editing
      if (editingRef.current) return;

      const now = nowAsTimeString();
      times.forEach((t, i) => {
        const dateKey = `${new Date().toDateString()}-${i}`;
        if (t === now && !alertedToday.current.has(dateKey)) {
          alertedToday.current.add(dateKey);
          setDoseAlertIndex(i);
          const drugs = savedDataRef.current
            .filter((d) => d[TIME_FIELDS[i]] > 0)
            .map((d) => ({ name: d.name, qty: d[TIME_FIELDS[i]] }));
          speakDoseReminder(i, drugs);
        }
      });
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [times]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const increment = useCallback((index: number, field: TimeSlotKey) => {
    setData((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: item[field] + 1 } : item,
      ),
    );
  }, []);

  const handleSave = useCallback(() => {
    setSavedData(data);
    setEditing(false);
  }, [data]);

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
        <BluetoothBanner
          connectedDevice={connectedDevice}
          onConnect={() => navigation.navigate("BleDevices")}
          onDisconnect={() => disconnectDevice()}
        />

        {/* Drug Table */}
        <DrugTable
          data={data}
          editing={editing}
          photos={photos}
          times={times}
          onIncrement={increment}
          onHeaderPress={handleHeaderPress}
          onLabelPress={handleLabelPress}
        />

        {/* Dose History */}
        <DoseHistory history={history} onClear={() => setHistory([])} />

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
              onPress={handleSave}
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
        data={savedData}
        onConfirm={handleDoseConfirm}
        onDismiss={() => setDoseAlertIndex(null)}
      />
    </ScrollView>
  );
}
