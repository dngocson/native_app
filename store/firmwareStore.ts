import { FIRMWARE_BUNDLE, FirmwareFile } from "@/constants/firmwareBundle";
import {
  BLE_OTA_CHAR_UUID,
  BLE_SERVICE_UUID,
  manager,
  useBluetoothStore,
} from "@/store/bluetoothStore";
import { decode as atob, encode as btoa } from "base-64";
import { Platform } from "react-native";
import { Device, Subscription } from "react-native-ble-plx";
import { create } from "zustand";

// OTA protocol — must match firmware/ota.py
const OP_BEGIN = 0x01;
const OP_FILE = 0x02;
const OP_DATA = 0x03;
const OP_END = 0x04;
const OP_COMMIT = 0x05;
const OP_ABORT = 0x06;
const OP_INFO = 0x07;
const STATUS_OK = 0;

const PREFERRED_MTU = 247;
const DATA_HEADER_SIZE = 5; // op + u32 offset
const ATT_HEADER_SIZE = 3;
const COMMAND_TIMEOUT_MS = 5_000;
const DATA_RETRIES = 3;
const REBOOT_WAIT_MS = 3_000;
const RECONNECT_TIMEOUT_MS = 45_000;
// Board confirms the new version after running stably for 15s (ota.CONFIRM_AFTER_MS)
const CONFIRM_TIMEOUT_MS = 60_000;
const CONFIRM_POLL_MS = 3_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FirmwareStatus =
  | "idle"
  | "checking"
  | "uploading"
  | "rebooting"
  | "verifying"
  | "done"
  | "error";

export type BoardFirmwareInfo = {
  version: string | null;
  state: "ok" | "trial" | "rolled_back" | null;
  failed_version?: string | null;
  reason?: string | null;
  last_error?: string | null;
  crcs?: Record<string, number>;
};

type FirmwareState = {
  status: FirmwareStatus;
  /** 0..1 */
  progress: number;
  currentFile: string | null;
  message: string | null;
  error: string | null;
  boardInfo: BoardFirmwareInfo | null;
  bundleVersion: string;

  startUpdate: () => Promise<void>;
  cancelUpdate: () => void;
  reset: () => void;
};

// ─── Byte helpers ─────────────────────────────────────────────────────────────

const bytesToBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const base64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const asciiToBytes = (text: string) => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

const bytesToText = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
};

const packet = (op: number, payload?: Uint8Array) => {
  const out = new Uint8Array(1 + (payload?.length ?? 0));
  out[0] = op;
  if (payload) out.set(payload, 1);
  return out;
};

const jsonPacket = (op: number, value: unknown) =>
  packet(op, asciiToBytes(JSON.stringify(value)));

