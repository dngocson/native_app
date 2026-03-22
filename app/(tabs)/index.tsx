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
import { Div } from "@expo/html-elements";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ScrollView } from "react-native-reanimated/lib/typescript/Animated";

type Drug = {
  name: string;
  morning: number;
  noon: number;
  evening: number;
};

export default function HomeScreen() {
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
    <ScrollView>
      <Div className="py-12 bg-neutral-700 flex-1">
        <Div className="flex-row items-center bg-neutral-500 p-2 mb-4">
          <Image
            size="md"
            source={{
              uri: require("@/assets/images/bluetooth-solid-icon.png"),
            }}
            alt="image"
          />
          <Text className="flex-1 text-2xl font-bold text-white">
            Turn On Bluetooth and{"\n"}
            <Text className="text-2xl font-bold text-white">
              PRESS THIS BUTTON
            </Text>
          </Text>
        </Div>

        <Table className="w-full border border-gray-200 overflow-hidden bg-neutral-900">
          <TableHeader className="bg-neutral-500 mb-2">
            <TableRow>
              <TableHead className="bg-neutral-500" style={{ flex: 1 }} />
              {(["MORNING", "NOON", "EVENING"] as const).map((label) => (
                <TableHead
                  key={label}
                  className="bg-neutral-500 px-1 text-center"
                  style={{ flex: 1, alignItems: "center" }}
                >
                  <Button
                    variant="solid"
                    size="md"
                    action="primary"
                    className="px-2"
                  >
                    <ButtonText
                      className="text-blue-700 text-center"
                      numberOfLines={1}
                    >
                      {label}
                    </ButtonText>
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((item, index) => (
              <TableRow key={index} className="bg-neutral-500 mb-1">
                <TableData className="bg-neutral-300" style={{ flex: 1 }}>
                  <View
                    style={{ alignItems: "center", justifyContent: "center" }}
                  >
                    <Text className="text-black text-lg font-bold">
                      {item.name}
                    </Text>
                  </View>
                </TableData>
                {(
                  ["morning", "noon", "evening"] as (keyof Omit<Drug, "name">)[]
                ).map((field) => (
                  <TableData
                    key={field}
                    className="text-center"
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <Pressable onPress={() => increment(index, field)}>
                      <Text className="text-black text-xl font-bold">
                        {item[field]}
                      </Text>
                    </Pressable>
                  </TableData>
                ))}
              </TableRow>
            ))}

            <TableRow className="bg-neutral-500">
              <TableData className="bg-neutral-500" style={{ flex: 1 }}>
                <Div className="p-2">
                  <Text className="text-xl font-bold">TIME</Text>
                </Div>
              </TableData>

              <TableData className="bg-neutral-500" style={{ flex: 1 }}>
                <Div className="p-2 bg-white">
                  <Text className="text-xl text-blue-600 font-bold">8:30</Text>
                </Div>
              </TableData>

              <TableData className="bg-neutral-500" style={{ flex: 1 }}>
                <Div className="p-2 bg-white">
                  <Text className="text-xl text-blue-600 font-bold">12:30</Text>
                </Div>
              </TableData>

              <TableData className="bg-neutral-500" style={{ flex: 1 }}>
                <Div className="p-2 bg-white">
                  <Text className="text-xl text-blue-600 font-bold">18:30</Text>
                </Div>
              </TableData>
            </TableRow>
          </TableBody>
        </Table>

        <Div className="mt-4 flex-row justify-between gap-2 px-12 py-4 bg-neutral-300 flex-1">
          <Button className="bg-green-500">
            <ButtonText className="font-bold text-white">EDIT</ButtonText>
          </Button>
          <Button className="bg-red-600">
            <ButtonText className="font-bold text-white">SAVE</ButtonText>
          </Button>
        </Div>
      </Div>
    </ScrollView>
  );
}
