import { Text } from "@/components/ui/text";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  Pressable,
  View,
} from "react-native";
import { BleManager, Device } from "react-native-ble-plx";

export default function BleDevicesScreen() {
  const managerRef = useRef<BleManager | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      managerRef.current = new BleManager();
    } catch (e) {
      console.warn("BleManager init failed — native module not linked:", e);
      Alert.alert(
        "BLE Not Available",
        "Please use a development build (npx expo run:android) instead of Expo Go.",
      );
    }
    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );
    }
    return true;
  };

  const startScan = async () => {
    const manager = managerRef.current;
    if (!manager) return;

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert("Permission Denied", "Bluetooth permissions are required.");
      return;
    }

    setDevices([]);
    setScanning(true);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn("Scan error:", error.message);
        setScanning(false);
        return;
      }
      if (device && device.name) {
        setDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });

    // Stop scan after 10 seconds
    setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    const manager = managerRef.current;
    if (!manager) return;

    manager.stopDeviceScan();
    setScanning(false);

    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedId(connected.id);
      Alert.alert("Connected", `Connected to ${device.name ?? device.id}`);
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message ?? "Unknown error");
    }
  };

  const renderDevice = ({ item }: { item: Device }) => {
    const isConnected = connectedId === item.id;
    return (
      <Pressable
        onPress={() => connectToDevice(item)}
        className="flex-row items-center bg-slate-800 rounded-xl px-4 py-4 mb-3"
      >
        <View className="bg-blue-500/20 rounded-full w-10 h-10 items-center justify-center mr-3">
          <Text className="text-blue-400 text-lg">📡</Text>
        </View>
        <View className="flex-1">
          <Text className="text-white text-base font-bold">
            {item.name ?? "Unknown"}
          </Text>
          <Text className="text-slate-400 text-xs mt-0.5">{item.id}</Text>
        </View>
        {isConnected ? (
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
      {/* Scan Button */}
      <Pressable
        onPress={startScan}
        disabled={scanning}
        className="bg-blue-600 active:bg-blue-700 rounded-xl py-4 mb-6 items-center flex-row justify-center"
      >
        {scanning && (
          <ActivityIndicator color="#fff" size="small" className="mr-2" />
        )}
        <Text className="text-white text-base font-bold tracking-wide">
          {scanning ? "Scanning..." : "🔍 SCAN FOR DEVICES"}
        </Text>
      </Pressable>

      {/* Device List */}
      {devices.length === 0 && !scanning && (
        <View className="items-center mt-20">
          <Text className="text-5xl mb-4">📡</Text>
          <Text className="text-slate-400 text-base text-center">
            No devices found.{"\n"}Press scan to search for BLE devices.
          </Text>
        </View>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
