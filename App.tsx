import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { GluestackUIProvider } from "./components/ui/gluestack-ui-provider";
import "./global.css";
import { useColorScheme } from "./hooks/use-color-scheme";

import { HapticTab } from "./components/haptic-tab";
import { IconSymbol } from "./components/ui/icon-symbol";
import { Colors } from "./constants/theme";
import BleDevicesScreen from "./screens/ble-devices";
import CameraScreen from "./screens/camera";
import ExploreScreen from "./screens/explore";
import HomeScreen from "./screens/home";

import { useEffect } from "react";
import { useBluetoothStore } from "./store/bluetoothStore";
import { RootStackParamList, TabParamList } from "./types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  const colorScheme = useColorScheme();
  const init = useBluetoothStore((s) => s.init);
  useEffect(() => init(), [init]);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <GluestackUIProvider mode="dark">
      <NavigationContainer
        theme={colorScheme === "dark" ? DarkTheme : DefaultTheme}
      >
        <Stack.Navigator
          screenOptions={{
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen
            name="Tabs"
            component={TabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="BleDevices"
            component={BleDevicesScreen}
            options={{
              title: "BLE Devices",
              headerStyle: { backgroundColor: "#0f172a" },
              headerTintColor: "#fff",
            }}
          />
          <Stack.Screen
            name="Camera"
            component={CameraScreen}
            options={{
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </GluestackUIProvider>
  );
}
