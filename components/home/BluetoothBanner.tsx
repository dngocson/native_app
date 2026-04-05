import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";
import type { BluetoothDevice } from "react-native-bluetooth-classic";

type BluetoothBannerProps = {
  connectedDevice: BluetoothDevice | null;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function BluetoothBanner({
  connectedDevice,
  onConnect,
  onDisconnect,
}: BluetoothBannerProps) {
  if (!connectedDevice) {
    return (
      <Pressable onPress={onConnect}>
        <View className="flex-row items-center bg-blue-600 rounded-2xl px-4 py-4 mb-6 shadow-lg">
          <View className="bg-blue-500 rounded-xl p-3 mr-4">
            <Image
              size="sm"
              source={{
                uri: require("@/assets/images/bluetooth-solid-icon.png"),
              }}
              alt="Bluetooth"
              className="tint-white"
            />
          </View>
          <View className="flex-1">
            <Text className="text-base text-blue-100 mb-1">
              Turn On Bluetooth and
            </Text>
            <Text className="text-lg font-bold text-white tracking-wide">
              PRESS TO CONNECT
            </Text>
          </View>
          <View className="bg-white/20 rounded-full p-2">
            <Text className="text-white text-lg">›</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onDisconnect}>
      <View className="flex-row items-center bg-blue-600 rounded-2xl px-4 py-4 mb-6 shadow-lg">
        <View className="bg-blue-500 rounded-xl p-3 mr-4">
          <Image
            size="sm"
            source={{
              uri: require("@/assets/images/bluetooth-solid-icon.png"),
            }}
            alt="Bluetooth"
            className="tint-white"
          />
        </View>
        <View className="flex-1">
          <Text className="text-base text-blue-100 mb-1">
            Tap to disconnect
          </Text>
          <Text className="text-lg font-bold text-white tracking-wide">
            {connectedDevice.name}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
