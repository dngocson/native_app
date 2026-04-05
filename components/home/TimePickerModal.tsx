import { Text } from "@/components/ui/text";
import { Modal, Pressable, View } from "react-native";
import { formatTime, parseTime } from "./helpers";
import { SpinnerColumn } from "./SpinnerColumn";
import { TIME_ICONS, TIME_LABELS } from "./types";

type TimePickerModalProps = {
  visible: boolean;
  index: number | null;
  times: string[];
  onClose: () => void;
  onChangeTime: (updater: (prev: string[]) => string[]) => void;
};

export function TimePickerModal({
  visible,
  index,
  times,
  onClose,
  onChangeTime,
}: TimePickerModalProps) {
  if (index === null) return null;
  const { h, m } = parseTime(times[index]);

  const adjust = (field: "h" | "m", delta: number) => {
    onChangeTime((prev) => {
      const { h: ph, m: pm } = parseTime(prev[index]);
      const newH = field === "h" ? (ph + delta + 24) % 24 : ph;
      const newM = field === "m" ? (pm + delta + 60) % 60 : pm;
      return prev.map((t, i) => (i === index ? formatTime(newH, newM) : t));
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/80 items-center justify-center px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-gray-700 rounded-none p-6 w-72 border border-gray-900">
            <Text className="text-white font-bold text-base text-center mb-1">
              {TIME_ICONS[index]} {TIME_LABELS[index]}
            </Text>
            <Text className="text-slate-400 text-xs text-center mb-6">
              Set medication time
            </Text>

            <View className="flex-row items-center justify-center gap-4">
              <SpinnerColumn
                value={h}
                onUp={() => adjust("h", 1)}
                onDown={() => adjust("h", -1)}
              />
              <Text className="text-white text-3xl font-bold mb-4">:</Text>
              <SpinnerColumn
                value={m}
                onUp={() => adjust("m", 1)}
                onDown={() => adjust("m", -1)}
              />
            </View>

            <Pressable
              onPress={onClose}
              className="mt-6 bg-gray-400 active:bg-gray-500 rounded-none py-3 items-center border border-gray-600"
            >
              <Text className="text-gray-900 font-bold">Confirm</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
