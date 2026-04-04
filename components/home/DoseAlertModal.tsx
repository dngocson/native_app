import { Text } from "@/components/ui/text";
import { Modal, Pressable, View } from "react-native";
import type { Drug, TimeSlotKey } from "./types";
import { TIME_FIELDS, TIME_ICONS, TIME_LABELS } from "./types";

type DoseAlertModalProps = {
  visible: boolean;
  slotIndex: number | null;
  data: Drug[];
  onConfirm: (
    slotKey: TimeSlotKey,
    drugs: { name: string; qty: number }[],
  ) => void;
  onDismiss: () => void;
};

export function DoseAlertModal({
  visible,
  slotIndex,
  data,
  onConfirm,
  onDismiss,
}: DoseAlertModalProps) {
  if (slotIndex === null) return null;

  const slotKey = TIME_FIELDS[slotIndex];
  const drugs = data
    .filter((d) => d[slotKey] > 0)
    .map((d) => ({ name: d.name, qty: d[slotKey] }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        className="flex-1 bg-black/80 items-center justify-center px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm">
            {/* Header */}
            <View className="items-center mb-4">
              <Text className="text-4xl mb-2">{TIME_ICONS[slotIndex]}</Text>
              <Text className="text-white font-bold text-lg text-center">
                Time to take your medication!
              </Text>
              <Text className="text-slate-400 text-xs text-center mt-1">
                {TIME_LABELS[slotIndex]}
              </Text>
            </View>

            {/* Drug list */}
            <View className="bg-slate-700/50 rounded-xl p-4 mb-6">
              {drugs.length === 0 ? (
                <Text className="text-slate-400 text-sm text-center">
                  No medications scheduled for this time slot.
                </Text>
              ) : (
                drugs.map((d, i) => (
                  <View
                    key={i}
                    className="flex-row items-center justify-between py-2 border-b border-slate-600 last:border-0"
                  >
                    <Text className="text-blue-300 font-bold text-sm flex-1">
                      {d.name}
                    </Text>
                    <View className="bg-emerald-500/20 rounded-lg px-3 py-1 ml-3">
                      <Text className="text-emerald-400 text-sm font-bold">
                        {d.qty} {d.qty === 1 ? "tablet" : "tablets"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={onDismiss}
                className="flex-1 bg-slate-700 active:bg-slate-600 rounded-xl py-3 items-center"
              >
                <Text className="text-slate-300 font-bold text-sm">Skip</Text>
              </Pressable>
              <Pressable
                onPress={() => onConfirm(slotKey, drugs)}
                className="flex-2 bg-emerald-500 active:bg-emerald-600 rounded-xl py-3 px-6 items-center"
              >
                <Text className="text-white font-bold text-sm">✓ Taken</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
