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
import slugify from "slugify";
import type { Drug, TimeSlotKey } from "./types";
import { TIME_FIELDS, TIME_ICONS, TIME_LABELS } from "./types";

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
    <View className="rounded-2xl overflow-hidden bg-slate-800 shadow-lg">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-slate-700 border-b-0">
            <TableHead className="bg-transparent px-3 py-3" style={{ flex: 1 }}>
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
                <Pressable
                  onPress={() => onHeaderPress(i)}
                  className="items-center"
                >
                  <Text className="text-base mb-1">{TIME_ICONS[i]}</Text>
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    {label}
                  </Text>
                  {editing && (
                    <Text className="text-[9px] text-slate-400 mt-0.5">
                      {times[i]}
                    </Text>
                  )}
                </Pressable>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={index}
              className={`border-b-0 ${
                index % 2 === 0 ? "bg-slate-800" : "bg-slate-800/60"
              }`}
            >
              <TableData
                className="px-3 py-2"
                style={{ flex: 1, justifyContent: "center" }}
              >
                <Pressable
                  onPress={() => onLabelPress(item.name)}
                  className="bg-blue-500/15 rounded-lg px-3 py-2"
                >
                  <Text className="text-blue-300 text-sm font-bold">
                    {item.name}
                  </Text>
                  {photos[
                    slugify(item.name, {
                      lower: true,
                      strict: true,
                      replacement: "-",
                    })
                  ] && (
                    <Text className="text-emerald-400 text-[8px] mt-0.5">
                      {editing ? "📷 Retake" : "🖼 View"}
                    </Text>
                  )}
                </Pressable>
              </TableData>

              {TIME_FIELDS.map((field) => (
                <TableData
                  key={field}
                  className="px-1 py-2"
                  style={{ flex: 1, alignItems: "center" }}
                >
                  <Pressable
                    onPress={() => editing && onIncrement(index, field)}
                    disabled={!editing}
                    className={`rounded-xl w-12 h-12 items-center justify-center ${
                      editing
                        ? "bg-slate-700 active:bg-slate-600"
                        : "bg-slate-700/50"
                    }`}
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
            {times.map((t, i) => (
              <TableData
                key={i}
                className="px-1 py-3"
                style={{ flex: 1, alignItems: "center" }}
              >
                <View className="bg-blue-500/20 rounded-lg px-3 py-1.5">
                  <Text className="text-blue-300 text-sm font-bold">{t}</Text>
                </View>
              </TableData>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </View>
  );
}
