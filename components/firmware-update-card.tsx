import { Text } from "@/components/ui/text";
import { FIRMWARE_BUNDLE } from "@/constants/firmwareBundle";
import { FirmwareStatus, useFirmwareStore } from "@/store/firmwareStore";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

const STATUS_LABEL: Record<FirmwareStatus, string> = {
  idle: "",
  checking: "Checking board…",
  uploading: "Uploading…",
  rebooting: "Board rebooting…",
  verifying: "Waiting for board to confirm…",
  done: "Done",
  error: "Failed",
};

export function FirmwareUpdateCard() {
  const {
    status,
    progress,
    currentFile,
    message,
    error,
    boardInfo,
    startUpdate,
    cancelUpdate,
    reset,
  } = useFirmwareStore();

  const busy = ["checking", "uploading", "rebooting", "verifying"].includes(
    status,
  );

  const confirmUpdate = () =>
    Alert.alert(
      "Update firmware",
      `Send firmware ${FIRMWARE_BUNDLE.version} to the board? Keep the phone close to the board until it finishes.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Update", onPress: startUpdate },
      ],
    );

  return (
    <View className="bg-white border border-blue-100 rounded-2xl px-4 py-4 mb-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-slate-900 text-base font-bold">⚙️ Firmware</Text>
        <Text className="text-slate-500 text-xs">
          App: {FIRMWARE_BUNDLE.version}
          {boardInfo?.version ? ` · Board: ${boardInfo.version}` : ""}
        </Text>
      </View>

      {status !== "idle" && (
        <View className="mt-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-slate-600 text-xs font-medium">
              {STATUS_LABEL[status]}
              {status === "uploading" && currentFile ? ` ${currentFile}` : ""}
            </Text>
            {status === "uploading" && (
              <Text className="text-slate-600 text-xs font-bold">
                {Math.round(progress * 100)}%
              </Text>
            )}
          </View>
          <View className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <View
              className={`h-2 rounded-full ${status === "error" ? "bg-rose-500" : status === "done" ? "bg-emerald-500" : "bg-blue-600"}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          {message && status === "done" && (
            <Text className="text-emerald-700 text-xs mt-2">{message}</Text>
          )}
          {error && status === "error" && (
            <Text className="text-rose-600 text-xs mt-2">{error}</Text>
          )}
        </View>
      )}

      <View className="flex-row mt-3">
        {busy ? (
          <Pressable
            onPress={cancelUpdate}
            disabled={status !== "uploading"}
            className="flex-1 bg-slate-100 border border-slate-200 rounded-xl py-3 items-center flex-row justify-center"
            style={status !== "uploading" ? { opacity: 0.6 } : undefined}
          >
            <ActivityIndicator color="#2563eb" size="small" className="mr-2" />
            <Text className="text-slate-700 text-sm font-bold uppercase tracking-wider">
              {status === "uploading" ? "Cancel" : "Please wait"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={status === "done" ? reset : confirmUpdate}
            className="flex-1 bg-blue-600 active:bg-blue-700 rounded-xl py-3 items-center"
          >
            <Text className="text-white text-sm font-bold uppercase tracking-wider">
              {status === "done"
                ? "OK"
                : status === "error"
                  ? "Retry update"
                  : "Update firmware"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
