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
        <View className="flex-row items-center bg-gray-500 rounded-none px-4 py-4 mb-4 border border-gray-700">
          <View className="rounded-none mr-4 bg-gray-600 p-1">
            <Image
              size="lg"
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
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onDisconnect}>
      <View className="flex-row items-center bg-gray-500 rounded-none px-4 py-4 mb-6 border border-gray-700">
        <View className="bg-gray-700 rounded-none p-3 mr-4 border border-gray-800">
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
