import { Text } from "@/components/ui/text";
import { Modal, Pressable, View } from "react-native";

type SendErrorModalProps = {
  message: string | null;
  /** "Retry" — resends the same plan to the board. */
  onRetry: () => void;
  /** "Undo changes" — restores drug quantities to before Edit, exits editing. */
  onRevert: () => void;
  /** Tap-outside / back — hides the popup, keeps editing untouched. */
  onClose: () => void;
};

export function SendErrorModal({
  message,
  onRetry,
  onRevert,
  onClose,
}: SendErrorModalProps) {
  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 items-center justify-center px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm"
        >
          <View className="bg-white rounded-3xl p-6 border border-rose-100 shadow-lg">
            <View className="items-center mb-4">
              <Text className="text-4xl mb-2">⚠️</Text>
              <Text className="text-slate-900 font-bold text-lg text-center">
                Couldn't send to the board
              </Text>
              <Text className="text-slate-500 text-xs text-center mt-1">
                {message} Your changes were not saved — retry, or undo them.
              </Text>
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={onRevert}
                className="flex-1 bg-slate-100 active:bg-slate-200 rounded-xl py-3 items-center border border-slate-200"
              >
                <Text className="text-slate-700 font-bold text-sm">
                  Undo changes
                </Text>
              </Pressable>
              <Pressable
                onPress={onRetry}
                className="flex-1 bg-blue-600 active:bg-blue-700 rounded-xl py-3 items-center"
              >
                <Text className="text-white font-bold text-sm">Retry</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
