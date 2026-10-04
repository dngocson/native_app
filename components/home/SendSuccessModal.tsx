import { Text } from "@/components/ui/text";
import { Modal, Pressable, View } from "react-native";

type SendSuccessModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SendSuccessModal({
  visible,
  onClose,
}: SendSuccessModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 items-center justify-center px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm">
          <View className="bg-white rounded-3xl p-6 border border-blue-100 shadow-lg">
            <View className="items-center mb-4">
              <Text className="text-4xl mb-2">✅</Text>
              <Text className="text-slate-900 font-bold text-lg text-center">
                Sent successfully
              </Text>
              <Text className="text-slate-500 text-xs text-center mt-1">
                The medication schedule has been sent to your device.
              </Text>
            </View>

            <View className="items-center">
              <Pressable
                onPress={onClose}
                className="w-full bg-blue-600 active:bg-blue-700 rounded-xl py-3 items-center"
              >
                <Text className="text-white font-bold text-sm">OK</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
