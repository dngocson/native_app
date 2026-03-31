import { Text } from "@/components/ui/text";
import { useBluetoothStore } from "@/store/bluetoothStore";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  View,
} from "react-native";
import { BluetoothDevice } from "react-native-bluetooth-classic";

export default function BleDevicesScreen() {
  const {
    bluetoothEnabled,
    scanning,
    discoveredDevices,
    connectedDevice,
    connectingAddress,
    error,
    requestEnableBluetooth,
    startScan,
    stopScan,
    connectToDevice,
    clearError,
  } = useBluetoothStore();

  // Show error as Alert when it changes
  if (error) {
    Alert.alert("Bluetooth Error", error, [
      { text: "OK", onPress: clearError },
    ]);
  }

  const renderDevice = ({ item }: { item: BluetoothDevice }) => {
    const isConnected = connectedDevice?.address === item.address;
    const isConnecting = connectingAddress === item.address;

    return (
      <Pressable
        onPress={() => connectToDevice(item)}
        disabled={!!connectingAddress}
        className="flex-row items-center bg-slate-800 rounded-xl px-4 py-4 mb-3"
        style={
          connectingAddress && !isConnecting ? { opacity: 0.5 } : undefined
        }
      >
        <View className="bg-blue-500/20 rounded-full w-10 h-10 items-center justify-center mr-3">
          <Text className="text-blue-400 text-lg">📡</Text>
        </View>
        <View className="flex-1">
          <Text className="text-white text-base font-bold">
            {item.name ?? "Unknown"}
          </Text>
          <Text className="text-slate-400 text-xs mt-0.5">{item.address}</Text>
        </View>
        {isConnecting ? (
          <View className="flex-row items-center bg-amber-500/20 rounded-lg px-3 py-1">
            <ActivityIndicator
              color="#fbbf24"
              size="small"
              className="mr-1.5"
            />
            <Text className="text-amber-400 text-xs font-bold">
              Connecting…
            </Text>
          </View>
        ) : isConnected ? (
          <View className="bg-emerald-500/20 rounded-lg px-3 py-1">
            <Text className="text-emerald-400 text-xs font-bold">
              Connected
            </Text>
          </View>
        ) : (
          <View className="bg-blue-500/20 rounded-lg px-3 py-1">
            <Text className="text-blue-400 text-xs font-bold">
              Tap to connect
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-slate-900 px-4 pt-6">
      {/* Bluetooth OFF banner */}
      {bluetoothEnabled === false && (
        <Pressable
          onPress={requestEnableBluetooth}
          className="bg-amber-500/20 border border-amber-500/40 rounded-xl px-4 py-3 mb-4 flex-row items-center"
        >
          <Text className="text-amber-400 text-sm flex-1">
            🔴 Bluetooth is OFF — tap to enable
          </Text>
        </Pressable>
      )}

      {/* Connected device banner */}
      {connectedDevice && (
        <View className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl px-4 py-3 mb-4">
          <Text className="text-emerald-400 text-sm">
            ✅ Connected to {connectedDevice.name ?? connectedDevice.address}
          </Text>
        </View>
      )}

      {/* Scan Button */}
      <Pressable
        onPress={scanning ? stopScan : startScan}
        className="bg-blue-600 active:bg-blue-700 rounded-xl py-4 mb-6 items-center flex-row justify-center"
      >
        {scanning && (
          <ActivityIndicator color="#fff" size="small" className="mr-2" />
        )}
        <Text className="text-white text-base font-bold tracking-wide">
          {scanning ? "⏹ STOP SCANNING" : "🔍 SCAN FOR DEVICES"}
        </Text>
      </Pressable>

      {/* Empty state */}
      {discoveredDevices.length === 0 && !scanning && (
        <View className="items-center mt-20">
          <Text className="text-5xl mb-4">📡</Text>
          <Text className="text-slate-400 text-base text-center">
            No devices found.{"\n"}Press scan to search for Bluetooth devices.
          </Text>
        </View>
      )}

      <FlatList
        data={discoveredDevices}
        keyExtractor={(item) => item.address}
        renderItem={renderDevice}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
