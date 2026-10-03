import { BluetoothBanner } from "@/components/home/BluetoothBanner";
import { BluetoothRequiredModal } from "@/components/home/BluetoothRequiredModal";
import { DoseAlertModal } from "@/components/home/DoseAlertModal";
import { DoseHistory } from "@/components/home/DoseHistory";
import { DrugNoteModal } from "@/components/home/DrugNoteModal";
import { DrugTable } from "@/components/home/DrugTable";
import { LabelPickerModal } from "@/components/home/LabelPickerModal";
import { TimePickerModal } from "@/components/home/TimePickerModal";
import {
  setupNotificationHandler,
  syncSlotNotifications,
} from "@/components/home/helpers";
import {
  DOSE_CATCH_UP_MINUTES,
  DOSE_CHECK_INTERVAL_MS,
} from "@/components/home/types";
import { Button, ButtonSpinner, ButtonText } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useBluetoothStore } from "@/store/bluetoothStore";
import { useHomeStore } from "@/store/homeStore";
import type { RootStackParamList, TabParamList } from "@/types/navigation";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import {
  AppState,
  Modal,
  Pressable,
  Image as RNImage,
  ScrollView,
  View,
} from "react-native";

setupNotificationHandler();

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, "Home">>();
  const { connectedDevice, disconnectDevice } = useBluetoothStore();

  const {
    data,
    savedData,
    photos,
    notes,
    times,
    editing,
    previewUri,
    editingTimeIndex,
    doseAlertIndex,
    labelPicker,
    noteModal,
    bluetoothRequiredPromptVisible,
    saving,
    setEditing,
    increment,
    decrement,
    handleSave,
    handleHeaderPress,
    setPreviewUri,
    setEditingTimeIndex,
    setTimes,
    setPhoto,
    openLabelPicker,
    closeLabelPicker,
    pickCameraFromLabelPicker,
    pickNoteFromLabelPicker,
    saveNote,
    closeNoteModal,
    goConnectBluetooth,
    revertPendingEdit,
    dismissBluetoothRequiredPrompt,
    handleDoseConfirm,
    handleDoseSkip,
    snoozeDoseAlert,
    openDoseAlert,
    checkDoseAlerts,
    checkInitialDoseAlert,
    history,
    clearHistory,
  } = useHomeStore();

  // ── Notification → modal ──────────────────────────────────────────────────
  // Two paths, because a notification can reach us in two different ways.

  // 1. Tapped. The hook also covers the cold-start case the plain listener
  //    misses: when the app was killed, the tap is delivered before any
  //    listener can mount.
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse) return;
    // The tap is remembered *forever*, so ignore stale ones — otherwise
    // tomorrow's launch would replay yesterday's notification.
    const firedAt = lastResponse.notification.date;
    const ageMinutes =
      typeof firedAt === "number" ? (Date.now() - firedAt) / 60_000 : Infinity;
    if (ageMinutes > DOSE_CATCH_UP_MINUTES) return;

    const slotIndex = lastResponse.notification.request.content.data
      ?.slotIndex as number | undefined;
    if (slotIndex !== undefined) openDoseAlert(slotIndex);
  }, [lastResponse, openDoseAlert]);

  // 2. Fired while the app is in the foreground — the OS timer is reliable even
  //    when the JS interval below has been throttled.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const slotIndex = notification.request.content.data?.slotIndex as
          | number
          | undefined;
        if (slotIndex !== undefined) openDoseAlert(slotIndex);
      },
    );
    return () => sub.remove();
  }, [openDoseAlert]);

  // ── Arm the daily OS notifications on every app start ─────────────────────
  // The `times` store subscription only fires when the value *changes*, so a
  // user who never edited a time would otherwise have no notifications at all.

  useEffect(() => {
    syncSlotNotifications(useHomeStore.getState().times);
  }, []);

  // ── In-app clock (stable ref to avoid interval recreation) ─────────────

  const checkRef = useRef(checkDoseAlerts);

  useEffect(() => {
    checkRef.current = checkDoseAlerts;
  }, [checkDoseAlerts]);

  const checkInitialRef = useRef(checkInitialDoseAlert);

  useEffect(() => {
    checkInitialRef.current = checkInitialDoseAlert;
  }, [checkInitialDoseAlert]);

  useEffect(() => {
    // Only the very first call of a mount may bypass the catch-up cap (fresh
    // install case) — every later tick uses the regular checkDoseAlerts().
    checkInitialRef.current();
    const interval = setInterval(
      () => checkRef.current(),
      DOSE_CHECK_INTERVAL_MS,
    );

    // JS timers are frozen while the app is backgrounded, so a slot minute can
    // pass with no tick at all. Re-check the moment we come back to the front —
    // the store uses a catch-up window, so a late slot still raises the modal.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkRef.current();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePickCamera = () => {
    const key = pickCameraFromLabelPicker();
    if (key) navigation.navigate("Camera", { drugId: key });
  };

  useEffect(() => {
    if (route.params?.photoPath && route.params?.timeSlot) {
      setPhoto(route.params.timeSlot, route.params.photoPath);
      navigation.setParams({
        photoPath: undefined,
        timeSlot: undefined,
      } as any);
    }
  }, [route.params, navigation, setPhoto]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-blue-50">
      <ScrollView className="flex-1">
        <View className="px-5 pt-14 pb-8">
          <View className="mb-5">
            <Text className="text-3xl font-bold text-slate-900">
              Your medication plan
            </Text>
            <Text className="mt-1 text-sm text-slate-500">
              A simple view of what is coming up today.
            </Text>
          </View>
          {/* Bluetooth Banner */}
          <BluetoothBanner
            connectedDevice={connectedDevice}
            onConnect={() => navigation.navigate("BleDevices")}
            onDisconnect={() => disconnectDevice()}
          />
          {/* Drug Table */}
          <DrugTable
            data={data}
            notes={notes}
            editing={editing}
            photos={photos}
            times={times}
            onIncrement={increment}
            onDecrement={decrement}
            onHeaderPress={handleHeaderPress}
            onLabelPress={openLabelPicker}
          />
          {/* Action Buttons */}
          <View className="mt-5 flex-row gap-3">
            {!editing ? (
              <Button
                size="lg"
                onPress={() => setEditing(true)}
                className="flex-1 h-14 rounded-2xl bg-blue-600 shadow-sm data-[active=true]:bg-blue-500 data-[active=true]:text-white"
              >
                <ButtonText className="font-bold text-white text-base  tracking-wide data-[active=true]:text-white">
                  ✎ Edit plan
                </ButtonText>
              </Button>
            ) : (
              <Button
                size="lg"
                onPress={handleSave}
                isDisabled={saving}
                className={`flex-1 rounded-2xl bg-amber-300 h-14 shadow-sm active:bg-blue-500 text-black  data-[active=true]:bg-amber-200 data-[active=true]:text-white data-[disabled=true]:opacity-70`}
              >
                {saving && <ButtonSpinner color="#000" />}
                <ButtonText className="font-bold text-black text-base tracking-wide data-[active=true]:text-white">
                  {saving ? "Sending to board…" : "✓ Save changes"}
                </ButtonText>
              </Button>
            )}
          </View>
          <DoseHistory history={history} onClear={clearHistory} />
        </View>
      </ScrollView>

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
            <View className="w-full rounded-none overflow-hidden bg-gray-600">
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

      {/* Photo/Note Picker Modal */}
      <LabelPickerModal
        visible={labelPicker !== null}
        label={labelPicker?.label ?? ""}
        onPressCamera={handlePickCamera}
        onPressNote={pickNoteFromLabelPicker}
        onClose={closeLabelPicker}
      />

      {/* Drug Note Modal */}
      <DrugNoteModal
        visible={noteModal !== null}
        label={noteModal?.label ?? ""}
        mode={noteModal?.mode ?? "view"}
        initialValue={noteModal ? (notes[noteModal.key] ?? "") : ""}
        onSave={saveNote}
        onClose={closeNoteModal}
      />

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={editingTimeIndex !== null}
        index={editingTimeIndex}
        times={times}
        onClose={() => setEditingTimeIndex(null)}
        onChangeTime={setTimes}
      />

      {/* Bluetooth Required Modal */}
      <BluetoothRequiredModal
        visible={bluetoothRequiredPromptVisible}
        onConnect={goConnectBluetooth}
        onRevert={revertPendingEdit}
        onClose={dismissBluetoothRequiredPrompt}
      />

      {/* Dose Alert Modal */}
      <DoseAlertModal
        visible={doseAlertIndex !== null}
        slotIndex={doseAlertIndex}
        data={savedData}
        scheduledTime={
          doseAlertIndex !== null ? times[doseAlertIndex] : undefined
        }
        onConfirm={handleDoseConfirm}
        onSkip={handleDoseSkip}
        onSnooze={snoozeDoseAlert}
      />
    </View>
  );
}
