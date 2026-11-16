import { AdminLedger } from "./AdminLedger";
import { exportCsv } from "../lib/export";
import { operationCode } from "../domain/operations";
import { numberLocale, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Text } from "./Typography";
import { useDailyStore } from "../lib/daily-store";
import { moneyLabel } from "./terminology";
import { money, factoryDate, dateOffset } from "../domain/rules";
import {
  groupProduction,
  productionRows,
  productionDate,
  ALL_PRODUCTION,
  type ProductionFilters,
} from "../domain/production";
import { totals, type LedgerRow } from "../domain/workspace";
import { ProductionExtras } from "./ProductionExtras";
import { dayLabel } from "./Calendar";
import { FilterBar } from "./FilterBar";
import { Toolbar } from "./Toolbar";
import { EmptyState } from "./EmptyState";
import {
  ActionButton,
  Card,
  ChoiceField,
  Icon,
  Pill,
  Segments,
  Sheet,
  Tap,
  TextButton,
  c,
  type Tools,
} from "./kit";
export function ProductionTotals({
  summary,
  onMoney,
  onPieces,
  status,
}: {
  summary: ReturnType<typeof totals>;
  onMoney?: () => void;
  onPieces?: () => void;
  status?: string;
}) {
  useTranslation();
  const { width } = useWindowDimensions();
  const { actor } = useDailyStore();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}>
      {(
        [
          {
            label: tr("Pieces done"),
            value: summary.pieces.toLocaleString(numberLocale()),
            icon: "layers-outline",
            action: onPieces,
            money: false,
          },
          {
            label: moneyLabel(actor?.role ?? "worker"),
            value: money(summary.approved + summary.pending),
            icon: "wallet-outline",
            action: onMoney,
            money: true,
          },
        ] as const
      ).map((item) => (
        <View key={item.label} style={{ flex: 1, minWidth: 0 }}>
          <Card
            style={{
              padding: 14,
              flex: 1,
              backgroundColor: item.money ? c.infoLight : c.paper,
              borderColor: item.money ? c.infoBorder : c.line,
            }}
          >
            <Tap
              disabled={!item.action}
              accessibilityRole={item.action ? "button" : undefined}
              accessibilityLabel={tr("{{value0}}, {{value1}}", {
                value0: item.label,
                value1: item.value,
              })}
              onPress={item.action}
              style={{ gap: 10, flex: 1 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 36,
                }}
              >
                <Icon
                  name={item.icon}
                  size={16}
                  color={item.money ? c.primary : c.muted}
                />
                <Text
                  style={{
                    fontSize: 13,
                    color: item.money ? c.primary : c.muted,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {item.label}
                </Text>
                {item.action && (
                  <Icon name="chevron-forward" size={13} color={c.muted} />
                )}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{
                  fontSize: width < 400 ? 22 : 26,
                  lineHeight: 34,
                  fontWeight: "700",
                  color: c.ink,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {item.value}
              </Text>
              {item.money && (status || summary.pending > 0) && (
                <Pill
                  label={tr(
                    status ??
                      (summary.approved > 0
                        ? tr("Includes pending")
                        : tr("To approve")),
                  )}
                  tone={summary.pending > 0 ? "warning" : "success"}
                />
              )}
            </Tap>
          </Card>
        </View>
      ))}
    </View>
  );
}
/** Line selector plus a More filters button (captain, employee) for Production. */
export function LineFilterBar({
  value,
  onChange,
  date,
  onDate,
  min,
  max,
  range,
}: {
  value: ProductionFilters;
  onChange: (filters: ProductionFilters) => void;
  date?: string;
  onDate?: (date: string) => void;
  min?: string;
  max?: string;
  range?: string;
}) {
  useTranslation();
  const { data } = useDailyStore(),
    d = data!;
  const [open, setOpen] = useState(false);
  const more = [value.captain, value.employee].filter(
    (x) => x !== "all",
  ).length;
  return (
    <>
      <FilterBar
        line={value.line}
        lines={d.units}
        allLines
        onLine={(line) => onChange({ line, captain: "all", employee: "all" })}
        date={date}
        onDate={onDate}
        min={min}
        max={max}
        range={range}
        onMore={() => setOpen(true)}
        moreCount={more}
      />
      {open && (
        <Sheet
          title={tr("Filters")}
          onClose={() => setOpen(false)}
          footer={
            <>
              <ActionButton
                label={tr("Apply filters")}
                onPress={() => setOpen(false)}
              />
              <TextButton
                label={tr("Clear filters")}
                onPress={() => onChange(ALL_PRODUCTION)}
              />
            </>
          }
        >
          <ChoiceField
            label={tr("Line")}
            value={value.line}
            options={[
              { id: "all", label: tr("All lines") },
              ...d.units.map((u) => ({ id: u.id, label: u.name })),
            ]}
            onChange={(line) =>
              onChange({ line, captain: "all", employee: "all" })
            }
          />
          <ChoiceField
            label={tr("Captain")}
            value={value.captain}
            options={[
              { id: "all", label: tr("All captains") },
              ...d.employees
                .filter(
                  (e) =>
                    e.role === "captain" &&
                    e.active &&
                    (value.line === "all" || e.unitId === value.line),
                )
                .map((e) => ({ id: e.id, label: e.name })),
            ]}
            onChange={(captain) =>
              onChange({
                ...value,
                captain,
                line:
                  captain === "all"
                    ? value.line
                    : d.employees.find((e) => e.id === captain)!.unitId,
                employee: "all",
              })
            }
          />
          <ChoiceField
            label={tr("Employee")}
            value={value.employee}
            options={[
              { id: "all", label: tr("All employees") },
              ...d.employees
                .filter(
                  (e) =>
                    e.role === "worker" &&
                    (value.line === "all" || e.unitId === value.line),
                )
                .map((e) => ({ id: e.id, label: e.name })),
            ]}
            onChange={(employee) =>
              onChange({
                ...value,
                employee,
                line:
                  employee === "all"
                    ? value.line
                    : d.employees.find((e) => e.id === employee)!.unitId,
              })
            }
          />
        </Sheet>
      )}
    </>
  );
}
function TotalsLine({ rows }: { rows: LedgerRow[] }) {
  useTranslation();
  const total = totals(rows);
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 13, color: c.muted }}>
        {total.pieces.toLocaleString(numberLocale())}
        {tr("pieces")}
      </Text>
      <Text style={{ fontSize: 13, color: c.primary, fontWeight: "600" }}>
        {money(total.approved + total.pending)}
      </Text>
    </View>
  );
}
function EmployeeRows({ rows }: { rows: LedgerRow[] }) {
  useTranslation();
  const { data } = useDailyStore();
  const [visible, setVisible] = useState(20);
  const people = groupProduction(rows, (r) => r.employeeId).sort((a, b) =>
    (data!.employees.find((e) => e.id === a.id)?.name ?? "").localeCompare(
      data!.employees.find((e) => e.id === b.id)?.name ?? "",
    ),
  );
  return (
    <View style={{ gap: 8 }}>
      {people.slice(0, visible).map((person) => {
        const employee = data!.employees.find((e) => e.id === person.id);
        return (
          <View key={person.id} style={report.employee}>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.ink }}>
                {employee?.name ?? tr("Employee")}
              </Text>
              <TotalsLine rows={person.rows} />
              {person.pending > 0 && person.approved > 0 && (
                <Text style={{ fontSize: 12, color: c.muted }}>
                  {money(person.approved)}
                  {tr("approved \u00B7")}
                  {money(person.pending)}
                  {tr("to approve")}
                </Text>
              )}
            </View>
            <Pill
              label={person.pending > 0 ? tr("To approve") : tr("Approved")}
              tone={person.pending > 0 ? "warning" : "success"}
            />
          </View>
        );
      })}
      {people.length > visible && (
        <TextButton
          label={tr("More employees")}
          onPress={() => setVisible((n) => n + 20)}
        />
      )}
    </View>
  );
}
function DayOperations({ rows }: { rows: LedgerRow[] }) {
  useTranslation();
  const { data } = useDailyStore();
  const [task, setTask] = useState<string | null>(null);
  return (
    <View style={{ gap: 8 }}>
      {groupProduction(rows, (r) => r.operationId).map((group) => {
        const operation = data!.operations.find((o) => o.id === group.id),
          style = data!.styles.find((s) => s.id === operation?.styleId),
          expanded = task === group.id;
        return (
          <View key={group.id} style={report.task}>
            <Tap
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={tr("{{value0}}, show employees", {
                value0: operation?.name ?? tr("Operation"),
              })}
              onPress={() => setTask(expanded ? null : group.id)}
              style={report.row}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>
                  {operation
                    ? operationCode(operation) + " · " + operation.name
                    : tr("Operation")}
                </Text>
                {style && (
                  <Text style={{ fontSize: 12, color: c.muted }}>
                    {style.code}
                  </Text>
                )}
                <TotalsLine rows={group.rows} />
              </View>
              <Icon
                name={expanded ? "chevron-up" : "chevron-down"}
                size={17}
                color={c.muted}
              />
            </Tap>
            {expanded && (
              <View style={report.taskInset}>
                <Text style={report.groupLabel}>{tr("Employees")}</Text>
                <EmployeeRows rows={group.rows} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
export function ProductionView({
  go,
  open,
  notify,
  track,
  initialLine = "all",
  initialCaptain = "all",
  initialEmployee = "all",
  initialPeriod = "7",
  initialDate,
  initialMode = "production",
}: Tools & {
  initialLine?: string;
  initialCaptain?: string;
  initialEmployee?: string;
  initialPeriod?: string;
  initialDate?: string;
  initialMode?: "production" | "pay";
}) {
  useTranslation();
  const { data } = useDailyStore(),
    d = data!;
  const [period, setPeriod] = useState(
      ["1", "7", "30", "all"].includes(initialPeriod) ? initialPeriod : "7",
    ),
    [filters, setFilters] = useState<ProductionFilters>({
      ...ALL_PRODUCTION,
      line: initialLine,
      captain: initialCaptain,
      employee: initialEmployee,
    }),
    [day, setDay] = useState(
      initialDate &&
        initialDate >= dateOffset(-35, factoryDate()) &&
        initialDate <= factoryDate()
        ? initialDate
        : factoryDate(),
    );
  const [mode, setMode] = useState(initialMode);
  const today = factoryDate(),
    // One chosen day, or a range that ends today.
    rows = productionRows(d, period, filters, period === "1" ? day : today),
    summary = totals(rows);
  const lines = groupProduction(rows, (r) => r.unitId).sort((a, b) =>
    (d.units.find((u) => u.id === a.id)?.name ?? "").localeCompare(
      d.units.find((u) => u.id === b.id)?.name ?? "",
      undefined,
      { numeric: true },
    ),
  );
  const scope = {
    line: filters.line === "all" ? undefined : filters.line,
    captain: filters.captain === "all" ? undefined : filters.captain,
    employee: filters.employee === "all" ? undefined : filters.employee,
    period,
    date: period === "1" ? day : undefined,
  };
  const scopeKey = JSON.stringify(scope);
  // Tell the shell what is on screen so Back brings the same filters back.
  useEffect(() => {
    track?.(JSON.parse(scopeKey));
  }, [track, scopeKey]);
  return (
    <>
      <Segments
        value={period}
        onChange={(value) => {
          setPeriod(value);
        }}
        options={[
          { id: "1", label: tr("Day") },
          { id: "7", label: tr("7 days") },
          { id: "30", label: tr("30 days") },
          { id: "all", label: tr("All") },
        ]}
      />
      <LineFilterBar
        value={filters}
        onChange={setFilters}
        date={period === "1" ? day : undefined}
        onDate={setDay}
        min={dateOffset(-35, today)}
        max={today}
        range={
          period === "all"
            ? tr("All recorded days")
            : `${dayLabel(dateOffset(-(Number(period) - 1), today), today)} – ${dayLabel(today, today)}`
        }
      />
      <ProductionTotals
        summary={summary}
        onMoney={() => setMode("pay")}
        onPieces={() => setMode("production")}
      />
      <Segments
        value={mode}
        onChange={(v) => setMode(v as "production" | "pay")}
        options={[
          { id: "production", label: tr("Production") },
          { id: "pay", label: tr("Pay") },
        ]}
      />
      <Toolbar
        actions={[
          {
            label: tr("Assign operations"),
            icon: "person-add-outline",
            primary: true,
            onPress: () => go?.("tasks"),
          },
          ...(mode === "production" && lines.length > 0
            ? [
                {
                  label: tr("Operations breakdown"),
                  icon: "layers-outline" as const,
                  onPress: () => go?.("operations", scope),
                },
              ]
            : []),
          {
            label: tr("Batches & alerts"),
            icon: "notifications-outline",
            onPress: () => go?.("alerts", scope),
          },
          {
            label: tr("Export"),
            icon: "document-text-outline",
            onPress: () =>
              void exportCsv("crewgrain-production-pay", [
                [
                  "Employee",
                  "Line",
                  "Date",
                  "Style",
                  "Material",
                  "OP code",
                  "Operation",
                  "Pieces done",
                  "Approved INR",
                  "Pending INR",
                ].map((key) => tr(key)),
                ...rows.map((r) => {
                  const op = d.operations.find((o) => o.id === r.operationId)!;
                  const st = d.styles.find((st) => st.id === op.styleId);
                  return [
                    d.employees.find((e) => e.id === r.employeeId)?.name || "",
                    d.units.find((u) => u.id === r.unitId)?.name || "",
                    r.workDate,
                    st?.code || "",
                    d.assignments.find((a) => a.id === r.assignmentId)
                      ?.material || "",
                    operationCode(op),
                    op.name,
                    r.entered,
                    r.amountPaise / 100,
                    r.estimatePaise / 100,
                  ];
                }),
              ]),
          },
        ]}
      />
      {mode === "pay" && (
        <AdminLedger
          rows={rows}
          data={d}
          onOpen={(r) =>
            open({
              title:
                d.employees.find((e) => e.id === r.employeeId)?.name ||
                tr("Employee"),
              description: tr("{{value0}} · {{value1}} pieces · {{value2}}", {
                value0:
                  d.operations.find((o) => o.id === r.operationId)?.name || "",
                value1: r.entered,
                value2: money(r.amountPaise + r.estimatePaise),
              }),
              fields: [],
              submitLabel: tr("Done"),
              onSubmit: async () => {},
            })
          }
        />
      )}
      {mode === "production" && (
        <>
          <Text style={report.sectionTitle}>{tr("Lines")}</Text>
          {lines.length > 0 && (
            <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
              <View style={[report.tableRow, report.tableHead]}>
                <Text style={[report.th, { flex: 1 }]}>{tr("Line")}</Text>
                <Text style={[report.th, report.numCol]}>{tr("Pieces")}</Text>
                <Text
                  style={[report.th, report.amountCol, { textAlign: "right" }]}
                >
                  {tr("Amount")}
                </Text>
                <View style={{ width: 16 }} />
              </View>
              {lines.map((group, index) => {
                const unit = d.units.find((u) => u.id === group.id),
                  captain = d.employees.find(
                    (e) =>
                      e.role === "captain" && e.active && e.unitId === group.id,
                  );
                return (
                  <Tap
                    key={`${period}:${group.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={tr(
                      "{{value0}}, {{value1}} pieces, {{value2}}. Open line.",
                      {
                        value0: unit?.name ?? tr("Line"),
                        value1: group.pieces,
                        value2: money(group.approved + group.pending),
                      },
                    )}
                    onPress={() => go?.("line", { line: group.id })}
                    style={({ pressed }) => [
                      report.tableRow,
                      index > 0 && report.divider,
                      { backgroundColor: pressed ? c.soft : c.paper },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: c.ink,
                        }}
                      >
                        {unit?.name ?? tr("Line")}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 12, color: c.muted }}
                      >
                        {captain?.name ?? tr("No captain")}
                      </Text>
                    </View>
                    <Text style={[report.cell, report.numCol]}>
                      {group.pieces.toLocaleString(numberLocale())}
                    </Text>
                    <View style={report.amountCol}>
                      <Text style={[report.cell, { textAlign: "right" }]}>
                        {money(group.approved + group.pending)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          textAlign: "right",
                          color: group.pending > 0 ? c.warning : c.muted,
                        }}
                      >
                        {group.pending > 0 ? tr("Pending") : tr("Approved")}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={16} color={c.muted} />
                  </Tap>
                );
              })}
            </Card>
          )}
          {!lines.length && (
            <EmptyState
              icon="calendar-outline"
              title={
                period === "1"
                  ? tr("No recorded activity on {{value0}}", {
                      value0: productionDate(day),
                    })
                  : tr("No recorded activity in this period")
              }
              detail={tr(
                "Counts appear here once staff start tapping. Plan the day's styles and assign operations first.",
              )}
              actions={[
                {
                  label: tr("Plan this day"),
                  onPress: () =>
                    go?.("tasks", {
                      ...(filters.line !== "all" ? { line: filters.line } : {}),
                      date: period === "1" ? day : undefined,
                    }),
                },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}
type Scope = {
  line?: string;
  captain?: string;
  employee?: string;
  period?: string;
  date?: string;
};
/** The same rows Production was showing, rebuilt from the screen's filters. */
function scopedRows(
  d: NonNullable<ReturnType<typeof useDailyStore>["data"]>,
  scope: Scope,
) {
  const period = ["1", "7", "30", "all"].includes(scope.period ?? "")
      ? scope.period!
      : "7",
    today = factoryDate(),
    day =
      scope.date && scope.date >= dateOffset(-35, today) && scope.date <= today
        ? scope.date
        : today,
    filters: ProductionFilters = {
      line: scope.line ?? "all",
      captain: scope.captain ?? "all",
      employee: scope.employee ?? "all",
    };
  const range =
    period === "1"
      ? productionDate(day)
      : period === "all"
        ? tr("All recorded days")
        : `${dayLabel(dateOffset(-(Number(period) - 1), today), today)} – ${dayLabel(today, today)}`;
  return {
    filters,
    range,
    rows: productionRows(d, period, filters, period === "1" ? day : today),
  };
}
function ScopeNote({
  filters,
  range,
}: {
  filters: ProductionFilters;
  range: string;
}) {
  const { data } = useDailyStore();
  const line = data!.units.find((u) => u.id === filters.line)?.name;
  return (
    <Text style={{ fontSize: 13, color: c.muted }}>
      {line ? `${line} · ${range}` : `${tr("All lines")} · ${range}`}
    </Text>
  );
}
/** Full screen: each operation with its employees, for the chosen filters. */
export function OperationsBreakdown(props: Tools & Scope) {
  useTranslation();
  const { data } = useDailyStore();
  const { rows, filters, range } = scopedRows(data!, props);
  return (
    <>
      <ScopeNote filters={filters} range={range} />
      {rows.length ? (
        <DayOperations rows={rows} />
      ) : (
        <EmptyState
          icon="layers-outline"
          title={tr("No recorded activity in this period")}
          detail={tr("Counts appear here once staff start tapping.")}
        />
      )}
    </>
  );
}
/** Full screen: batches and alerts for the chosen line. */
export function BatchesAlerts(props: Tools & Scope) {
  useTranslation();
  const { data } = useDailyStore();
  const { rows, filters, range } = scopedRows(data!, props);
  return (
    <>
      <ScopeNote filters={filters} range={range} />
      <ProductionExtras
        rows={rows}
        unit={filters.line}
        open={props.open}
        notify={props.notify}
        go={props.go}
      />
    </>
  );
}
const report = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  groupLabel: { fontSize: 12, fontWeight: "600", color: c.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    minHeight: 60,
  },
  lineIcon: {
    width: 36,
    height: 36,
    backgroundColor: c.infoLight,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
  },
  divider: { borderTopWidth: 1, borderTopColor: c.line },
  tableHead: {
    minHeight: 36,
    paddingVertical: 8,
    backgroundColor: c.canvas,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  th: { fontSize: 12, fontWeight: "600", color: c.muted },
  cell: {
    fontSize: 14,
    fontWeight: "600",
    color: c.ink,
    fontVariant: ["tabular-nums"],
  },
  numCol: { width: 64, textAlign: "right" },
  amountCol: { width: 92, alignItems: "flex-end" },
  task: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    backgroundColor: c.paper,
    overflow: "hidden",
  },
  taskInset: { padding: 10, paddingTop: 0, gap: 8 },
  employee: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: c.line,
  },
});