const dataPacket = (offset: number, chunk: Uint8Array) => {
  const out = new Uint8Array(DATA_HEADER_SIZE + chunk.length);
  out[0] = OP_DATA;
  new DataView(out.buffer).setUint32(1, offset, true);
  out.set(chunk, DATA_HEADER_SIZE);
  return out;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class CancelledError extends Error {
  constructor() {
    super("Update cancelled");
  }
}

/** Errors that should stop the update immediately (no retry). */
class FatalError extends Error {}

// ─── OTA channel ─────────────────────────────────────────────────────────────

/** Request/response over the OTA characteristic (write + wait for notify). */
class OtaChannel {
  private sub: Subscription | null = null;
  private pending: {
    op: number;
    resolve: (value: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(private deviceId: string) {}

  open() {
    this.sub = manager.monitorCharacteristicForDevice(
      this.deviceId,
      BLE_SERVICE_UUID,
      BLE_OTA_CHAR_UUID,
      (err, characteristic) => {
        if (err) {
          this.pending?.reject(new Error(err.message ?? "OTA channel error"));
          this.pending = null;
          return;
        }
        if (!characteristic?.value || !this.pending) return;
        const bytes = base64ToBytes(characteristic.value);
        // Ignore stale responses (e.g. late reply to a timed-out command)
        if (bytes[0] !== this.pending.op) return;
        this.pending.resolve(bytes);
        this.pending = null;
      },
    );
  }

  close() {
    this.sub?.remove();
    this.sub = null;
    this.pending?.reject(new Error("OTA channel closed"));
    this.pending = null;
  }

  /**
   * Sends a packet and resolves with the response payload (after op+status).
   * `readFull` re-reads the characteristic for responses longer than the MTU.
   */
  async send(data: Uint8Array, readFull = false): Promise<Uint8Array> {
    const op = data[0];

    const response = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.op === op) this.pending = null;
        reject(new Error(`OTA timeout (op ${op})`));
      }, COMMAND_TIMEOUT_MS);
      this.pending = {
        op,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });

    await manager.writeCharacteristicWithResponseForDevice(
      this.deviceId,
      BLE_SERVICE_UUID,
      BLE_OTA_CHAR_UUID,
      bytesToBase64(data),
    );

    let bytes = await response;

    if (readFull) {
      const c = await manager.readCharacteristicForDevice(
        this.deviceId,
        BLE_SERVICE_UUID,
        BLE_OTA_CHAR_UUID,
      );
      if (c.value) bytes = base64ToBytes(c.value);
    }

    if (bytes[1] !== STATUS_OK) {
      throw new Error(bytesToText(bytes.subarray(2)) || "Board rejected update");
    }
    return bytes.subarray(2);
  }

  async info(fileNames: string[]): Promise<BoardFirmwareInfo> {
    const res = await this.send(jsonPacket(OP_INFO, fileNames), true);
    return JSON.parse(bytesToText(res));
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

let cancelRequested = false;

const negotiateMtu = async (device: Device) => {
  if (Platform.OS === "android") {
    try {
      const updated = await manager.requestMTUForDevice(
        device.id,
        PREFERRED_MTU,
      );
      return updated.mtu;
    } catch {
      return device.mtu;
    }
  }
  // iOS negotiates MTU automatically
  return device.mtu;
};

const waitForReconnect = async (device: Device) => {
  const { connectToDevice } = useBluetoothStore.getState();
  const deadline = Date.now() + RECONNECT_TIMEOUT_MS;

  await sleep(REBOOT_WAIT_MS);
  while (Date.now() < deadline) {
    if (await connectToDevice(device, { navigateOnSuccess: false })) {
      return useBluetoothStore.getState().connectedDevice;
    }
    await sleep(2_000);
  }
  return null;
};

const readInfo = async (deviceId: string, fileNames: string[] = []) => {
  const channel = new OtaChannel(deviceId);
  channel.open();
  try {
    return await channel.info(fileNames);
  } finally {
    channel.close();
  }
};

/** Polls the board until it confirms the new version (or rolls back). */
const waitForConfirm = async (
  device: Device,
  onInfo: (info: BoardFirmwareInfo) => void,
) => {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const current =
      useBluetoothStore.getState().connectedDevice ??
      (await waitForReconnect(device));
    if (!current) break;

    try {
      // A crash during the trial run resets the board — don't alert for it
      useBluetoothStore.getState().expectDisconnect();
      const info = await readInfo(current.id);
      onInfo(info);

      if (info.state === "rolled_back") {
        throw new FatalError(
          `New firmware failed and the board rolled back to ${info.version}. ${info.reason ?? ""}`.trim(),
        );
      }
      if (info.version !== FIRMWARE_BUNDLE.version) {
        throw new FatalError(
          `Board reports version ${info.version}, expected ${FIRMWARE_BUNDLE.version}.`,
        );
      }
      if (info.state === "ok") return info;
    } catch (err) {
      if (err instanceof FatalError) throw err;
    }
    await sleep(CONFIRM_POLL_MS);
  }

  throw new Error(
    "Timed out waiting for the board to confirm the new firmware. Reconnect to check its status.",
  );
};

