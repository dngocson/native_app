import { Text } from "@/components/ui/text";
import type { RootStackParamList } from "@/types/navigation";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

export default function CameraScreen({ navigation, route }: Props) {
  const { drugId: timeSlot } = route.params;
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePhoto();
    navigation.navigate("Tabs", {
      screen: "Home",
      params: { photoPath: `file://${photo.path}`, timeSlot },
    });
  };

  if (!hasPermission) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-6">
        <Text className="text-white text-lg text-center mb-4">
          Camera permission is required to take photos.
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          className="bg-blue-600 rounded-xl px-6 py-3"
        >
          <Text className="text-white font-bold">Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-white text-lg">No camera device found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        photo={true}
        onInitialized={() => setReady(true)}
      />

      {/* Shutter button */}
      <View className="absolute bottom-10 left-0 right-0 items-center">
        <Pressable
          onPress={takePhoto}
          disabled={!ready}
          className="w-20 h-20 rounded-full bg-white/90 active:bg-white/60 border-4 border-white items-center justify-center"
          style={{ opacity: ready ? 1 : 0.4 }}
        >
          <View className="w-16 h-16 rounded-full bg-white" />
        </Pressable>
      </View>

      {/* Top bar label */}
      <View className="absolute top-14 left-0 right-0 items-center">
        <View className="bg-black/50 rounded-full px-4 py-2">
          <Text className="text-white font-bold text-sm">
            📷 Capture for {timeSlot.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}
