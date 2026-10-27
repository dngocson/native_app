import { FirmwareUpdateCard } from "@/components/firmware-update-card";
import { Text } from "@/components/ui/text";
import { useBluetoothStore } from "@/store/bluetoothStore";
import { useFirmwareStore } from "@/store/firmwareStore";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  View,
} from "react-native";
import { Device } from "react-native-ble-plx";

export default function BleDevicesScreen() {
  const {
    bluetoothEnabled,
    scanning,
    discoveredDevices,
    connectedDevice,
    connectingId,
    error,
    requestEnableBluetooth,
    startScan,
    stopScan,
    connectToDevice,
    clearError,
  } = useBluetoothStore();

  // Keep the card visible while the board reboots (temporarily disconnected)
  const firmwareStatus = useFirmwareStore((s) => s.status);
  const firmwareUpdateAvailable = useFirmwareStore((s) => s.updateAvailable);

  // Show error as Alert (side effect — must be in useEffect, not render)
  const prevError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevError.current) {
      prevError.current = error;
      Alert.alert("Bluetooth Error", error, [
        { text: "OK", onPress: clearError },
      ]);
    } else if (!error) {
      prevError.current = null;
    }
  }, [error, clearError]);

  const renderDevice = ({ item }: { item: Device }) => {
    const isConnected = connectedDevice?.id === item.id;
    const isConnecting = connectingId === item.id;

    return (
      <Pressable
        onPress={() => connectToDevice(item)}
        disabled={!!connectingId}
        className="flex-row items-center bg-white rounded-2xl px-4 py-4 mb-3 border border-blue-100 shadow-sm"
        style={connectingId && !isConnecting ? { opacity: 0.5 } : undefined}
      >
        <View className="bg-blue-100 rounded-xl w-10 h-10 items-center justify-center mr-3 border border-blue-200">
          <Text className="text-blue-700 text-lg">📡</Text>
        </View>
        <View className="flex-1">
          <Text className="text-slate-900 text-base font-bold">
            {item.localName ?? item.name ?? "Unknown"}
          </Text>
          <Text className="text-slate-500 text-xs mt-0.5">{item.id}</Text>
        </View>
        {isConnecting ? (
          <View className="flex-row items-center bg-amber-100 rounded-lg px-3 py-1.5 border border-amber-200">
            <ActivityIndicator
              color="#b45309"
              size="small"
              className="mr-1.5"
            />
            <Text className="text-amber-700 text-xs font-bold uppercase tracking-wider">
              Connecting…
            </Text>
          </View>
        ) : isConnected ? (
          <View className="bg-blue-600 rounded-lg px-3 py-1.5">
            <Text className="text-white text-xs font-bold uppercase tracking-wider">
              Connected
            </Text>
          </View>
        ) : (
          <View className="bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200">
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Tap to connect
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-blue-50/40 px-4 pt-6">
      {/* Bluetooth OFF banner */}
      {bluetoothEnabled === false && (
        <Pressable
          onPress={requestEnableBluetooth}
          className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex-row items-center shadow-sm"
        >
          <Text className="text-amber-800 text-sm font-bold flex-1">
            🔴 Bluetooth is OFF — tap to enable
          </Text>
        </Pressable>
      )}

      {/* Connected device banner */}
      {connectedDevice && (
        <View className="bg-white border border-blue-100 rounded-2xl px-4 py-3 mb-4 shadow-sm">
          <Text className="text-blue-800 text-sm font-bold">
            ✅ Connected to{" "}
            {connectedDevice.localName ??
              connectedDevice.name ??
              connectedDevice.id}
          </Text>
        </View>
      )}

      {/* Firmware update (OTA) */}
      {(firmwareStatus !== "idle" ||
        (connectedDevice && firmwareUpdateAvailable)) && <FirmwareUpdateCard />}

      {/* Scan Button */}
      <Pressable
        onPress={scanning ? stopScan : startScan}
        className={`${scanning ? "bg-rose-500 active:bg-rose-600" : "bg-blue-600 active:bg-blue-700"} rounded-2xl py-4 mb-6 items-center flex-row justify-center shadow-sm`}
      >
        {scanning && (
          <ActivityIndicator color="#fff" size="small" className="mr-2" />
        )}
        <Text className="text-white text-base font-bold uppercase tracking-wider">
          {scanning ? "⏹ Stop Scanning" : "🔍 Scan for Devices"}
        </Text>
      </Pressable>

      {/* Empty state */}
      {discoveredDevices.length === 0 && !scanning && (
        <View className="items-center mt-20">
          <View className="bg-blue-100 rounded-2xl w-20 h-20 items-center justify-center mb-4 border border-blue-200">
            <Text className="text-4xl">📡</Text>
          </View>
          <Text className="text-slate-500 text-base text-center font-medium">
            No devices found.{"\n"}Press scan to search for Bluetooth devices.
          </Text>
        </View>
      )}

      <FlatList
        data={discoveredDevices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
