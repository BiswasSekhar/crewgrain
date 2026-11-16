import { dayFor } from "../domain/daily";
import { styleUsage } from "../domain/plan";
import { numberLocale, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useDailyStore } from "../lib/daily-store";
import { dateOffset, factoryDate } from "../domain/rules";
import type { Unit } from "../domain/types";
import {
  ActionButton,
  Checkbox,
  SelectAllRow,
  Card,
  Icon,
  Search,
  Sheet,
  Tap as Pressable,
  TextButton,
  IconButton,
  Pill,
  Tools,
  c,
  styles,
} from "./kit";
export const PLAN_INFO = () =>
  tr(
    "Add today’s styles in work order. Counts are optional. Use the arrows to change the order. Assign each employee’s operations from Team.",
  );
type Item = {
  styleId: string;
  count?: number;
};
/** The styles a line works on today: pick several, order them, optional count. */
export function DayPlan({
  unit,
  open,
  notify,
  showTitle = false,
  date: chosenDate,
}: {
  unit: Unit;
  showTitle?: boolean;
  /** The day to plan; today when left out. */
  date?: string;
} & Pick<Tools, "open" | "notify">) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    [help, setHelp] = useState(false),
    [picking, setPicking] = useState(false),
    [picked, setPicked] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const today = factoryDate(),
    date = chosenDate ?? today,
    // The server accepts a plan from yesterday to a week ahead.
    editable = date >= dateOffset(-1, today) && date <= dateOffset(7, today),
    // Operations can be assigned for today and the two days before.
    canAssign = date >= dateOffset(-2, today) && date <= today;
  const rowsFor = (workDate: string): Item[] =>
    (d.dayPlan ?? [])
      .filter((x) => x.unitId === unit.id && x.workDate === workDate)
      .sort((a, b) => a.position - b.position)
      .map((x) => ({ styleId: x.styleId, count: x.count }));
  const items = rowsFor(date);
  const lastDate = [
    ...new Set(
      (d.dayPlan ?? [])
        .filter((x) => x.unitId === unit.id && x.workDate < date)
        .map((x) => x.workDate),
    ),
  ]
    .sort()
    .pop();
  const lastItems = lastDate ? rowsFor(lastDate) : [];
  const save = (next: Item[]) =>
    s.workspaceAct({
      type: "set_day_plan",
      unitId: unit.id,
      workDate: date,
      items: next,
    });
  const run = (next: Item[]) =>
    void save(next).catch((e) => notify((e as Error).message));
  const style = (id: string) => d.styles.find((x) => x.id === id);
  const move = (index: number, by: number) => {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    run(next);
  };
  const available = d.styles.filter(
    (x) =>
      !items.some((i) => i.styleId === x.id) &&
      `${x.code} ${x.name} ${x.category ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const arrow = (
    name: "chevron-up" | "chevron-down",
    off: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        name === "chevron-up" ? tr("Move up") : tr("Move down")
      }
      disabled={off}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.25 : 1,
      }}
    >
      <Icon name={name} size={20} color={c.muted} />
    </Pressable>
  );
  return (
    <View style={{ gap: 16, minWidth: 0, width: "100%" }}>
      {showTitle && (
        <Text style={{ fontSize: 18, fontWeight: "600", color: c.ink }}>
          {tr("Styles")}
        </Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {editable ? (
            <ActionButton
              label={tr("Add styles")}
              icon="add"
              onPress={() => {
                setPicked([]);
                setSearch("");
                setPicking(true);
              }}
            />
          ) : (
            <Text style={styles.muted}>
              {tr(
                "This day can only be viewed. Plans can be changed from yesterday to a week ahead.",
              )}
            </Text>
          )}
        </View>
        <IconButton
          name="information-circle-outline"
          label={tr("About today's styles")}
          onPress={() => setHelp(true)}
        />
      </View>
      {editable && lastItems.length > 0 && (
        <TextButton label={tr("Use last day")} onPress={() => run(lastItems)} />
      )}
      {items.length === 0 && (
        <Card>
          <Text style={styles.muted}>
            {editable
              ? `${tr("No styles yet. Add styles")}${lastItems.length ? tr(" or use last day\u2019s list") : ""}.`
              : tr("No styles were planned for this day.")}
          </Text>
        </Card>
      )}
      {items.map((item, index) => {
        const st = style(item.styleId);
        if (!st) return null;
        const used = styleUsage(d, unit.id, date, item.styleId);
        return (
          <Card key={item.styleId} style={plan.card}>
            <View style={plan.identity}>
              <View style={plan.order}>
                <Text
                  style={{
                    color: c.primary,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={plan.code}>{st.code}</Text>
                <Text style={plan.name}>{st.name}</Text>
              </View>
              {editable && items.length > 1 && (
                <View style={{ flexDirection: "row", flexShrink: 0 }}>
                  {arrow("chevron-up", index === 0, () => move(index, -1))}
                  {arrow("chevron-down", index === items.length - 1, () =>
                    move(index, 1),
                  )}
                </View>
              )}
            </View>
            <View style={plan.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${st.code}, ${item.count ? tr("{{value0}} pieces", { value0: item.count }) : "add count"}`}
                disabled={!editable}
                style={({ pressed }) => [
                  plan.count,
                  { backgroundColor: pressed ? c.soft : c.paper },
                ]}
                onPress={() =>
                  open({
                    title: tr("Piece target"),
                    description: st.code,
                    fields: [
                      {
                        key: "count",
                        label: tr("Target pieces (optional)"),
                        value: item.count ? String(item.count) : "",
                        numeric: true,
                      },
                    ],
                    submitLabel: tr("Save"),
                    onSubmit: async (values) => {
                      const count = values.count?.trim()
                        ? Number(values.count)
                        : undefined;
                      await save(
                        items.map((x) =>
                          x.styleId === item.styleId ? { ...x, count } : x,
                        ),
                      );
                    },
                  })
                }
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    {tr("Target pieces")}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: item.count ? c.ink : c.primary,
                      fontSize: 16,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {item.count
                      ? item.count.toLocaleString(numberLocale())
                      : editable
                        ? tr("Add count")
                        : tr("No target")}
                  </Text>
                </View>
                {editable && (
                  <Icon name="chevron-forward" size={16} color={c.muted} />
                )}
              </Pressable>
              {editable &&
                (used.counted > 0 || used.approved ? (
                  <Pill label={tr("In use")} tone="info" />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${tr("Remove")} ${st.code}`}
                    onPress={() => {
                      const next = items.filter(
                        (x) => x.styleId !== item.styleId,
                      );
                      if (!used.assigned) return run(next);
                      open({
                        title: tr("Remove style"),
                        description: tr(
                          "Remove this style? Its {{value0}} operations for today are unassigned. Nothing is deleted.",
                          { value0: used.assigned },
                        ),
                        fields: [],
                        submitLabel: tr("Remove"),
                        onSubmit: async () => {
                          await save(next);
                        },
                      });
                    }}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: c.danger,
                      backgroundColor: pressed ? c.dangerLight : c.paper,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Text
                      style={{
                        color: c.danger,
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      {tr("Remove")}
                    </Text>
                  </Pressable>
                ))}
            </View>
            {editable && (used.counted > 0 || used.approved) && (
              <Text style={styles.muted}>
                {tr("Work is recorded, so this style stays for the day")}
              </Text>
            )}
          </Card>
        );
      })}
      {help && (
        <Sheet title={tr("Today\u2019s styles")} onClose={() => setHelp(false)}>
          <Text style={styles.body}>{PLAN_INFO()}</Text>
        </Sheet>
      )}
      {items.length > 0 &&
        canAssign &&
        (d.operationDefaults || []).some(
          (defaults) =>
            items.some((item) => item.styleId === defaults.styleId) &&
            d.employees.some(
              (e) =>
                e.id === defaults.employeeId &&
                e.active &&
                e.unitId === unit.id &&
                !dayFor(d, e.id, date),
            ),
        ) && (
          <ActionButton
            secondary
            label={tr("Assign daily defaults")}
            disabled={s.busy}
            onPress={() =>
              void s
                .workspaceAct({
                  type: "apply_line_defaults",
                  unitId: unit.id,
                  workDate: date,
                })
                .then(() => notify(tr("Default operations assigned.")))
                .catch((e) => notify(e.message))
            }
          />
        )}
      {picking && (
        <Sheet
          title={tr("Pick styles")}
          onClose={() => setPicking(false)}
          footer={
            <ActionButton
              label={
                picked.length
                  ? tr("Add {{value0}} {{value1}}", {
                      value0: picked.length,
                      value1: picked.length === 1 ? tr("style") : tr("styles"),
                    })
                  : tr("Add styles")
              }
              disabled={!picked.length}
              onPress={() => {
                setPicking(false);
                run([...items, ...picked.map((styleId) => ({ styleId }))]);
              }}
            />
          }
        >
          <Search
            value={search}
            onChange={setSearch}
            placeholder={tr("Search styles")}
          />
          {available.length === 0 && (
            <Text style={styles.muted}>{tr("No more styles to add.")}</Text>
          )}
          {available.length > 0 && (
            <SelectAllRow
              onAll={() =>
                setPicked([
                  ...picked,
                  ...available
                    .map((st) => st.id)
                    .filter((x) => !picked.includes(x)),
                ])
              }
              onClear={() =>
                setPicked(
                  picked.filter((x) => !available.some((st) => st.id === x)),
                )
              }
            />
          )}
          {available.map((st) => {
            const order = picked.indexOf(st.id);
            const on = order >= 0;
            return (
              <View
                key={st.id}
                style={{
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: on ? c.primary : c.line,
                  backgroundColor: on ? c.soft : c.paper,
                }}
              >
                <Checkbox
                  checked={on}
                  label={st.code + " " + st.name}
                  onChange={(next) =>
                    setPicked(
                      next
                        ? [...picked, st.id]
                        : picked.filter((x) => x !== st.id),
                    )
                  }
                >
                  <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: "700", color: c.ink }}
                    >
                      {st.code} {st.name}
                    </Text>
                    {!!st.category && (
                      <Text style={styles.muted}>{st.category}</Text>
                    )}
                  </View>
                  {on && (
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: c.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "700" }}>
                        {order + 1}
                      </Text>
                    </View>
                  )}
                </Checkbox>
              </View>
            );
          })}
        </Sheet>
      )}
    </View>
  );
}
const plan = StyleSheet.create({
  card: {
    width: "100%",
    minWidth: 0,
    padding: 14,
    gap: 10,
    borderRadius: 16,
    borderColor: c.infoBorder,
  },
  identity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  order: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  code: {
    color: c.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  },
  name: {
    color: c.ink,
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
  },
  count: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.line,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
});
