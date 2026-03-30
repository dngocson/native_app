import { Text } from "@/components/ui/text";
import { RootStackParamList } from "@/types/navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import RNBluetoothClassic, {
  BluetoothDevice,
} from "react-native-bluetooth-classic";

export default function BleDevicesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean | null>(
    null,
  );
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check Bluetooth state on mount and listen for changes
  useEffect(() => {
    checkBluetoothEnabled();

    let enabledSub: { remove: () => void } | null = null;
    let disabledSub: { remove: () => void } | null = null;

    try {
      enabledSub = RNBluetoothClassic.onBluetoothEnabled(() => {
        setBluetoothEnabled(true);
      });
      disabledSub = RNBluetoothClassic.onBluetoothDisabled(() => {
        setBluetoothEnabled(false);
        setScanning(false);
        setDevices([]);
      });
    } catch (err) {
      console.warn(
        "Failed to register Bluetooth listeners — native module not ready:",
        err,
      );
    }

    const currentScanTimeout = scanTimeoutRef.current;
    return () => {
      enabledSub?.remove();
      disabledSub?.remove();
      if (currentScanTimeout) clearTimeout(currentScanTimeout);
    };
  }, []);

  const checkBluetoothEnabled = async () => {
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      setBluetoothEnabled(enabled);
    } catch (err) {
      console.warn("Failed to check Bluetooth state:", err);
      setBluetoothEnabled(false);
    }
  };

  const requestEnableBluetooth = async (): Promise<boolean> => {
    try {
      // On Android, this shows the system dialog to enable Bluetooth
      const enabled = await RNBluetoothClassic.requestBluetoothEnabled();
      setBluetoothEnabled(enabled);
      return enabled;
    } catch (err) {
      console.warn("requestBluetoothEnabled error:", err);
      return false;
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(grants).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );
    }
    return true;
  };

  const startScan = async () => {
    // 1. Check / request permissions
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert("Permission Denied", "Bluetooth permissions are required.");
      return;
    }

    // 2. Ensure Bluetooth is ON – if not, ask user to enable it
    let isEnabled = bluetoothEnabled;
    if (!isEnabled) {
      isEnabled = await requestEnableBluetooth();
      if (!isEnabled) {
        Alert.alert(
          "Bluetooth Off",
          "Bluetooth must be enabled to scan for devices.",
        );
        return;
      }
    }

    setDevices([]);
    setScanning(true);

    try {
      // startDiscovery resolves with the list of discovered devices
      const discovered: BluetoothDevice[] =
        await RNBluetoothClassic.startDiscovery();

      // Filter to named devices (same behaviour as original)
      const named = discovered.filter((d) => !!d.name);
      setDevices(named);
    } catch (err: any) {
      console.warn("Discovery error:", err.message);
      Alert.alert("Scan Error", err.message ?? "Unknown error");
    } finally {
      setScanning(false);
    }
  };

  const stopScan = async () => {
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch (_) {}
    setScanning(false);
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    if (scanning) await stopScan();

    try {
      const connected = await device.connect();
      if (connected) {
        setConnectedId(device.address);
        Alert.alert(
          "Connected",
          `Connected to ${device.name ?? device.address}`,
        );
        navigation.navigate("Tabs");
      }
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message ?? "Unknown error");
    }
  };

  const renderDevice = ({ item }: { item: BluetoothDevice }) => {
    const isConnected = connectedId === item.address;
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
          <Text className="text-slate-400 text-xs mt-0.5">{item.address}</Text>
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
      {/* Bluetooth status banner */}
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
      {devices.length === 0 && !scanning && (
        <View className="items-center mt-20">
          <Text className="text-5xl mb-4">📡</Text>
          <Text className="text-slate-400 text-base text-center">
            No devices found.{"\n"}Press scan to search for Bluetooth devices.
          </Text>
        </View>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.address}
        renderItem={renderDevice}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
