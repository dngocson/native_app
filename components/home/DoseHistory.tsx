import { Text } from "@/components/ui/text";
import { Alert, Pressable, View } from "react-native";
import { formatTime } from "./helpers";
import type { DoseRecord } from "./types";
import { TIME_FIELDS, TIME_ICONS } from "./types";

type DoseHistoryProps = {
  history: DoseRecord[];
  onClear: () => void;
};

export function DoseHistory({ history, onClear }: DoseHistoryProps) {
  if (history.length === 0) return null;

  const handleClear = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to delete all dose history?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: onClear },
      ],
    );
  };

  return (
    <View className="mt-4 bg-gray-600 rounded-none p-4 border border-gray-800">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
          Dose History
        </Text>
        <Pressable
          onPress={handleClear}
          className="bg-gray-400 rounded-none px-3 py-1 border border-gray-500"
        >
          <Text className="text-gray-800 text-xs font-bold">🗑 Clear</Text>
        </Pressable>
      </View>

      {history.slice(0, 5).map((record, i) => {
        const d = new Date(record.takenAt);
        const timeStr = formatTime(d.getHours(), d.getMinutes());
        const dateStr = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const slotIdx = TIME_FIELDS.indexOf(record.slotKey);

        return (
          <View
            key={i}
            className="flex-row items-start py-2 border-b border-gray-700 last:border-0"
          >
            <Text className="text-base mr-3 mt-0.5">{TIME_ICONS[slotIdx]}</Text>
            <View className="flex-1">
              <Text className="text-slate-300 text-xs">
                {dateStr} — {timeStr}
              </Text>
              <Text className="text-slate-400 text-[11px] mt-0.5">
                {record.drugs
                  .map(
                    (d) =>
                      `${d.name} ×${d.qty} ${d.qty === 1 ? "tablet" : "tablets"}`,
                  )
                  .join(", ")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
