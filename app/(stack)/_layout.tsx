import { Stack } from "expo-router";

export default function StackLayout() {
  return (
    <Stack
      screenOptions={{
        animation: "slide_from_right",
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#fff",
      }}
    >
      <Stack.Screen name="ble-devices" options={{ title: "BLE Devices" }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}
