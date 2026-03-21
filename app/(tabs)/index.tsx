import { Button, ButtonText } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import {
  Table,
  TableBody,
  TableData,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import { Div } from "@expo/html-elements";
import { useState } from "react";
import { Pressable } from "react-native";

type Drug = {
  name: string;
  morning: number;
  noon: number;
  evening: number;
};

const ITEMS_PER_PAGE = 5;

export default function HomeScreen() {
  const [data, setData] = useState<Drug[]>(
    Array.from({ length: 5 }, (_, i) => ({
      name: `Drug #${i + 1}`,
      morning: 0,
      noon: 0,
      evening: 0,
    })),
  );

  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  const currentData = data.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const increment = (index: number, field: keyof Drug) => {
    const realIndex = (page - 1) * ITEMS_PER_PAGE + index;
    setData((prev) =>
      prev.map((item, i) =>
        i === realIndex
          ? { ...item, [field]: (item[field] as number) + 1 }
          : item,
      ),
    );
  };

  return (
    <Div className="py-12 bg-neutral-700 flex-1">
      {/* Header Section */}
      <Div className="flex-row items-center bg-neutral-500 p-2 mb-4">
        <Image
          size="md"
          source={{ uri: require("@/assets/images/bluetooth-solid-icon.png") }}
          alt="image"
        />
        <Text className="flex-1 text-2xl font-bold text-white">
          Turn On Bluetooth and{"\n"}
          <Text className="text-2xl font-bold text-white">
            PRESS THIS BUTTON
          </Text>
        </Text>
      </Div>

      {/* Table */}
      <Table className="w-full border border-gray-200 overflow-hidden bg-neutral-900">
        {/* Header */}
        <TableHeader className="bg-neutral-500 mb-2">
          <TableRow>
            <TableHead className="text-gray-600 bg-neutral-500 font-semibold"></TableHead>
            {["MORNING", "NOON", "EVENING"].map((label) => (
              <TableHead
                key={label}
                className="text-gray-600 bg-neutral-500 px-1 font-semibold text-center"
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

        {/* Body */}
        <TableBody>
          {currentData.map((item, index) => (
            <TableRow key={index} className="bg-neutral-500 mb-1">
              {/* Drug Name */}
              <TableData className="py-5 bg-neutral-300 flex items-center justify-center">
                <Text className="text-black text-md font-bold text-center">
                  {item.name}
                </Text>
              </TableData>

              {/* Morning / Noon / Evening */}
              {(["morning", "noon", "evening"] as (keyof Drug)[]).map(
                (field) => (
                  <TableData key={field} className="text-center">
                    <Pressable onPress={() => increment(index, field)}>
                      <Text className="text-sm font-bold">{item[field]}</Text>
                    </Pressable>
                  </TableData>
                ),
              )}
            </TableRow>
          ))}
        </TableBody>

        {/* Pagination */}
        <TableFooter>
          <TableRow className="bg-gray-100">
            <TableHead className="w-full">
              <Div className="w-full flex-row justify-center py-4">
                <Div className="flex-row items-center gap-2 bg-gray-100 px-3 py-2 rounded-full">
                  {/* Prev */}
                  <Pressable
                    disabled={page === 1}
                    onPress={() => setPage((p) => p - 1)}
                    className="px-2 py-1"
                  >
                    <Text
                      className={`text-sm ${page === 1 ? "text-gray-300" : "text-gray-600"}`}
                    >
                      ◀
                    </Text>
                  </Pressable>

                  {/* Page Numbers */}
                  {Array.from({ length: totalPages }, (_, i) => {
                    const p = i + 1;
                    const isActive = p === page;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setPage(p)}
                        className={`px-3 py-1 rounded-full ${isActive ? "bg-blue-500" : ""}`}
                      >
                        <Text
                          className={`text-sm ${
                            isActive
                              ? "text-white font-semibold"
                              : "text-gray-700"
                          }`}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* Next */}
                  <Pressable
                    disabled={page === totalPages}
                    onPress={() => setPage((p) => p + 1)}
                    className="px-2 py-1"
                  >
                    <Text
                      className={`text-sm ${
                        page === totalPages ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      ▶
                    </Text>
                  </Pressable>
                </Div>
              </Div>
            </TableHead>
          </TableRow>
        </TableFooter>
      </Table>
    </Div>
  );
}
