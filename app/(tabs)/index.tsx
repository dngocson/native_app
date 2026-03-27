import { Button, ButtonText } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import {
  Table,
  TableBody,
  TableData,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

type Drug = {
  name: string;
  morning: number;
  noon: number;
  evening: number;
};

const TIME_LABELS = ["MORNING", "NOON", "EVENING"] as const;
const TIME_FIELDS: (keyof Omit<Drug, "name">)[] = [
  "morning",
  "noon",
  "evening",
];
const TIME_VALUES = ["8:30", "12:30", "18:30"];
const TIME_ICONS = ["🌅", "☀️", "🌙"];

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<Drug[]>(
    Array.from({ length: 6 }, (_, i) => ({
      name: `Drug #${i + 1}`,
      morning: 0,
      noon: 0,
      evening: 0,
    })),
  );

  const increment = (index: number, field: keyof Omit<Drug, "name">) => {
    setData((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: item[field] + 1 } : item,
      ),
    );
  };

  return (
    <ScrollView className="flex-1 bg-slate-900">
      <View className="px-4 pt-14 pb-8">
        {/* Bluetooth Banner */}
        <Pressable onPress={() => router.push("/(stack)/ble-devices")}>
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

        {/* Drug Table */}
        <View className="rounded-2xl overflow-hidden bg-slate-800 shadow-lg">
          <Table className="w-full">
            {/* Header */}
            <TableHeader>
              <TableRow className="bg-slate-700 border-b-0">
                <TableHead
                  className="bg-transparent px-3 py-3"
                  style={{ flex: 1 }}
                >
                  <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Medicine
                  </Text>
                </TableHead>
                {TIME_LABELS.map((label, i) => (
                  <TableHead
                    key={label}
                    className="bg-transparent px-1 py-3"
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <View className="items-center">
                      <Text className="text-base mb-1">{TIME_ICONS[i]}</Text>
                      <Text className="text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                        {label}
                      </Text>
                    </View>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.map((item, index) => (
                <TableRow
                  key={index}
                  className={`border-b-0 ${index % 2 === 0 ? "bg-slate-800" : "bg-slate-800/60"}`}
                >
                  <TableData
                    className="px-3 py-2"
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <View className="bg-blue-500/15 rounded-lg px-3 py-2">
                      <Text className="text-blue-300 text-sm font-bold">
                        {item.name}
                      </Text>
                    </View>
                  </TableData>
                  {TIME_FIELDS.map((field) => (
                    <TableData
                      key={field}
                      className="px-1 py-2"
                      style={{ flex: 1, alignItems: "center" }}
                    >
                      <Pressable
                        onPress={() => increment(index, field)}
                        className="bg-slate-700 active:bg-slate-600 rounded-xl w-12 h-12 items-center justify-center"
                      >
                        <Text className="text-white text-lg font-bold">
                          {item[field]}
                        </Text>
                      </Pressable>
                    </TableData>
                  ))}
                </TableRow>
              ))}

              {/* Time Row */}
              <TableRow className="bg-slate-700/50 border-b-0">
                <TableData className="px-3 py-3" style={{ flex: 1 }}>
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                    Time
                  </Text>
                </TableData>
                {TIME_VALUES.map((time) => (
                  <TableData
                    key={time}
                    className="px-1 py-3"
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <View className="bg-blue-500/20 rounded-lg px-3 py-1.5">
                      <Text className="text-blue-300 text-sm font-bold">
                        {time}
                      </Text>
                    </View>
                  </TableData>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </View>

        {/* Action Buttons */}
        <View className="mt-6 flex-row gap-4">
          <Button
            size="lg"
            className="flex-1 bg-emerald-500 active:bg-emerald-600 rounded-xl h-14"
          >
            <ButtonText className="font-bold text-white text-base tracking-wide">
              ✏️ EDIT
            </ButtonText>
          </Button>
          <Button
            size="lg"
            className="flex-1 bg-rose-500 active:bg-rose-600 rounded-xl h-14"
          >
            <ButtonText className="font-bold text-white text-base tracking-wide">
              💾 SAVE
            </ButtonText>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
