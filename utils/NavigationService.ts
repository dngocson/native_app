import type { RootStackParamList } from "@/types/navigation";
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// ---- OVERLOADS ----

// Case: No params
export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
): void;

// Case: With params
export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params: RootStackParamList[RouteName],
): void;

// ---- IMPLEMENTATION ----
export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params as any);
  }
}
