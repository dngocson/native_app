import { PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic, {
  BluetoothDevice,
} from "react-native-bluetooth-classic";
import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceivedMessage = {
  id: string;
  deviceAddress: string;
  data: string;
  timestamp: Date;
};

type Subscription = { remove: () => void };

type BluetoothState = {
  // ── State ──
  bluetoothEnabled: boolean | null;
  scanning: boolean;
  discoveredDevices: BluetoothDevice[];
  connectedDevice: BluetoothDevice | null;
  connectingAddress: string | null;
  receivedMessages: ReceivedMessage[];
  error: string | null;

  // ── Lifecycle ──
  /** Call once at app root (e.g. App.tsx) — registers BT on/off listeners */
  init: () => () => void;

  // ── Actions ──
  requestEnableBluetooth: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connectToDevice: (device: BluetoothDevice) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  sendData: (data: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;

  // ── Internal ──
  _dataSub: Subscription | null;
  _setDataSub: (sub: Subscription | null) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useBluetoothStore = create<BluetoothState>((set, get) => ({
  // ── Initial state ──
  bluetoothEnabled: null,
  scanning: false,
  discoveredDevices: [],
  connectedDevice: null,
  connectingAddress: null,
  receivedMessages: [],
  error: null,
  _dataSub: null,

  _setDataSub: (sub) => set({ _dataSub: sub }),

  // ── init: call ONCE at app root ──────────────────────────────────────────
  init: () => {
    let enabledSub: Subscription | null = null;
    let disabledSub: Subscription | null = null;

    // Check initial state
    RNBluetoothClassic.isBluetoothEnabled()
      .then((enabled) => set({ bluetoothEnabled: enabled }))
      .catch(() => set({ bluetoothEnabled: false }));

    try {
      enabledSub = RNBluetoothClassic.onBluetoothEnabled(() => {
        set({ bluetoothEnabled: true });
      });

      disabledSub = RNBluetoothClassic.onBluetoothDisabled(() => {
        // Clean up data subscription if BT turns off mid-session
        get()._dataSub?.remove();
        set({
          bluetoothEnabled: false,
          scanning: false,
          discoveredDevices: [],
          connectedDevice: null,
          _dataSub: null,
        });
      });
    } catch (err) {
      console.warn("BT listeners failed — native module not ready:", err);
    }

    // Return cleanup for app root useEffect
    return () => {
      enabledSub?.remove();
      disabledSub?.remove();
      get()._dataSub?.remove();
    };
  },

  // ── requestEnableBluetooth ───────────────────────────────────────────────
  requestEnableBluetooth: async () => {
    try {
      const enabled = await RNBluetoothClassic.requestBluetoothEnabled();
      set({ bluetoothEnabled: enabled });
      return enabled;
    } catch (err: any) {
      set({ error: err.message ?? "Failed to enable Bluetooth" });
      return false;
    }
  },

  // ── startScan ────────────────────────────────────────────────────────────
  startScan: async () => {
    const { bluetoothEnabled, requestEnableBluetooth } = get();

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      set({ error: "Bluetooth permissions are required." });
      return;
    }

    let isEnabled = bluetoothEnabled;
    if (!isEnabled) {
      isEnabled = await requestEnableBluetooth();
      if (!isEnabled) {
        set({ error: "Bluetooth must be enabled to scan for devices." });
        return;
      }
    }

    set({ discoveredDevices: [], scanning: true, error: null });

    try {
      const discovered: BluetoothDevice[] =
        await RNBluetoothClassic.startDiscovery();
      set({ discoveredDevices: discovered.filter((d) => !!d.name) });
    } catch (err: any) {
      set({ error: err.message ?? "Scan failed" });
    } finally {
      set({ scanning: false });
    }
  },

  // ── stopScan ─────────────────────────────────────────────────────────────
  stopScan: async () => {
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch (_) {}
    set({ scanning: false });
  },

  // ── connectToDevice ──────────────────────────────────────────────────────
  connectToDevice: async (device) => {
    const { scanning, stopScan, _dataSub } = get();
    if (scanning) await stopScan();

    // Remove existing data subscription before connecting to a new device
    _dataSub?.remove();
    set({ _dataSub: null, error: null, connectingAddress: device.address });

    try {
      const connected = await device.connect();
      if (!connected) {
        set({
          error: `Failed to connect to ${device.name ?? device.address}`,
          connectingAddress: null,
        });
        return;
      }

      set({ connectedDevice: device });

      // Subscribe to incoming data — persists even if the screen unmounts
      const sub = device.onDataReceived((event) => {
        const message: ReceivedMessage = {
          id: `${Date.now()}-${Math.random()}`,
          deviceAddress: device.address,
          data: event.data,
          timestamp: new Date(),
        };
        set((state) => ({
          receivedMessages: [...state.receivedMessages, message],
        }));
      });

      set({ _dataSub: sub, connectingAddress: null });
    } catch (err: any) {
      set({
        error: err.message ?? "Connection failed",
        connectingAddress: null,
      });
    }
  },

  // ── disconnectDevice ─────────────────────────────────────────────────────
  disconnectDevice: async () => {
    const { connectedDevice, _dataSub } = get();
    _dataSub?.remove();
    set({ _dataSub: null });

    try {
      if (connectedDevice) {
        await connectedDevice.disconnect();
      }
    } catch (_) {}

    set({ connectedDevice: null });
  },

  // ── sendData ─────────────────────────────────────────────────────────────
  sendData: async (data) => {
    const { connectedDevice } = get();
    if (!connectedDevice) {
      set({ error: "No device connected." });
      return;
    }
    try {
      await connectedDevice.write(data);
    } catch (err: any) {
      set({ error: err.message ?? "Failed to send data" });
    }
  },

  // ── clearMessages ────────────────────────────────────────────────────────
  clearMessages: () => set({ receivedMessages: [] }),

  // ── clearError ───────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),
}));