export const useFirmwareStore = create<FirmwareState>((set, get) => ({
  status: "idle",
  progress: 0,
  currentFile: null,
  message: null,
  error: null,
  boardInfo: null,
  bundleVersion: FIRMWARE_BUNDLE.version,

  startUpdate: async () => {
    const { status } = get();
    if (["checking", "uploading", "rebooting", "verifying"].includes(status)) {
      return;
    }

    const device = useBluetoothStore.getState().connectedDevice;
    if (!device) {
      set({ status: "error", error: "Connect to the board first." });
      return;
    }

    cancelRequested = false;
    set({
      status: "checking",
      progress: 0,
      currentFile: null,
      message: null,
      error: null,
    });

    const fileNames = FIRMWARE_BUNDLE.files.map((f) => f.name);
    const channel = new OtaChannel(device.id);

    try {
      const mtu = await negotiateMtu(device);
      const chunkSize = Math.max(
        16,
        Math.min(mtu, PREFERRED_MTU) - ATT_HEADER_SIZE - DATA_HEADER_SIZE,
      );

      channel.open();
      const info = await channel.info(fileNames);
      set({ boardInfo: info });

      // Only send files whose content differs from what's on the board
      const changed: FirmwareFile[] = FIRMWARE_BUNDLE.files.filter(
        (f) => info.crcs?.[f.name] !== f.crc,
      );

      if (changed.length === 0) {
        channel.close();
        set({
          status: "done",
          progress: 1,
          message: "Board is already up to date.",
        });
        return;
      }

      set({ status: "uploading" });

      const totalBytes = changed.reduce((s, f) => s + f.size, 0);
      let sentBytes = 0;

      await channel.send(
        jsonPacket(OP_BEGIN, {
          version: FIRMWARE_BUNDLE.version,
          files: changed.map((f) => f.name),
        }),
      );

      for (const file of changed) {
        set({ currentFile: file.name });
        const content = base64ToBytes(file.base64);

        await channel.send(
          jsonPacket(OP_FILE, {
            name: file.name,
            size: file.size,
            crc: file.crc,
          }),
        );

        let offset = 0;
        while (offset < content.length) {
          if (cancelRequested) throw new CancelledError();

          const chunk = content.subarray(offset, offset + chunkSize);
          let attempt = 0;
          let res: Uint8Array;
          while (true) {
            try {
              res = await channel.send(dataPacket(offset, chunk));
              break;
            } catch (err) {
              if (++attempt >= DATA_RETRIES) throw err;
            }
          }

          const next = new DataView(
            res.buffer,
            res.byteOffset,
            res.byteLength,
          ).getUint32(0, true);
          sentBytes += next - offset;
          offset = next;
          set({ progress: sentBytes / totalBytes });
        }

        await channel.send(packet(OP_END));
      }

      // Board resets right after acknowledging COMMIT
      useBluetoothStore.getState().expectDisconnect();
      await channel.send(packet(OP_COMMIT));
      channel.close();

      set({ status: "rebooting", currentFile: null, progress: 1 });

      const reconnected = await waitForReconnect(device);
      if (!reconnected) {
        throw new Error(
          "Upload finished but the board did not come back. Reconnect manually to check.",
        );
      }

      set({ status: "verifying" });
      await waitForConfirm(device, (info) => set({ boardInfo: info }));

      set({
        status: "done",
        message: `Updated to ${FIRMWARE_BUNDLE.version} (${changed
          .map((f) => f.name)
          .join(", ")}).`,
      });
    } catch (err: any) {
      if (err instanceof CancelledError) {
        try {
          await channel.send(packet(OP_ABORT));
        } catch {}
      }
      channel.close();
      set({
        status: "error",
        error: err?.message ?? "Firmware update failed",
      });
    } finally {
      useBluetoothStore.getState().expectDisconnect(false);
    }
  },

  cancelUpdate: () => {
    cancelRequested = true;
  },

  reset: () =>
    set({
      status: "idle",
      progress: 0,
      currentFile: null,
      message: null,
      error: null,
    }),
}));
