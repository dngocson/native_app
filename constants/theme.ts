/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#222",
    background: "#d4d4d4",
    tint: "#888",
    icon: "#555",
    tabIconDefault: "#888",
    tabIconSelected: "#555",
  },
  dark: {
    text: "#eee",
    background: "#888",
    tint: "#555",
    icon: "#bbb",
    tabIconDefault: "#bbb",
    tabIconSelected: "#eee",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
