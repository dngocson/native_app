import {
  Table,
  TableBody,
  TableData,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";
import type { Drug, TimeSlotKey } from "./types";
import { TIME_FIELDS, TIME_LABELS } from "./types";

type DrugTableProps = {
  data: Drug[];
  editing: boolean;
  photos: Record<string, string>;
  times: string[];
  onIncrement: (index: number, field: TimeSlotKey) => void;
  onHeaderPress: (i: number) => void;
  onLabelPress: (label: string) => void;
};

export function DrugTable({
  data,
  editing,
  photos,
  times,
  onIncrement,
  onHeaderPress,
  onLabelPress,
}: DrugTableProps) {
  return (
    <View className="rounded-none overflow-hidden bg-gray-700 shadow-none border border-gray-700">
      <Table className="w-full table-fixed">
        <TableHeader className="mb-[0.3rem]">
          <TableRow className={`border-b-0 bg-gray-500`}>
            <TableHead className="px-3 py-3 text-center min-h-[52px]">
              <View className="w-full h-full">
                <View className=" p-2 w-full h-full items-center justify-center">
                  <Text className="text-[12px] font-bold text-black uppercase tracking-wider ">
                    Medicine
                  </Text>
                </View>
              </View>
            </TableHead>

            {TIME_LABELS.map((label, i) => (
              <TableHead
                key={label}
                className="px-1 py-3 text-center min-h-[52px]"
              >
                <Pressable
                  onPress={() => onHeaderPress(i)}
                  className="w-full h-full"
                >
                  <View
                    className={`${editing ? "bg-yellow-300" : "bg-gray-300"} p-2 w-full h-full items-center justify-center`}
                  >
                    <Text className="text-[12px] font-bold uppercase tracking-wider text-blue-700">
                      {label}
                    </Text>
                  </View>
                </Pressable>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody className="flex-col gap-1">
          {data.map((item, index) => (
            <TableRow key={index} className="bg-gray-500">
              <TableData className="px-3 py-2 text-center min-h-[52px]">
                <Pressable
                  onPress={() => onLabelPress(item.name)}
                  className="bg-gray-300 rounded-none h-full w-full items-center justify-center border border-gray-400"
                >
                  <Text className="text-black text-lg font-bold">
                    {item.name}
                  </Text>
                </Pressable>
              </TableData>

              {TIME_FIELDS.map((field) => (
                <TableData
                  key={field}
                  className="px-1 py-2 text-center min-h-[52px]"
                >
                  <Pressable
                    onPress={() => editing && onIncrement(index, field)}
                    disabled={!editing}
                    className={`rounded-none w-12 h-12 items-center justify-center `}
                  >
                    <Text className={` text-lg font-bold text-black`}>
                      {item[field]}
                    </Text>
                  </Pressable>
                </TableData>
              ))}
            </TableRow>
          ))}

          {/* Time Row */}
          <TableRow className="bg-gray-500 border-b-0 mt-[0.1rem]">
            <TableData className="px-3 py-3 min-h-[52px] text-center">
              <View className="flex-1 h-full w-full flex items-center justify-center">
                <Text className="text-white text-lg font-bold uppercase tracking-wider">
                  Time 🕛
                </Text>
              </View>
            </TableData>

            {times.map((t, i) => (
              <TableData key={i} className="px-1 py-3 min-h-[52px] text-center">
                <View className="bg-gray-300 rounded-none px-3 py-1.5 border border-gray-500">
                  <Text className="text-blue-700 text-lg font-bold">{t}</Text>
                </View>
              </TableData>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </View>
  );
}
