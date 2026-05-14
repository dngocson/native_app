import { BluetoothBanner } from "@/components/home/BluetoothBanner";
import { DoseAlertModal } from "@/components/home/DoseAlertModal";
import { DrugTable } from "@/components/home/DrugTable";
import { TimePickerModal } from "@/components/home/TimePickerModal";
import { setupNotificationHandler } from "@/components/home/helpers";
import { Button, ButtonText } from "@/components/ui/button";
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
  const { connectedDevice, disconnectDevice, sendData } = useBluetoothStore();

  const {
    data,
    savedData,
    photos,
    times,
    editing,
    previewUri,
    editingTimeIndex,
    doseAlertIndex,
    setEditing,
    increment,
    handleSave,
    handleHeaderPress,
    setPreviewUri,
    setEditingTimeIndex,
    setDoseAlertIndex,
    setTimes,
    setPhoto,
    handleDoseConfirm,
    checkDoseAlerts,
  } = useHomeStore();

  // ── Notification response listener ────────────────────────────────────────

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const slotIndex = response.notification.request.content.data
          ?.slotIndex as number | undefined;
        if (slotIndex !== undefined) setDoseAlertIndex(slotIndex);
      },
    );
    return () => sub.remove();
  }, [setDoseAlertIndex]);

  // ── In-app clock (stable ref to avoid interval recreation) ─────────────

  const checkRef = useRef(checkDoseAlerts);
  checkRef.current = checkDoseAlerts;

  useEffect(() => {
    checkRef.current();
    const interval = setInterval(() => checkRef.current(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLabelPress = (label: string) => {
    const key = slugify(label, { lower: true, strict: true, replacement: "-" });
    if (editing) {
      navigation.navigate("Camera", { drugId: key });
    } else if (photos[key]) {
      setPreviewUri(photos[key]);
    }
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
    <ScrollView className="flex-1 bg-gray-400">
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

        {/* Action Buttons */}
        <View className="mt-4 flex-row gap-4">
          {!editing ? (
            <Button
              size="lg"
              onPress={() => setEditing(true)}
              className="flex-1 bg-black  rounded-none h-14 "
            >
              <ButtonText className="font-bold text-white text-base tracking-wide">
                ✏️ EDIT
              </ButtonText>
            </Button>
          ) : (
            <Button
              size="lg"
              onPress={handleSave}
              className="flex-1 bg-green-600  rounded-none h-14 "
            >
              <ButtonText className="font-bold text-white text-base tracking-wide">
                💾 SAVE
              </ButtonText>
            </Button>
          )}
        </View>

        {/* Send Test String via Bluetooth */}
        <View className="mt-4">
          <Button
            size="lg"
            onPress={() => sendData("string test")}
            disabled={!connectedDevice}
            className={`rounded-none h-14 ${connectedDevice ? "bg-blue-600" : "bg-gray-500"}`}
          >
            <ButtonText className="font-bold text-white text-base tracking-wide">
              📡 SEND TEST
            </ButtonText>
          </Button>
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
