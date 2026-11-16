import { numberLocale, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "./Typography";
import { cachedLedger, useDailyStore } from "../lib/daily-store";
import { dateOffset, factoryDate, money } from "../domain/rules";
import {
  lineActiveDates,
  lineDay,
  lineRecentDays,
  type StaffStatus,
} from "../domain/line";
import { plannedStyleIds } from "../domain/plan";
import { presenceState } from "../domain/presence";
import { productionDate } from "../domain/production";
import type { Employee, Style } from "../domain/types";
import { FilterBar } from "./FilterBar";
import { Toolbar } from "./Toolbar";
import { EmptyState } from "./EmptyState";
import { EmployeeDetail } from "./Output";
import {
  Card,
  Icon,
  Pill,
  Search,
  Tap,
  TextButton,
  c,
  styles,
  type Tools,
} from "./kit";

const STATUS: Record<
  StaffStatus,
  { label: () => string; tone: "neutral" | "warning" | "info" | "success" }
> = {
  not_started: { label: () => tr("Not started"), tone: "neutral" },
  counting: { label: () => tr("Counting"), tone: "info" },
  checked: { label: () => tr("Checked"), tone: "success" },
  needs_admin: { label: () => tr("Waiting for admin"), tone: "warning" },
  approved: { label: () => tr("Approved"), tone: "success" },
};

/** Admin: one production line on one day. */
export function LineDetail({
  open,
  notify,
  go,
  track,
  lineId,
  initialDate,
}: Tools & { lineId?: string; initialDate?: string }) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    today = factoryDate(),
    min = dateOffset(-35, today),
    start =
      initialDate && initialDate >= min && initialDate <= today
        ? initialDate
        : today,
    [date, setDate] = useState(start),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<Employee | null>(null);
  // Back from a screen opened here returns to the day being looked at.
  useEffect(() => {
    track?.({ line: lineId, date: date === today ? undefined : date });
  }, [track, lineId, date, today]);
  const unit = d.units.find((u) => u.id === lineId);
  if (s.actor?.role !== "admin") return null;
  if (!unit)
    return (
      <EmptyState
        icon="business-outline"
        title={tr("This line was not found")}
        detail={tr("It may have been removed. Go back to today's overview.")}
        actions={[
          { label: tr("Back to Today"), onPress: () => go?.("overview") },
        ]}
      />
    );
  const rows = cachedLedger(d),
    day = lineDay(d, unit.id, date, rows),
    recent = lineRecentDays(d, unit.id, today, 7, rows),
    plannedStyles = plannedStyleIds(d, unit.id, date)
      .map((id) => d.styles.find((x) => x.id === id))
      .filter((x): x is Style => !!x),
    captain = day.staff.find((p) => p.isCaptain)?.employee,
    isToday = date === today,
    dateText = productionDate(date),
    seen = d.presence
      ? new Map(d.presence.map((p) => [p.profileId, p.lastSeenAt]))
      : null,
    shown = day.staff.filter((p) =>
      `${p.employee.name} ${p.employee.employeeId}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  const planDay = () => go?.("tasks", { line: unit.id, date });
  const manageEmployees = () => go?.("people", { line: unit.id });
  const captainOptions = d.employees
    .filter((e) => e.active && !e.deletedAt && e.role !== "admin")
    .map((e) => ({ value: e.id, label: e.name + " · " + e.employeeId }));
  async function saveCaptain(employeeId: string) {
    await s.workspaceAct({
      type: "set_line_captain",
      unitId: unit!.id,
      employeeId,
    });
  }
  function setCaptain() {
    open({
      title: tr("Choose captain"),
      description: tr(
        "The selected employee becomes captain of this line. The current captain becomes an employee.",
      ),
      fields: [
        {
          key: "employeeId",
          label: tr("Captain"),
          required: true,
          options: captainOptions,
        },
      ],
      submitLabel: tr("Save captain"),
      onSubmit: async (v) => {
        await saveCaptain(v.employeeId);
        notify(tr("Captain updated."));
      },
    });
  }
  function editLine() {
    const current = captain?.id ?? "";
    open({
      title: tr("Edit line"),
      description: tr(
        "Rename the line, change its captain or take it out of use.",
      ),
      fields: [
        {
          key: "name",
          label: tr("Line name"),
          value: unit!.name,
          required: true,
        },
        {
          key: "active",
          label: tr("Status"),
          value: String(unit!.active),
          options: [
            { value: "true", label: tr("In use") },
            { value: "false", label: tr("Not in use") },
          ],
        },
        {
          key: "captain",
          label: tr("Change captain"),
          value: current,
          options: [
            ...(current ? [] : [{ value: "", label: tr("No captain") }]),
            ...captainOptions,
          ],
        },
      ],
      submitLabel: tr("Save line"),
      onSubmit: async (v) => {
        if (
          v.name.trim() !== unit!.name ||
          (v.active === "true") !== unit!.active
        )
          await s.workspaceAct({
            type: "update_unit",
            id: unit!.id,
            name: v.name,
            code: unit!.code,
            active: v.active === "true",
          });
        if (v.captain && v.captain !== current) await saveCaptain(v.captain);
        notify(tr("Line saved."));
      },
    });
  }
  const staffCount = day.staff.filter((p) => !p.isCaptain).length;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="people-outline" size={16} color={c.muted} />
        <Text style={{ flex: 1, minWidth: 0, fontSize: 14, color: c.muted }}>
          {captain
            ? tr("Captain {{value0}}", { value0: captain.name })
            : tr("No captain")}
          {" · "}
          {tr("{{value0}} staff", { value0: staffCount })}
          {unit.active ? "" : tr(" · Not in use")}
        </Text>
        {!captain && (
          <TextButton label={tr("Set captain")} onPress={setCaptain} />
        )}
      </View>
      <Toolbar
        actions={[
          {
            label: tr("Open day setup"),
            icon: "cut-outline",
            primary: true,
            onPress: planDay,
          },
          {
            label: tr("Edit line"),
            icon: "settings-outline",
            onPress: editLine,
          },
        ]}
      />
      <FilterBar
        line={unit.id}
        lines={d.units.filter((u) => u.active || u.id === unit.id)}
        onLine={(id) => go?.("line", { line: id })}
        date={date}
        onDate={setDate}
        min={min}
        max={today}
        marked={lineActiveDates(rows, unit.id)}
      />
      {!isToday && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="time-outline" size={14} color={c.muted} />
          <Text style={{ fontSize: 13, color: c.muted }}>
            {tr("Showing a past day: {{value0}}", { value0: dateText })}
          </Text>
        </View>
      )}
      {!day.hasActivity && (
        <EmptyState
          icon="calendar-outline"
          title={tr("No recorded activity on {{value0}}", {
            value0: dateText,
          })}
          detail={tr(
            "Counts appear here once staff start tapping. Plan the day's styles and assign operations first.",
          )}
          actions={[
            { label: tr("Plan this day"), onPress: planDay },
            {
              label: tr("Add employees"),
              onPress: manageEmployees,
              secondary: true,
            },
          ]}
        />
      )}
      {day.hasActivity && (
        <Card
          style={{
            gap: 12,
            backgroundColor: isToday ? c.paper : c.soft,
            borderColor: isToday ? c.line : c.infoBorder,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ fontSize: 12, color: c.muted }}>
                {tr("Pieces done")}
              </Text>
              <Text style={big}>
                {day.pieces.toLocaleString(numberLocale())}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ fontSize: 12, color: c.muted }}>
                {tr("Labour cost")}
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={big}>
                {money(day.amountPaise)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Pill
              icon="checkmark-circle-outline"
              label={tr("{{value0}} of {{value1}} checked", {
                value0: day.checked,
                value1: day.total,
              })}
              tone={
                day.total > 0 && day.checked === day.total
                  ? "success"
                  : "warning"
              }
            />
            {!isToday && <Pill icon="time-outline" label={tr("History")} />}
          </View>
        </Card>
      )}
      <View style={{ gap: 8 }}>
        <Text style={heading}>{tr("Styles for the day")}</Text>
        {plannedStyles.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {plannedStyles.map((st) => (
              <Pill
                key={st.id}
                icon="shirt-outline"
                tone="info"
                label={`${st.code} · ${st.name}`}
              />
            ))}
          </View>
        ) : (
          <Card style={{ gap: 6 }}>
            <Text style={styles.muted}>
              {tr("No styles planned for this day.")}
            </Text>
            <TextButton label={tr("Plan this day")} onPress={planDay} />
          </Card>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <View style={styles.between}>
          <Text style={heading}>{tr("Staff")}</Text>
          <TextButton
            label={tr("Manage employees")}
            onPress={manageEmployees}
          />
        </View>
        {day.staff.length > 8 && (
          <Search
            value={search}
            onChange={setSearch}
            placeholder={tr("Search staff")}
          />
        )}
        {shown.map((p) => {
          const status = STATUS[p.status],
            online =
              !!seen && presenceState(seen.get(p.employee.id)) === "online";
          return (
            <Card key={p.employee.id} style={{ padding: 0 }}>
              <Tap
                accessibilityRole="button"
                accessibilityLabel={tr(
                  "{{value0}}, {{value1}} pieces, {{value2}}, {{value3}}. Open details.",
                  {
                    value0: p.employee.name,
                    value1: p.pieces,
                    value2: money(p.amountPaise),
                    value3: status.label(),
                  },
                )}
                onPress={() => setDetail(p.employee)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 14,
                  minHeight: 64,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {online && (
                      <View
                        accessibilityLabel={tr("Online now")}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          backgroundColor: c.success,
                        }}
                      />
                    )}
                    <Text
                      style={{ fontSize: 16, fontWeight: "600", color: c.ink }}
                    >
                      {p.employee.name}
                    </Text>
                    {p.isCaptain && <Pill label={tr("Captain")} tone="info" />}
                  </View>
                  <Text style={{ fontSize: 12, color: c.muted }}>
                    {p.employee.employeeId}
                    {p.status !== "not_started" &&
                      ` · ${p.pieces.toLocaleString(numberLocale())}${tr(" pieces")} · ${money(p.amountPaise)}`}
                  </Text>
                </View>
                {(!p.isCaptain || p.status !== "not_started") && (
                  <Pill label={status.label()} tone={status.tone} />
                )}
                <Icon name="chevron-forward" size={17} color={c.muted} />
              </Tap>
            </Card>
          );
        })}
        {!shown.length && (
          <Card>
            <Text style={styles.muted}>
              {day.staff.length
                ? tr("No one matches this search.")
                : tr("No staff on this line yet.")}
            </Text>
          </Card>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Text style={heading}>{tr("Recent days")}</Text>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {recent.map((r, i) => (
            <Tap
              key={r.date}
              accessibilityRole="button"
              accessibilityState={{ selected: r.date === date }}
              accessibilityLabel={tr(
                "{{value0}}, {{value1}} pieces, {{value2}}",
                {
                  value0: productionDate(r.date),
                  value1: r.pieces,
                  value2: money(r.amountPaise),
                },
              )}
              onPress={() => setDate(r.date)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                minHeight: 50,
                borderTopWidth: i ? 1 : 0,
                borderColor: c.line,
                backgroundColor: r.date === date ? c.soft : c.paper,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14,
                  fontWeight: r.date === date ? "700" : "500",
                  color: c.ink,
                }}
              >
                {productionDate(r.date)}
              </Text>
              <Text style={{ fontSize: 13, color: c.muted }}>
                {r.pieces.toLocaleString(numberLocale())}
                {tr(" pieces")}
              </Text>
              <Text
                style={{
                  minWidth: 72,
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: "600",
                  color: c.ink,
                }}
              >
                {money(r.amountPaise)}
              </Text>
            </Tap>
          ))}
        </Card>
      </View>
      {detail && (
        <EmployeeDetail employee={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
const heading = { fontSize: 18, fontWeight: "700", color: c.ink } as const;
const big = {
  fontSize: 24,
  fontWeight: "700",
  color: c.ink,
  fontVariant: ["tabular-nums"],
} as const;
