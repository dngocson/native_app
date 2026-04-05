import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

type SpinnerColumnProps = {
  value: number;
  onUp: () => void;
  onDown: () => void;
};

export function SpinnerColumn({ value, onUp, onDown }: SpinnerColumnProps) {
  return (
    <View className="items-center">
      <Pressable
        onPress={onUp}
        className="bg-gray-700 rounded-none w-14 h-10 items-center justify-center active:bg-gray-600 mb-2 border border-gray-800"
      >
        <Text className="text-white text-lg">▲</Text>
      </Pressable>
      <View className="bg-gray-700 rounded-none w-14 h-14 items-center justify-center border border-gray-800">
        <Text className="text-white text-2xl font-bold">
          {String(value).padStart(2, "0")}
        </Text>
      </View>
      <Pressable
        onPress={onDown}
        className="bg-gray-700 rounded-none w-14 h-10 items-center justify-center active:bg-gray-600 mt-2 border border-gray-800"
      >
        <Text className="text-white text-lg">▼</Text>
      </Pressable>
    </View>
  );
}
