import { navigate } from "@/utils/NavigationService";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, State, Subscription } from "react-native-ble-plx";
import { create } from "zustand";

// ─── BLE Manager singleton ───────────────────────────────────────────────────

const manager = new BleManager();

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceivedMessage = {
  id: string;
  deviceId: string;
  data: string;
  timestamp: Date;
};

type BluetoothState = {
  // ── State ──
  bluetoothEnabled: boolean | null;
  scanning: boolean;
  discoveredDevices: Device[];
  connectedDevice: Device | null;
  connectingId: string | null;
  receivedMessages: ReceivedMessage[];
  error: string | null;

  // ── Discovered service/characteristic UUIDs (set after connect) ──
  _serviceUUID: string | null;
  _characteristicUUID: string | null;

  // ── Lifecycle ──
  /** Call once at app root (e.g. App.tsx) — registers BT on/off listeners */
  init: () => () => void;

  // ── Actions ──
  requestEnableBluetooth: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connectToDevice: (device: Device) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  sendData: (data: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;

  // ── Internal ──
  _monitorSub: Subscription | null;
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
  connectingId: null,
  receivedMessages: [],
  error: null,
  _serviceUUID: null,
  _characteristicUUID: null,
  _monitorSub: null,

  // ── init: call ONCE at app root ──────────────────────────────────────────
  init: () => {
    const stateSub = manager.onStateChange((state) => {
      const powered = state === State.PoweredOn;
      set({ bluetoothEnabled: powered });

      if (!powered) {
        // Clean up monitor subscription if BT turns off mid-session
        get()._monitorSub?.remove();
        manager.stopDeviceScan();
        set({
          scanning: false,
          discoveredDevices: [],
          connectedDevice: null,
          _monitorSub: null,
          _serviceUUID: null,
          _characteristicUUID: null,
        });
      }
    }, true); // `true` = emit current state immediately

    // Return cleanup for app root useEffect
    return () => {
      stateSub.remove();
      get()._monitorSub?.remove();
    };
  },

  // ── requestEnableBluetooth ───────────────────────────────────────────────
  requestEnableBluetooth: async () => {
    try {
      await manager.enable();
      set({ bluetoothEnabled: true });
      return true;
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

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        set({ error: error.message ?? "Scan failed", scanning: false });
        return;
      }
      if (device && device.name) {
        set((state) => {
          const exists = state.discoveredDevices.some(
            (d) => d.id === device.id,
          );
          if (exists) return state;
          return { discoveredDevices: [...state.discoveredDevices, device] };
        });
      }
    });
  },

  // ── stopScan ─────────────────────────────────────────────────────────────
  stopScan: async () => {
    manager.stopDeviceScan();
    set({ scanning: false });
  },

  // ── connectToDevice ──────────────────────────────────────────────────────
  connectToDevice: async (device) => {
    const { scanning, stopScan, _monitorSub } = get();
    if (scanning) await stopScan();

    // Remove existing monitor subscription before connecting to a new device
    _monitorSub?.remove();
    set({ _monitorSub: null, error: null, connectingId: device.id });

    try {
      const connected = await manager.connectToDevice(device.id);
      const discovered =
        await connected.discoverAllServicesAndCharacteristics();

      // Find a writable + notifiable characteristic
      const services = await discovered.services();
      let serviceUUID: string | null = null;
      let charUUID: string | null = null;

      for (const svc of services) {
        const chars = await discovered.characteristicsForService(svc.uuid);
        for (const c of chars) {
          if (c.isWritableWithResponse || c.isWritableWithoutResponse) {
            serviceUUID = svc.uuid;
            charUUID = c.uuid;
          }
          if (c.isNotifiable && serviceUUID) {
            // Prefer a notifiable characteristic for monitoring
            charUUID = c.uuid;
            break;
          }
        }
        if (serviceUUID && charUUID) break;
      }

      set({
        connectedDevice: discovered,
        _serviceUUID: serviceUUID,
        _characteristicUUID: charUUID,
      });

      // Subscribe to incoming data if a notifiable characteristic was found
      if (serviceUUID && charUUID) {
        const sub = discovered.monitorCharacteristicForService(
          serviceUUID,
          charUUID,
          (err, characteristic) => {
            if (err || !characteristic?.value) return;
            const message: ReceivedMessage = {
              id: `${Date.now()}-${Math.random()}`,
              deviceId: device.id,
              data: atob(characteristic.value),
              timestamp: new Date(),
            };
            set((state) => ({
              receivedMessages: [...state.receivedMessages, message],
            }));
          },
        );
        set({ _monitorSub: sub });
      }

      set({ connectingId: null });
      navigate("Tabs");
    } catch (err: any) {
      set({
        error: err.message ?? "Connection failed",
        connectingId: null,
      });
    }
  },

  // ── disconnectDevice ─────────────────────────────────────────────────────
  disconnectDevice: async () => {
    const { connectedDevice, _monitorSub } = get();
    _monitorSub?.remove();
    set({ _monitorSub: null });

    try {
      if (connectedDevice) {
        await manager.cancelDeviceConnection(connectedDevice.id);
      }
    } catch {}

    set({
      connectedDevice: null,
      _serviceUUID: null,
      _characteristicUUID: null,
    });
  },

  // ── sendData ─────────────────────────────────────────────────────────────
  sendData: async (data) => {
    const { connectedDevice, _serviceUUID, _characteristicUUID } = get();
    if (!connectedDevice || !_serviceUUID || !_characteristicUUID) {
      set({ error: "No device connected or no writable characteristic." });
      return;
    }
    try {
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        _serviceUUID,
        _characteristicUUID,
        btoa(data),
      );
    } catch (err: any) {
      set({ error: err.message ?? "Failed to send data" });
    }
  },

  // ── clearMessages ────────────────────────────────────────────────────────
  clearMessages: () => set({ receivedMessages: [] }),

  // ── clearError ───────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),
}));
