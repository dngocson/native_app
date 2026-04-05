export type RootStackParamList = {
  Tabs:
    | { screen: "Home"; params: { photoPath: string; timeSlot: string } }
    | undefined;
  BleDevices: undefined;
  Camera: { drugId: string };
};

export type TabParamList = {
  Home: { photoPath: string; timeSlot: string } | undefined;
  Explore: undefined;
};
