import { navigate } from "@/utils/NavigationService";
import { decode as atob, encode as btoa } from "base-64";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, State, Subscription } from "react-native-ble-plx";
import { create } from "zustand";

// ─── BLE Manager singleton ───────────────────────────────────────────────────

const manager = new BleManager();
const SCAN_TIMEOUT_MS = 10_000;
const MAX_RECEIVED_MESSAGES = 200;

/** Return the best display name for a BLE device */
const deviceName = (d: Device) => d.localName ?? d.name ?? null;

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
  _writeServiceUUID: string | null;
  _writeCharUUID: string | null;
  _notifyServiceUUID: string | null;
  _notifyCharUUID: string | null;

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
  _connecting: boolean;
  _monitorSub: Subscription | null;
  _disconnectSub: Subscription | null;
  _scanTimer: ReturnType<typeof setTimeout> | null;
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
  _writeServiceUUID: null,
  _writeCharUUID: null,
  _notifyServiceUUID: null,
  _notifyCharUUID: null,
  _connecting: false,
  _monitorSub: null,
  _disconnectSub: null,
  _scanTimer: null,

  // ── init: call ONCE at app root ──────────────────────────────────────────
  init: () => {
    const stateSub = manager.onStateChange((state) => {
      const powered = state === State.PoweredOn;
      set({ bluetoothEnabled: powered });

      if (!powered) {
        // Clean up monitor subscription if BT turns off mid-session
        get()._monitorSub?.remove();
        get()._disconnectSub?.remove();
        manager.stopDeviceScan();
        set({
          scanning: false,
          discoveredDevices: [],
          connectedDevice: null,
          _monitorSub: null,
          _disconnectSub: null,
          _writeServiceUUID: null,
          _writeCharUUID: null,
          _notifyServiceUUID: null,
          _notifyCharUUID: null,
        });
      }
    }, true); // `true` = emit current state immediately

    // Return cleanup for app root useEffect
    return () => {
      stateSub.remove();
      get()._monitorSub?.remove();
      get()._disconnectSub?.remove();
    };
  },

  // ── requestEnableBluetooth ───────────────────────────────────────────────
  requestEnableBluetooth: async () => {
    try {
      if (Platform.OS === "android") {
        await manager.enable();
      }
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

    // Auto-stop after SCAN_TIMEOUT_MS
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      set({ scanning: false, _scanTimer: null });
    }, SCAN_TIMEOUT_MS);
    set({ _scanTimer: timer });

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        clearTimeout(timer);
        set({
          error: error.message ?? "Scan failed",
          scanning: false,
          _scanTimer: null,
        });
        return;
      }
      if (device && deviceName(device)) {
        set((state) => {
          const index = state.discoveredDevices.findIndex(
            (d) => d.id === device.id,
          );
          if (index >= 0) {
            const updated = [...state.discoveredDevices];
            updated[index] = device;
            return { discoveredDevices: updated };
          }
          return {
            discoveredDevices: [...state.discoveredDevices, device],
          };
        });
      }
    });
  },

  // ── stopScan ─────────────────────────────────────────────────────────────
  stopScan: async () => {
    const { _scanTimer } = get();
    if (_scanTimer) clearTimeout(_scanTimer);
    manager.stopDeviceScan();
    set({ scanning: false, _scanTimer: null });
  },

  // ── connectToDevice ──────────────────────────────────────────────────────
  connectToDevice: async (device) => {
    // Prevent concurrent connection attempts
    if (get()._connecting) return;
    set({ _connecting: true });

    try {
      const {
        scanning,
        stopScan,
        _monitorSub,
        _disconnectSub,
        connectedDevice,
      } = get();

      // Check if already connected — both store-level and BLE-level
      if (connectedDevice?.id === device.id) {
        const isConnected = await manager.isDeviceConnected(device.id);
        if (isConnected) {
          set({
            connectingId: null,
            _connecting: false,
          });

          return;
        }
      }

      if (scanning) await stopScan();

      // Remove existing subscriptions before connecting to a new device
      _monitorSub?.remove();
      _disconnectSub?.remove();
      set({
        _monitorSub: null,
        _disconnectSub: null,
        error: null,
        connectingId: device.id,
      });

      // Disconnect previous device if any
      if (connectedDevice) {
        try {
          await manager.cancelDeviceConnection(connectedDevice.id);
        } catch {}
      }

      const connected = await manager.connectToDevice(device.id);
      const discovered =
        await connected.discoverAllServicesAndCharacteristics();

      // Find writable + notifiable characteristics
      const services = await discovered.services();
      let writeServiceUUID: string | null = null;
      let writeUUID: string | null = null;
      let notifyServiceUUID: string | null = null;
      let notifyUUID: string | null = null;

      for (const svc of services) {
        const chars = await discovered.characteristicsForService(svc.uuid);
        for (const c of chars) {
          if (c.isWritableWithResponse || c.isWritableWithoutResponse) {
            writeServiceUUID = svc.uuid;
            writeUUID = c.uuid;
          }
          if (c.isNotifiable) {
            notifyServiceUUID = svc.uuid;
            notifyUUID = c.uuid;
          }
        }
        if (writeUUID && notifyUUID) break;
      }

      set({
        connectedDevice: discovered,
        _writeServiceUUID: writeServiceUUID,
        _writeCharUUID: writeUUID,
        _notifyServiceUUID: notifyServiceUUID,
        _notifyCharUUID: notifyUUID,
      });

      // Subscribe to incoming data if a notifiable characteristic was found
      if (notifyServiceUUID && notifyUUID) {
        const sub = discovered.monitorCharacteristicForService(
          notifyServiceUUID,
          notifyUUID,
          (err, characteristic) => {
            if (err || !characteristic?.value) return;
            const message: ReceivedMessage = {
              id: `${Date.now()}-${Math.random()}`,
              deviceId: device.id,
              data: atob(characteristic.value),
              timestamp: new Date(),
            };
            set((state) => {
              const messages = [...state.receivedMessages, message];
              return {
                receivedMessages:
                  messages.length > MAX_RECEIVED_MESSAGES
                    ? messages.slice(-MAX_RECEIVED_MESSAGES)
                    : messages,
              };
            });
          },
        );
        set({ _monitorSub: sub });
      }

      // Listen for unexpected disconnects
      const disconnectSub = manager.onDeviceDisconnected(device.id, () => {
        get()._monitorSub?.remove();
        set({
          connectedDevice: null,
          _monitorSub: null,
          _disconnectSub: null,
          _writeServiceUUID: null,
          _writeCharUUID: null,
          _notifyServiceUUID: null,
          _notifyCharUUID: null,
          error: `Device "${deviceName(device) ?? device.id}" disconnected.`,
        });
      });
      set({ _disconnectSub: disconnectSub });

      set({ connectingId: null });
      navigate("Tabs");
    } catch (err: any) {
      set({
        error: err.message ?? "Connection failed",
        connectingId: null,
      });
    } finally {
      set({ _connecting: false });
    }
  },

  // ── disconnectDevice ─────────────────────────────────────────────────────
  disconnectDevice: async () => {
    const { connectedDevice, _monitorSub, _disconnectSub } = get();
    _monitorSub?.remove();
    _disconnectSub?.remove();
    set({ _monitorSub: null, _disconnectSub: null });

    try {
      if (connectedDevice) {
        await manager.cancelDeviceConnection(connectedDevice.id);
      }
    } catch {}

    set({
      connectedDevice: null,
      _writeServiceUUID: null,
      _writeCharUUID: null,
      _notifyServiceUUID: null,
      _notifyCharUUID: null,
    });
  },

  // ── sendData ─────────────────────────────────────────────────────────────
  sendData: async (data) => {
    const { connectedDevice, _writeServiceUUID, _writeCharUUID } = get();
    if (!connectedDevice || !_writeServiceUUID || !_writeCharUUID) {
      set({ error: "No device connected or no writable characteristic." });
      return;
    }
    try {
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        _writeServiceUUID,
        _writeCharUUID,
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
