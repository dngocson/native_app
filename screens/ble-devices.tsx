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
        className="flex-row items-center bg-gray-600 rounded-none px-4 py-4 mb-3 border border-gray-800"
        style={
          connectingAddress && !isConnecting ? { opacity: 0.5 } : undefined
        }
      >
        <View className="bg-gray-400 rounded-none w-10 h-10 items-center justify-center mr-3 border border-gray-500">
          <Text className="text-gray-700 text-lg">📡</Text>
        </View>
        <View className="flex-1">
          <Text className="text-white text-base font-bold">
            {item.name ?? "Unknown"}
          </Text>
          <Text className="text-slate-400 text-xs mt-0.5">{item.address}</Text>
        </View>
        {isConnecting ? (
          <View className="flex-row items-center bg-gray-300 rounded-none px-3 py-1 border border-gray-400">
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
          <View className="bg-gray-200 rounded-none px-3 py-1 border border-gray-400">
            <Text className="text-gray-800 text-xs font-bold">Connected</Text>
          </View>
        ) : (
          <View className="bg-gray-300 rounded-none px-3 py-1 border border-gray-400">
            <Text className="text-gray-700 text-xs font-bold">
              Tap to connect
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-gray-400 px-4 pt-6">
      {/* Bluetooth OFF banner */}
      {bluetoothEnabled === false && (
        <Pressable
          onPress={requestEnableBluetooth}
          className="bg-gray-200 border border-gray-400 rounded-none px-4 py-3 mb-4 flex-row items-center"
        >
          <Text className="text-gray-800 text-sm flex-1">
            🔴 Bluetooth is OFF — tap to enable
          </Text>
        </Pressable>
      )}

      {/* Connected device banner */}
      {connectedDevice && (
        <View className="bg-gray-200 border border-gray-400 rounded-none px-4 py-3 mb-4">
          <Text className="text-gray-800 text-sm">
            ✅ Connected to {connectedDevice.name ?? connectedDevice.address}
          </Text>
        </View>
      )}

      {/* Scan Button */}
      <Pressable
        onPress={scanning ? stopScan : startScan}
        className="bg-gray-700 active:bg-gray-800 rounded-none py-4 mb-6 items-center flex-row justify-center border border-gray-900"
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
