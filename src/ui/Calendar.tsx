import React, { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import { formatDate, tr } from "../lib/i18n";
import { dateOffset, factoryDate } from "../domain/rules";
import {
  clampDate,
  dayLabelKind,
  inRange,
  monthOf,
  monthWeeks,
  shiftMonth,
} from "../domain/calendar";
import {
  Icon,
  IconButton,
  Sheet,
  Tap as Pressable,
  TextButton,
  c,
} from "./kit";

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
/** "Today", "Yesterday", "Tomorrow", otherwise "Thu, 12 Nov" (with the year
 *  when it is not the current year, "Wed, 12 Nov 2025"). */
export function dayLabel(date: string, today = factoryDate()) {
  const kind = dayLabelKind(date, today);
  if (kind === "today") return tr("Today");
  if (kind === "yesterday") return tr("Yesterday");
  if (kind === "tomorrow") return tr("Tomorrow");
  return formatDate(noon(date), {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(kind === "otherYear" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
/** Month grid in a sheet, our own so it looks the same on every phone. */
export function DatePicker({
  value,
  onChange,
  onClose,
  min,
  max,
  marked,
  title,
}: {
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
  min?: string;
  max?: string;
  /** Dates to show a small dot under, for example days that have work. */
  marked?: ReadonlySet<string>;
  title?: string;
}) {
  useTranslation();
  const today = factoryDate(),
    [month, setMonth] = useState(monthOf(value)),
    weeks = monthWeeks(month),
    prevOk = !min || shiftMonth(month, -1) >= monthOf(min),
    nextOk = !max || shiftMonth(month, 1) <= monthOf(max);
  const pick = (date: string) => {
    onChange(date);
    onClose();
  };
  return (
    <Sheet title={title ?? tr("Choose a day")} onClose={onClose}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <IconButton
          name="chevron-back"
          label={tr("Previous month")}
          disabled={!prevOk}
          onPress={() => setMonth(shiftMonth(month, -1))}
        />
        <Text
          accessibilityRole="header"
          style={{ fontSize: 17, fontWeight: "700", color: c.ink }}
        >
          {formatDate(noon(`${month}-01`), {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </Text>
        <IconButton
          name="chevron-forward"
          label={tr("Next month")}
          disabled={!nextOk}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      <View style={{ flexDirection: "row" }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", padding: 4 }}>
            <Text style={{ fontSize: 12, color: c.muted, fontWeight: "600" }}>
              {formatDate(noon(`2026-11-0${2 + i}`), {
                weekday: "short",
                timeZone: "UTC",
              })}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((week, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {week.map((date, col) => {
            if (!date)
              return <View key={col} style={{ flex: 1, height: 46 }} />;
            const on = date === value,
              ok = inRange(date, min, max),
              isToday = date === today;
            return (
              <View key={col} style={{ flex: 1, padding: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={formatDate(noon(date), {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })}
                  accessibilityState={{ selected: on, disabled: !ok }}
                  disabled={!ok}
                  onPress={() => pick(date)}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? c.primary : "transparent",
                    borderWidth: isToday && !on ? 1.5 : 0,
                    borderColor: c.primary,
                    opacity: ok ? 1 : 0.3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: on || isToday ? "700" : "500",
                      color: on ? "white" : c.ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {Number(date.slice(8))}
                  </Text>
                  {marked?.has(date) && (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 4,
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: on ? "white" : c.primary,
                      }}
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <TextButton
          label={tr("Today")}
          onPress={() => pick(clampDate(today, min, max))}
        />
        {!!marked?.size && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: c.primary,
              }}
            />
            <Text style={{ fontSize: 12, color: c.muted }}>
              {tr("Has work")}
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}
/** Previous day, the chosen day (opens the calendar), next day. */
export function DayBar({
  value,
  onChange,
  min,
  max,
  marked,
}: {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  marked?: ReadonlySet<string>;
}) {
  useTranslation();
  const [open, setOpen] = useState(false),
    prev = dateOffset(-1, value),
    next = dateOffset(1, value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <IconButton
        name="chevron-back"
        label={tr("Previous day")}
        disabled={!inRange(prev, min, max)}
        onPress={() => onChange(prev)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tr("Choose a day")}: ${dayLabel(value)}`}
        onPress={() => setOpen(true)}
        style={{
          flex: 1,
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: c.line,
          backgroundColor: c.paper,
          paddingHorizontal: 12,
        }}
      >
        <Icon name="calendar-outline" size={20} color={c.primary} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink }}>
          {dayLabel(value)}
        </Text>
        <Icon name="chevron-down" size={16} color={c.muted} />
      </Pressable>
      <IconButton
        name="chevron-forward"
        label={tr("Next day")}
        disabled={!inRange(next, min, max)}
        onPress={() => onChange(next)}
      />
      {open && (
        <DatePicker
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          min={min}
          max={max}
          marked={marked}
        />
      )}
    </View>
  );
}
