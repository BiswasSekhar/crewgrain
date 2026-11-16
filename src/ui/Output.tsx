import { numberLocale, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { Text, TextInput } from "./Typography";
import React, { useState } from "react";
import { View } from "react-native";
import { cachedLedger, useDailyStore } from "../lib/daily-store";
import { CAPTAIN_REPORTS_ENABLED } from "../lib/features";
import {
  dateOffset,
  factoryDate,
  money,
  compactMoney,
  integer,
} from "../domain/rules";
import { recentWorkDays, totals } from "../domain/workspace";
import type { Employee } from "../domain/types";
import { FilterBar } from "./FilterBar";
import {
  ActionButton,
  Card,
  Metric,
  Pill,
  SectionTitle,
  Segments,
  Sheet,
  Tap as Pressable,
  Tools,
  TrendChart,
  c,
  styles,
} from "./kit";
const PERIODS = () => [
  { id: "day", label: tr("Today") },
  { id: "week", label: tr("7 days") },
  { id: "month", label: tr("30 days") },
];
const ISSUES = () => [
  tr("Machine problem"),
  tr("Material short"),
  tr("Power cut"),
  tr("Staff absent"),
  tr("Quality issue"),
];
/** Captain's line totals (pieces and money) plus a tap-only daily summary. */
export function Output({ open, notify }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    a = s.actor!,
    unit = d.units.find((u) => u.id === a.unitId),
    today = factoryDate(),
    [period, setPeriod] = useState("week"),
    [issues, setIssues] = useState<string[]>(() =>
      (
        d.reports.find((r) => r.unitId === a.unitId && r.workDate === today)
          ?.blockers ?? ""
      )
        .split(", ")
        .filter(Boolean),
    ),
    [detail, setDetail] = useState<Employee | null>(null);
  if (!unit) return null;
  const start =
    period === "day" ? today : dateOffset(period === "week" ? -6 : -29, today);
  const all = cachedLedger(d).filter((r) => r.unitId === unit.id);
  const rows = all.filter((r) => r.workDate >= start && r.workDate <= today);
  const pieces = totals(rows).pieces;
  const moneyIn = (from: string, to: string) =>
    d.teamMoney
      ? d.teamMoney
          .filter((r) => r.workDate >= from && r.workDate <= to)
          .reduce((n, r) => n + r.amountPaise, 0)
      : (() => {
          const t = totals(
            all.filter((r) => r.workDate >= from && r.workDate <= to),
          );
          return t.approved + t.pending;
        })();
  const value = moneyIn(start, today);
  const days = recentWorkDays(today);
  const people = d.employees
    .filter((e) => e.role === "worker" && e.active && e.unitId === unit.id)
    .map((e) => ({
      e,
      pieces: totals(rows.filter((r) => r.employeeId === e.id)).pieces,
    }))
    .sort((x, y) => y.pieces - x.pieces);
  const report = d.reports.find(
    (r) => r.unitId === unit.id && r.workDate === today,
  );
  const dayChecks = (d.days ?? []).filter(
    (x) => x.workDate === today && people.some((p) => p.e.id === x.employeeId),
  );
  function send() {
    open({
      title: tr("Daily report"),
      description: tr("{{value0}} of {{value1}} present", {
        value0: dayChecks.filter((x) => x.attendance === "present").length,
        value1: people.length,
      }),
      fields: [
        {
          key: "completed",
          label: tr("Finished garments"),
          numeric: true,
          required: true,
          value: report ? String(report.completed) : "",
        },
        {
          key: "packed",
          label: tr("Packed garments"),
          numeric: true,
          required: true,
          value: report ? String(report.packed) : "0",
        },
        {
          key: "notes",
          label: tr("Notes (optional)"),
          multiline: true,
          value: report?.notes ?? "",
        },
      ],
      submitLabel: tr("Send to admin"),
      onSubmit: async (values) => {
        await s.act({
          type: "submit_report",
          workDate: today,
          unitId: unit!.id,
          completed: integer(values.completed, 0, 1000000, "Finished garments"),
          packed: integer(values.packed, 0, 1000000, "Packed garments"),
          scheduled: people.length,
          present: dayChecks.filter((x) => x.attendance === "present").length,
          blockers: issues.join(", "),
          notes: values.notes,
        });
        notify(tr("Report sent to admin."));
      },
    });
  }
  return (
    <>
      <FilterBar staticLine={unit.name} />
      <Segments value={period} options={PERIODS()} onChange={setPeriod} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Metric
          label={tr("Pieces")}
          value={pieces.toLocaleString(numberLocale())}
          icon="layers-outline"
        />
        <Metric
          label={tr("Line pay")}
          value={money(value)}
          icon="wallet-outline"
        />
      </View>
      <TrendChart
        title={tr("Last 7 days")}
        pieces={{
          label: tr("Pieces"),
          format: (v) => String(Math.round(v)),
          points: days.map((x) => ({
            label: x.label,
            value: totals(all.filter((r) => r.workDate === x.workDate)).pieces,
          })),
        }}
        money={{
          label: tr("Money"),
          format: (v) => compactMoney(v),
          points: days.map((x) => ({
            label: x.label,
            value: moneyIn(x.workDate, x.workDate),
          })),
        }}
      />
      <SectionTitle title={tr("Pieces by employee")} />
      <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        {people.map(({ e, pieces: n }, i) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityLabel={tr("{{value0}} details", { value0: e.name })}
            onPress={() => setDetail(e)}
            style={[
              styles.between,
              {
                padding: 16,
                borderTopWidth: i ? 1 : 0,
                borderColor: c.line,
              },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>
                {e.name}
              </Text>
              <Text style={styles.muted}>{e.employeeId}</Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: c.ink }}>
              {n.toLocaleString(numberLocale())}
            </Text>
          </Pressable>
        ))}
        {people.length === 0 && (
          <Text style={[styles.muted, { padding: 16 }]}>
            {tr("No employees yet.")}
          </Text>
        )}
      </Card>
      {CAPTAIN_REPORTS_ENABLED && (
        <>
          <SectionTitle
            title={tr("Daily report")}
            right={
              report ? (
                <Pill
                  label={
                    report.status === "reviewed" ? tr("Reviewed") : tr("Sent")
                  }
                  tone={report.status === "reviewed" ? "neutral" : "info"}
                />
              ) : undefined
            }
          />
          <Card>
            <Text style={styles.muted}>
              {dayChecks.filter((x) => x.attendance === "present").length}/
              {people.length}
              {tr("present \u00B7 Blockers (optional)")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ISSUES().map((name) => {
                const on = issues.includes(name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setIssues(
                        on
                          ? issues.filter((x) => x !== name)
                          : [...issues, name],
                      )
                    }
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 14,
                      justifyContent: "center",
                      borderRadius: 22,
                      borderWidth: 1.5,
                      borderColor: on ? c.primary : c.line,
                      backgroundColor: on ? c.soft : c.paper,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: on ? "700" : "500",
                        color: on ? c.primary : c.ink,
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <ActionButton
              label={
                report
                  ? tr("Update report")
                  : tr("Add finished & packed counts")
              }
              disabled={report?.status === "reviewed"}
              onPress={send}
            />
          </Card>
        </>
      )}
      {detail && (
        <EmployeeDetail employee={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
const DETAIL_PERIODS = () => [
  { id: "day", label: tr("Today") },
  { id: "week", label: tr("7 days") },
  { id: "month", label: tr("30 days") },
  { id: "all", label: tr("All") },
];
/** One employee: tasks done and, for admin, the amount, by day, week, month or all. */
export function EmployeeDetail({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    admin = s.actor?.role === "admin",
    today = factoryDate(),
    [period, setPeriod] = useState("week");
  const start =
    period === "day"
      ? today
      : period === "week"
        ? dateOffset(-6, today)
        : period === "month"
          ? dateOffset(-29, today)
          : "0000-00-00";
  const rows = cachedLedger(d).filter(
    (r) =>
      r.employeeId === employee.id &&
      r.workDate >= start &&
      r.workDate <= today &&
      !["void", "rejected"].includes(r.status),
  );
  const value = (list: typeof rows) => {
    const t = totals(list);
    return t.approved + t.pending;
  };
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
    return [...map.entries()];
  };
  const byTask = group((r) => r.operationId).sort(
    (a, b) => totals(b[1]).pieces - totals(a[1]).pieces,
  );
  const byDay = group((r) => r.workDate).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  const taskName = (operationId: string, list: typeof rows) => {
    const op = d.operations.find((o) => o.id === operationId);
    const styleId = d.lots.find((l) => l.id === list[0]?.lotId)?.styleId;
    const code = d.styles.find((x) => x.id === styleId)?.code;
    return `${op?.name ?? tr("Operation")}${code ? ` · ${code}` : ""}`;
  };
  const row = (label: string, list: typeof rows) => (
    <View
      key={label}
      style={[
        styles.between,
        { paddingVertical: 10, borderTopWidth: 1, borderColor: c.line },
      ]}
    >
      <Text style={{ flex: 1, fontSize: 14, color: c.ink }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "700", color: c.ink }}>
        {totals(list).pieces.toLocaleString(numberLocale())}
        {tr("pcs")}
      </Text>
      {admin && (
        <Text
          style={{
            width: 84,
            textAlign: "right",
            fontSize: 14,
            color: c.muted,
          }}
        >
          {money(value(list))}
        </Text>
      )}
    </View>
  );
  return (
    <Sheet title={employee.name} onClose={onClose}>
      <Text style={styles.muted}>
        {employee.employeeId} ·{" "}
        {d.units.find((u) => u.id === employee.unitId)?.name ?? ""}
      </Text>
      <Segments
        value={period}
        options={DETAIL_PERIODS()}
        onChange={setPeriod}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Metric
          label={tr("Pieces done")}
          value={totals(rows).pieces.toLocaleString(numberLocale())}
          icon="layers-outline"
        />
        {admin && (
          <Metric
            label={tr("Amount")}
            value={money(value(rows))}
            icon="wallet-outline"
          />
        )}
      </View>
      {!admin && (
        <Text style={styles.muted}>
          {tr("Amounts are visible to the admin only.")}
        </Text>
      )}
      <SectionTitle title={tr("By operation")} />
      <View>
        {byTask.length === 0 && (
          <Text style={styles.muted}>
            {tr("No operations logged in this period.")}
          </Text>
        )}
        {byTask.map(([id, list]) => row(taskName(id, list), list))}
      </View>
      {period !== "day" && byDay.length > 0 && (
        <>
          <SectionTitle title={tr("By day")} />
          <View>{byDay.map(([day, list]) => row(day, list))}</View>
        </>
      )}
      {admin && !s.demo && (
        <CountFixer
          rows={rows.filter(
            (r) => r.source === "daily" && r.status === "approved",
          )}
          label={(r) => `${r.workDate} · ${taskName(r.operationId, [r])}`}
          employeeId={employee.id}
        />
      )}
    </Sheet>
  );
}
/** Admin only: change the count of one approved task. The worker's own count and
 *  the approval stay as they were; an adjustment with a reason is added. */
function CountFixer({
  rows,
  label,
  employeeId,
}: {
  rows: ReturnType<typeof cachedLedger>;
  label: (r: ReturnType<typeof cachedLedger>[number]) => string;
  employeeId: string;
}) {
  useTranslation();
  const s = useDailyStore(),
    [openId, setOpenId] = useState<string | null>(null),
    [count, setCount] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState("");
  if (!rows.length) return null;
  const save = async (r: (typeof rows)[number]) => {
    setMessage("");
    try {
      const quantity = integer(Number(count), 0, 20000, "Count");
      if (!reason.trim()) throw new Error(tr("Enter a reason."));
      await s.adminAdjustCount({
        employeeId,
        assignmentId: r.assignmentId!,
        workDate: r.workDate,
        quantity,
        reason: reason.trim(),
      });
      setOpenId(null);
      setCount("");
      setReason("");
      setMessage(tr("Count corrected."));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : tr("Could not save."));
    }
  };
  return (
    <>
      <SectionTitle title={tr("Fix an approved count")} />
      <Text style={styles.muted}>
        {tr("Adds a correction with a reason. The original count is kept.")}
      </Text>
      {rows.slice(0, 20).map((r) => (
        <View
          key={r.id}
          style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}
        >
          <View style={styles.between}>
            <Text style={{ flex: 1, fontSize: 14, color: c.ink }}>
              {label(r)}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: c.ink }}>
              {r.payable.toLocaleString(numberLocale())}
              {tr("pcs")}
            </Text>
          </View>
          {openId === r.id ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput
                accessibilityLabel={tr("Correct count")}
                placeholder={tr("Correct count")}
                keyboardType="number-pad"
                value={count}
                onChangeText={setCount}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel={tr("Reason")}
                placeholder={tr("Reason")}
                value={reason}
                onChangeText={setReason}
                style={styles.input}
              />
              <ActionButton
                label={tr("Save correction")}
                disabled={s.busy}
                onPress={() => void save(r)}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Fix count")}
              onPress={() => {
                setOpenId(r.id);
                setCount(String(r.payable));
                setReason("");
                setMessage("");
              }}
            >
              <Text style={{ fontSize: 13, color: c.primary, marginTop: 4 }}>
                {tr("Fix count")}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
      {!!message && <Text style={styles.muted}>{message}</Text>}
    </>
  );
}
