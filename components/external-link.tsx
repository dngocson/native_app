import {
  openBrowserAsync,
  WebBrowserPresentationStyle,
} from "expo-web-browser";
import { type ComponentProps } from "react";
import { Linking, Platform, Text, TouchableOpacity } from "react-native";

type Props = {
  href: string;
  children?: React.ReactNode;
  style?: ComponentProps<typeof Text>["style"];
};

export function ExternalLink({ href, children, style }: Props) {
  const handlePress = async () => {
    if (Platform.OS !== "web") {
      await openBrowserAsync(href, {
        presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
      });
    } else {
      Linking.openURL(href);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <Text style={style}>{children}</Text>
    </TouchableOpacity>
  );
}
