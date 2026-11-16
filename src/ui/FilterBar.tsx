import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "./Typography";
import { DayBar } from "./Calendar";
import { ChoiceField, Icon, Tap, c } from "./kit";

/** One tidy filter strip: the line, an optional day, and a More filters button. */
export function FilterBar({
  line,
  onLine,
  lines,
  allLines = false,
  staticLine,
  date,
  onDate,
  min,
  max,
  marked,
  range,
  onMore,
  moreCount = 0,
}: {
  /** Chosen line id ("all" for every line). Admin only; omit for none. */
  line?: string;
  onLine?: (id: string) => void;
  lines?: { id: string; name: string }[];
  allLines?: boolean;
  /** A captain sees their own line as a plain label. */
  staticLine?: string;
  date?: string;
  onDate?: (date: string) => void;
  min?: string;
  max?: string;
  marked?: ReadonlySet<string>;
  /** Shown instead of the day control, for example "6 Nov – 12 Nov". */
  range?: string;
  onMore?: () => void;
  moreCount?: number;
}) {
  useTranslation();
  const showLine = (!!lines && !!onLine && line !== undefined) || !!staticLine;
  return (
    <View style={{ gap: 12 }}>
      {(showLine || onMore) && (
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            {staticLine ? (
              <View
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: c.line,
                  backgroundColor: c.paper,
                }}
              >
                <Icon name="business-outline" size={18} color={c.primary} />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: "600",
                    color: c.ink,
                  }}
                >
                  {staticLine}
                </Text>
              </View>
            ) : showLine ? (
              <ChoiceField
                compact
                icon="business-outline"
                label={tr("Line")}
                value={line!}
                onChange={onLine!}
                options={[
                  ...(allLines ? [{ id: "all", label: tr("All lines") }] : []),
                  ...lines!.map((u) => ({ id: u.id, label: u.name })),
                ]}
              />
            ) : null}
          </View>
          {onMore && (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={
                moreCount
                  ? tr("More filters ({{value0}})", { value0: moreCount })
                  : tr("More filters")
              }
              onPress={onMore}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: moreCount ? c.primary : c.line,
                backgroundColor: pressed || moreCount ? c.soft : c.paper,
              })}
            >
              <Icon name="filter-outline" size={18} color={c.primary} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.ink }}>
                {moreCount
                  ? tr("More filters ({{value0}})", { value0: moreCount })
                  : tr("More filters")}
              </Text>
            </Tap>
          )}
        </View>
      )}
      {date !== undefined && onDate ? (
        <DayBar
          value={date}
          onChange={onDate}
          min={min}
          max={max}
          marked={marked}
        />
      ) : range ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 24,
          }}
        >
          <Icon name="calendar-outline" size={16} color={c.muted} />
          <Text style={{ fontSize: 14, color: c.muted }}>{range}</Text>
        </View>
      ) : null}
    </View>
  );
}
