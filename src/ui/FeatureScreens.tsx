import { formatDateTime, tr, formatDate } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import React, { useState } from "react";
import { EmployeeDetail } from "./Output";
import { CAPTAIN_REPORTS_ENABLED } from "../lib/features";
import { View, Linking, Platform, useWindowDimensions } from "react-native";
import { cachedLedger, useDailyStore } from "../lib/daily-store";
import {
  nextEmployeeId,
  factoryDate,
  dateOffset,
  money,
} from "../domain/rules";
import { dayFor, operationsFor } from "../domain/daily";
import { totals, LedgerRow } from "../domain/workspace";
import { exportCsv } from "../lib/export";
import {
  ChoiceField,
  ADMIN_DESKTOP_BREAKPOINT,
  c,
  styles,
  Card,
  Pill,
  SectionTitle,
  Metric,
  MenuRow,
  Empty,
  Segments,
  Search,
  TextButton,
  ActionButton,
  Tools,
  IconName,
  Icon,
  Tap as Pressable,
} from "./kit";
import { AssignOperations, ReviewDay } from "./Workflows";
import { AdminLedger } from "./AdminLedger";
import type { Employee } from "../domain/types";
const actionLabels: Record<string, string> = {
  worker: "Employee",
  captain: "Captain",
  admin: "Admin",
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  void: "Removed",
  record_production: "Pieces done",
  update_employee: "Employee updated",
  add_employee: "Employee added",
  request_employee: "Employee requested",
  review_request: "Employee request reviewed",
  captain_review: "Counts reviewed",
  admin_review: "Counts reviewed",
  edit_entry: "Count corrected",
  set_rate: "Operation rate updated",
  create_style: "Style added",
  create_operation: "Operation added",
  create_lot: "Batch added",
  assign: "Operation assigned",
  assign_task: "Operation assigned",
  approve_day: "Day approved",
  admin_decide_day: "Day reviewed",
  create_unit: "Line added",
  create_line: "Line added",
  resolve_flag: "Problem resolved",
  phone_setup_issued: "Phone link created",
  phone_linked: "Phone linked",
  staff_signed_in: "Employee logged in",
  revoke_phone: "Phone access removed",
  bootstrap_admin: "Admin added",
  deactivate_employee: "Employee deactivated",
  restore_employee: "Employee restored",
  save_style: "Style saved",
  set_style_pricing: "Style rate updated",
  set_task_pricing: "Operation rate updated",
  request_correction: "Correction requested",
  review_correction: "Correction reviewed",
  remove_line: "Line removed",
  set_day_plan: "Daily styles saved",
};
const label = (value: string) =>
  tr(actionLabels[value] ?? (value.includes("_") ? tr("Updated") : value));
const periods = () => [
  { id: "7", label: tr("7 days") },
  { id: "30", label: tr("30 days") },
  { id: "all", label: tr("All time") },
];
const workPeriods = () => [
  { id: "week", label: tr("This week") },
  { id: "month", label: tr("This month") },
  { id: "all", label: tr("All days") },
];
function startOfWorkPeriod(period: string, today = factoryDate()) {
  if (period === "all") return "0000-01-01";
  const [year, month, day] = today.split("-").map(Number);
  if (period === "month") return `${year}-${String(month).padStart(2, "0")}-01`;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dateOffset(-(weekday === 0 ? 6 : weekday - 1), today);
}
function within(date: string, period: string) {
  return period === "all" || date >= dateOffset(-(Number(period) - 1));
}
function exportLedger(
  rows: LedgerRow[],
  d: ReturnType<typeof useDailyStore>["data"],
) {
  return exportCsv(`crewgrain-statement-${factoryDate()}`, [
    [
      "Employee",
      "Date",
      "Operation",
      "Batch",
      "Entered",
      "Captain",
      "Payable",
      "Rate INR",
      "Approved INR",
      "Pending INR",
      "Status",
      "Adjustment pieces",
    ],
    ...rows.map((r) => [
      d?.employees.find((e) => e.id === r.employeeId)?.name ?? "",
      r.workDate,
      d?.operations.find((o) => o.id === r.operationId)?.name ?? "",
      d?.lots.find((l) => l.id === r.lotId)?.code ?? "",
      r.entered,
      r.checked ?? "",
      r.payable,
      r.ratePaise / 100,
      r.amountPaise / 100,
      r.estimatePaise / 100,
      r.status,
      r.adjustment,
    ]),
  ]);
}
export { AdminOverview as Overview } from "./AdminOverview";
export function History({
  open,
  notify,
  earnings = false,
  payroll = false,
}: Tools & {
  earnings?: boolean;
  payroll?: boolean;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    a = s.actor!,
    [period, setPeriod] = useState("7"),
    [unit, setUnit] = useState("all"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(30);
  const rows = cachedLedger(d).filter(
      (r) =>
        within(r.workDate, period) &&
        (unit === "all" || r.unitId === unit) &&
        `${d.employees.find((e) => e.id === r.employeeId)?.name} ${d.operations.find((o) => o.id === r.operationId)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    sum = totals(rows);
  const { width: viewportWidth } = useWindowDimensions();
  const wide =
    Platform.OS === "web" && viewportWidth >= ADMIN_DESKTOP_BREAKPOINT;
  function detail(r: LedgerRow) {
    const task =
      d.operations.find((o) => o.id === r.operationId)?.name ?? tr("Operation");
    const approved = r.status === "approved";
    const count =
      r.checked !== undefined && r.checked !== r.entered
        ? tr("Employee {{value0}} · Captain {{value1}}", {
            value0: r.entered,
            value1: r.checked,
          })
        : tr("{{value0}} pieces", { value0: approved ? r.payable : r.entered });
    const status =
      r.status === "pending"
        ? tr("Waiting for captain")
        : r.status === "needs_admin"
          ? tr("Admin review")
          : label(r.status);
    open({
      title: task,
      description: tr(
        "{{value0}} \u00B7 {{value1}} \u00B7 {{value2}} per piece \u00B7 {{value3}} {{value4}} \u00B7 {{value5}}{{value6}}",
        {
          value0: r.workDate,
          value1: count,
          value2: money(r.ratePaise),
          value3: money(approved ? r.amountPaise : r.estimatePaise),
          value4: approved ? tr("approved") : tr("estimated"),
          value5: status,
          value6: r.adjustment
            ? tr(" \u00B7 Admin adjustment {{value0}} pieces", {
                value0: r.adjustment,
              })
            : "",
        },
      ),
      fields:
        a.role === "worker" && r.source === "daily" && r.status === "approved"
          ? [
              {
                key: "quantity",
                label: tr("Correct count"),
                numeric: true,
                value: String(r.payable),
                required: true,
              },
              {
                key: "reason",
                label: tr("Why should this change?"),
                required: true,
                multiline: true,
              },
            ]
          : [],
      submitLabel:
        a.role === "worker" && r.source === "daily" && r.status === "approved"
          ? tr("Request correction")
          : tr("Done"),
      onSubmit: async (v) => {
        if (v.quantity !== undefined && r.assignmentId) {
          await s.workspaceAct({
            type: "request_correction",
            assignmentId: r.assignmentId,
            workDate: r.workDate,
            quantity: Number(v.quantity),
            reason: v.reason,
          });
          notify(
            tr("Correction sent to admin. Your approved record is preserved."),
          );
        }
      },
    });
  }
  return (
    <>
      {(earnings || payroll) && (
        <View style={[styles.row, { alignItems: "stretch", gap: 12 }]}>
          <Metric
            label={tr("Approved pay")}
            value={money(sum.approved)}
            icon="wallet-outline"
          />
          <Metric
            label={tr("Pending approval")}
            value={money(sum.pending)}
            icon="time-outline"
          />
        </View>
      )}
      <View style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: wide && payroll ? "row" : "column",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <View style={{ width: wide && payroll ? 320 : "100%" }}>
            <Segments value={period} options={periods()} onChange={setPeriod} />
          </View>
          {payroll && (
            <View style={{ width: wide ? 220 : "100%" }}>
              <ChoiceField
                label={tr("Filter by line")}
                value={unit}
                options={[
                  { id: "all", label: tr("All lines") },
                  ...d.units.map((u) => ({ id: u.id, label: u.name })),
                ]}
                onChange={setUnit}
              />
            </View>
          )}
          {payroll && (
            <View style={{ flex: wide ? 1 : undefined }}>
              <Search
                value={query}
                onChange={setQuery}
                placeholder={tr("Find employee or operation")}
              />
            </View>
          )}
        </View>
      </View>
      <SectionTitle
        title={
          payroll
            ? tr("Employees")
            : earnings
              ? tr("Pay")
              : tr("Your operation history")
        }
        right={
          <TextButton
            label={tr("Export CSV")}
            onPress={() =>
              void exportLedger(rows, d).catch((e) => notify(e.message))
            }
          />
        }
      />
      {!rows.length && (
        <Empty
          title={tr("No operations logged in this period")}
          detail={tr("Try another date range.")}
          icon="calendar-outline"
        />
      )}
      {payroll ? (
        <AdminLedger rows={rows} data={d} onOpen={detail} />
      ) : (
        rows.slice(0, limit).map((r) => (
          <Card key={r.id}>
            <View style={styles.between}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {d.operations.find((o) => o.id === r.operationId)?.name}
                </Text>
                <Text style={styles.muted}>
                  {payroll
                    ? `${d.employees.find((e) => e.id === r.employeeId)?.name} · `
                    : ""}
                  {r.workDate} · {d.lots.find((l) => l.id === r.lotId)?.code}
                </Text>
              </View>
              <Pill
                label={label(r.status)}
                tone={r.status === "approved" ? "neutral" : "warning"}
              />
            </View>
            <View style={styles.between}>
              <Text style={{ fontSize: 25, color: c.ink, fontWeight: "600" }}>
                {r.status === "approved" ? r.payable : r.entered}
                <Text style={{ fontSize: 12, fontWeight: "400" }}>
                  {tr("pieces")}
                </Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr(
                  "Open operation details for {{value0}}",
                  {
                    value0: money(
                      r.status === "approved" ? r.amountPaise : r.estimatePaise,
                    ),
                  },
                )}
                onPress={() => detail(r)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {money(
                    r.status === "approved" ? r.amountPaise : r.estimatePaise,
                  )}
                </Text>
                <Icon name="chevron-forward" size={17} color={c.muted} />
              </Pressable>
            </View>
            <View style={styles.between}>
              <Text style={styles.muted}>
                {money(r.ratePaise)} / piece
                {r.adjustment ? tr(" \u00B7 Adjusted by admin") : ""}
              </Text>
            </View>
            {r.checked !== undefined && r.checked !== r.entered && (
              <Text style={{ color: c.danger, fontSize: 12 }}>
                {tr("Employee")}
                {r.entered}
                {tr("\u2192 Captain")}
                {r.checked}
              </Text>
            )}
          </Card>
        ))
      )}
      {!payroll && rows.length > limit && (
        <TextButton
          label={tr("Show more")}
          onPress={() => setLimit((n) => n + 30)}
        />
      )}
      {(d.corrections ?? []).filter(
        (r) =>
          within(r.workDate, period) &&
          rows.some((row) => row.employeeId === r.employeeId),
      ).length > 0 && (
        <>
          <SectionTitle title={tr("Correction requests")} />
          {d.corrections
            ?.filter(
              (r) =>
                within(r.workDate, period) &&
                rows.some((row) => row.employeeId === r.employeeId),
            )
            .map((r) => (
              <Card key={r.id}>
                <View style={styles.between}>
                  <Text style={styles.body}>
                    {r.workDate} · {r.originalQuantity} → {r.requestedQuantity}
                  </Text>
                  <Pill
                    label={tr(r.status)}
                    tone={r.status === "pending" ? "warning" : "neutral"}
                  />
                </View>
                <Text style={styles.muted}>{r.reason}</Text>
                {!!r.reviewNote && (
                  <Text style={styles.muted}>
                    {tr("Admin:")}
                    {r.reviewNote}
                  </Text>
                )}
              </Card>
            ))}
        </>
      )}
      {(earnings || payroll) && (
        <Text style={styles.muted}>
          {tr(
            "Pay uses the rate saved with each operation. Payments aren’t recorded here.",
          )}
        </Text>
      )}
    </>
  );
}
export function MyWork({ open, notify }: Tools) {
  useTranslation();
  const store = useDailyStore(),
    d = store.data!,
    actor = store.actor!,
    [period, setPeriod] = useState("week"),
    [expandedDay, setExpandedDay] = useState<string | null>(null);
  const today = factoryDate(),
    rows = cachedLedger(d).filter(
      (row) => row.workDate >= startOfWorkPeriod(period, today),
    ),
    summary = totals(rows),
    dates = [...new Set(rows.map((row) => row.workDate))].sort((a, b) =>
      b.localeCompare(a),
    );
  function fixCount(row: LedgerRow) {
    open({
      title: tr("Fix this count"),
      fields: [
        {
          key: "quantity",
          label: tr("Correct count"),
          value: String(row.payable),
          numeric: true,
          required: true,
        },
        { key: "reason", label: tr("What was missed?"), required: true },
      ],
      submitLabel: tr("Send to admin"),
      onSubmit: async (values) => {
        if (!row.assignmentId) return;
        await store.workspaceAct({
          type: "request_correction",
          assignmentId: row.assignmentId,
          workDate: row.workDate,
          quantity: Number(values.quantity),
          reason: values.reason,
        });
        notify(tr("Sent to admin."));
      },
    });
  }
  return (
    <>
      <Segments
        value={period}
        options={workPeriods()}
        onChange={(value) => {
          setPeriod(value);
          setExpandedDay(null);
        }}
      />
      <View style={[styles.card, { gap: 5 }]}>
        <Text style={styles.muted}>
          {tr("Approved")}{" "}
          {period === "week"
            ? tr("this week")
            : period === "month"
              ? tr("this month")
              : tr("total")}
        </Text>
        <Text style={{ color: c.ink, fontSize: 28, fontWeight: "600" }}>
          {money(summary.approved)}
        </Text>
        {summary.pending > 0 && (
          <Text style={styles.muted}>
            {money(summary.pending)}
            {tr("waiting for approval")}
          </Text>
        )}
      </View>
      {dates.length === 0 && (
        <Empty
          title={
            period === "week"
              ? tr("No operations logged this week")
              : period === "month"
                ? tr("No operations logged this month")
                : tr("No operations logged yet")
          }
          icon="time-outline"
        />
      )}
      {dates.map((date) => {
        const dayRows = rows.filter((row) => row.workDate === date),
          dayPay = totals(dayRows),
          needsAdmin = dayRows.some((row) => row.status === "needs_admin"),
          waiting =
            !needsAdmin && dayRows.some((row) => row.status === "pending"),
          rejected = dayRows.every((row) =>
            ["rejected", "void"].includes(row.status),
          ),
          isOpen = expandedDay === date,
          requests = (d.corrections ?? []).filter(
            (request) =>
              request.employeeId === actor.id && request.workDate === date,
          );
        const dateLabel = formatDate(new Date(`${date}T12:00:00Z`), {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        return (
          <View key={date} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr(
                "{{value0}}, {{value1}} {{value2}}, {{value3}}. Open to see operation counts.",
                {
                  value0: dateLabel,
                  value1: dayRows.length,
                  value2:
                    dayRows.length === 1 ? tr("operation") : tr("operations"),
                  value3: money(dayPay.approved + dayPay.pending),
                },
              )}
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setExpandedDay(isOpen ? null : date)}
              style={({ pressed }) => [
                styles.between,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: c.ink }}>
                  {dateLabel}
                </Text>
                <Text style={styles.muted}>
                  {dayRows.length}{" "}
                  {dayRows.length === 1 ? tr("operation") : tr("operations")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: 19, fontWeight: "600", color: c.ink }}>
                  {money(dayPay.approved + dayPay.pending)}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: needsAdmin || waiting ? c.warning : c.muted,
                  }}
                >
                  {needsAdmin
                    ? tr("Admin checking")
                    : waiting
                      ? tr("Captain checking")
                      : rejected
                        ? tr("Not approved")
                        : tr("Approved")}
                </Text>
              </View>
              <Icon
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={19}
                color={c.muted}
              />
            </Pressable>
            {isOpen && (
              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingTop: 8,
                  gap: 3,
                }}
              >
                {dayRows.map((row) => {
                  const operation = d.operations.find(
                      (item) => item.id === row.operationId,
                    ),
                    lot = d.lots.find((item) => item.id === row.lotId),
                    count =
                      row.status === "approved" ? row.payable : row.entered,
                    taskRequests = requests.filter(
                      (request) => request.assignmentId === row.assignmentId,
                    );
                  return (
                    <View key={row.id} style={{ paddingVertical: 10, gap: 5 }}>
                      <View style={styles.between}>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            fontWeight: "500",
                            color: c.ink,
                          }}
                        >
                          {operation?.name ?? tr("Operation")}
                          {dayRows.some((item) => item.lotId !== row.lotId)
                            ? ` · ${lot?.code ?? ""}`
                            : ""}
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: c.ink,
                          }}
                        >
                          {money(row.amountPaise || row.estimatePaise)}
                        </Text>
                      </View>
                      <Text style={styles.muted}>
                        {count}
                        {tr("pieces \u00D7")}
                        {money(row.ratePaise)}
                        {tr("each")}
                      </Text>
                      {row.checked !== undefined &&
                        row.checked !== row.entered && (
                          <Text style={[styles.muted, { color: c.warning }]}>
                            {tr("You entered")}
                            {row.entered}. Captain checked {row.checked}.
                          </Text>
                        )}
                      {taskRequests.map((request) => (
                        <Text key={request.id} style={styles.muted}>
                          {tr("Count fix")}
                          {tr(request.status)}: {request.reason}
                          {request.reviewNote ? ` · ${request.reviewNote}` : ""}
                        </Text>
                      ))}
                      {row.assignmentId &&
                        row.source === "daily" &&
                        row.status === "approved" &&
                        !taskRequests.some(
                          (request) => request.status === "pending",
                        ) && (
                          <TextButton
                            label={tr("Count is wrong")}
                            onPress={() => fixCount(row)}
                          />
                        )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}
export function Team({ open, notify, go }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Employee | null>(null),
    [review, setReview] = useState<Employee | null>(null),
    [detail, setDetail] = useState<Employee | null>(null);
  return (
    <>
      <ActionButton
        label={tr("Add employee")}
        icon="add"
        onPress={() =>
          open({
            title: tr("Add employee"),
            description: tr("Admin approval is required."),
            fields: [
              { key: "name", label: tr("Name"), required: true },
              { key: "phone", label: tr("Phone (optional)") },
            ],
            submitLabel: tr("Send to admin"),
            onSubmit: async (values) => {
              await s.act({
                type: "request_employee",
                employeeId: nextEmployeeId(d, values.name),
                name: values.name,
                unitId: s.actor!.unitId,
                operation: "",
                phone: values.phone,
              });
              notify(tr("Sent to admin to approve."));
            },
          })
        }
      />
      {d.requests
        .filter((r) => r.status === "pending")
        .map((r) => (
          <Card key={r.id} style={{ backgroundColor: c.warningLight }}>
            <View style={styles.between}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {r.name}
                </Text>
                <Text style={styles.muted}>{r.employeeId}</Text>
              </View>
              <Pill label={tr("Admin review")} tone="warning" />
            </View>
          </Card>
        ))}
      <Search
        value={search}
        onChange={setSearch}
        placeholder={tr("Find employee")}
      />
      {d.employees
        .filter(
          (e) =>
            e.role === "worker" &&
            e.active &&
            `${e.name} ${e.employeeId}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .map((e) => (
          <Card key={e.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("{{value0}} details", { value0: e.name })}
              onPress={() => setDetail(e)}
              style={styles.between}
            >
              <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {e.name}
                </Text>
                <Text style={styles.muted}>
                  {e.employeeId} · {operationsFor(d, e.id).length}{" "}
                  {operationsFor(d, e.id).length === 1
                    ? tr("operation")
                    : tr("operations")}
                </Text>
              </View>
              <Pill
                label={dayFor(d, e.id) ? tr("Checked") : tr("To check")}
                tone={dayFor(d, e.id) ? "success" : "warning"}
                icon={
                  dayFor(d, e.id) ? "checkmark-circle-outline" : "time-outline"
                }
              />
            </Pressable>
            <View style={[styles.row, { flexWrap: "wrap" }]}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <ActionButton
                  label={tr("Assign operations")}
                  secondary
                  onPress={() => setSelected(e)}
                />
              </View>
              <TextButton
                label={tr("Review counts")}
                onPress={() => setReview(e)}
              />
            </View>
          </Card>
        ))}
      {detail && (
        <EmployeeDetail employee={detail} onClose={() => setDetail(null)} />
      )}
      {selected && (
        <AssignOperations
          employee={selected}
          onClose={() => setSelected(null)}
          notify={notify}
        />
      )}
      {review && (
        <ReviewDay
          employee={review}
          snapshot={d}
          onClose={() => setReview(null)}
          notify={notify}
        />
      )}
    </>
  );
}
export function Requests({
  open,
  notify,
  pendingOnly = false,
}: Tools & {
  pendingOnly?: boolean;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    a = s.actor!,
    requests = pendingOnly
      ? d.requests.filter((r) => r.status === "pending")
      : d.requests;
  return (
    <>
      {!requests.length && (
        <Empty
          title={tr("No employee requests")}
          detail={tr(
            "When a captain adds someone, they appear here for you to approve.",
          )}
        />
      )}
      {requests.map((r) => (
        <Card key={r.id}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.body, { fontWeight: "700" }]}>{r.name}</Text>
              <Text style={styles.muted}>{r.employeeId}</Text>
            </View>
            <Pill
              label={
                r.status === "pending"
                  ? a.role === "captain"
                    ? tr("Admin review")
                    : tr("Needs review")
                  : tr(r.status)
              }
              tone={r.status === "pending" ? "warning" : "neutral"}
            />
          </View>
          {a.role === "admin" && (
            <Text style={styles.muted}>
              {d.units.find((u) => u.id === r.unitId)?.name}
              {r.requestedBy
                ? tr(" \u00B7 Requested by {{value0}}", {
                    value0:
                      d.employees.find((e) => e.id === r.requestedBy)?.name ??
                      "captain",
                  })
                : ""}
            </Text>
          )}
          {a.role === "admin" && r.status === "pending" && (
            <View style={styles.row}>
              {(["approved", "rejected"] as const).map((decision) => (
                <View key={decision} style={{ flex: 1 }}>
                  <ActionButton
                    label={
                      decision === "approved" ? tr("Approve") : tr("Reject")
                    }
                    secondary={decision === "rejected"}
                    onPress={() =>
                      open({
                        title:
                          decision === "approved"
                            ? tr("Approve employee")
                            : tr("Reject request"),
                        fields: [
                          {
                            key: "reason",
                            label: tr("Review note"),
                            required: decision === "rejected",
                          },
                        ],
                        submitLabel: tr("Confirm"),
                        onSubmit: async (v) => {
                          await s.act({
                            type: "review_request",
                            id: r.id,
                            decision,
                            reason: v.reason,
                          });
                          notify(tr("Request reviewed."));
                        },
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
          {!!r.reason && <Text style={styles.muted}>{r.reason}</Text>}
        </Card>
      ))}
    </>
  );
}
export function Reports(
  props: Tools & {
    inbox?: boolean;
  },
) {
  useTranslation();
  return CAPTAIN_REPORTS_ENABLED ? <ReportScreens {...props} /> : null;
}
function ReportScreens({
  open,
  notify,
  inbox = false,
}: Tools & {
  inbox?: boolean;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    a = s.actor!,
    [status, setStatus] = useState("all"),
    [unit, setUnit] = useState("all");
  function compose(workDate = factoryDate()) {
    const prior = d.reports.find(
        (r) => r.unitId === a.unitId && r.workDate === workDate,
      ),
      days = (d.days ?? []).filter((x) => x.workDate === workDate),
      staff = d.employees.filter((e) => e.active && e.role === "worker");
    open({
      title: prior ? tr("Update daily report") : tr("Daily report"),
      description: tr(
        "Enter finished and packed totals. Attendance comes from team checks. Operation counts may include the same garment more than once.",
      ),
      fields: [
        {
          key: "date",
          label: tr("Date"),
          value: workDate,
          required: true,
          options: [0, -1, -2].map((n) => ({
            value: dateOffset(n),
            label: dateOffset(n),
          })),
        },
        {
          key: "completed",
          label: tr("Finished pieces"),
          value: String(prior?.completed ?? 0),
          numeric: true,
          required: true,
        },
        {
          key: "packed",
          label: tr("Packed pieces"),
          value: String(prior?.packed ?? 0),
          numeric: true,
          required: true,
        },
        {
          key: "scheduled",
          label: tr("Employees scheduled"),
          value: String(prior?.scheduled ?? staff.length),
          numeric: true,
          required: true,
        },
        {
          key: "present",
          label: tr("Employees present"),
          value: String(
            prior?.present ??
              days.filter((x) => x.attendance === "present").length,
          ),
          numeric: true,
          required: true,
        },
        {
          key: "blockers",
          label: tr("Blockers"),
          value: prior?.blockers,
          multiline: true,
        },
        {
          key: "notes",
          label: tr("Notes"),
          value: prior?.notes,
          multiline: true,
        },
      ],
      submitLabel: tr("Submit report"),
      onSubmit: async (v) => {
        await s.act({
          type: "submit_report",
          workDate: v.date,
          unitId: a.unitId,
          completed: Number(v.completed),
          packed: Number(v.packed),
          scheduled: Number(v.scheduled),
          present: Number(v.present),
          blockers: v.blockers,
          notes: v.notes,
        });
        notify(tr("Report submitted to admin."));
      },
    });
  }
  const reports = d.reports.filter(
    (r) =>
      (inbox
        ? r.status === "submitted"
        : status === "all" || r.status === status) &&
      (unit === "all" || r.unitId === unit),
  );
  return (
    <>
      {inbox && <SectionTitle title={tr("Captain reports")} />}
      {a.role === "captain" && (
        <ActionButton
          label={tr("Write today\u2019s report")}
          icon="add"
          onPress={() => compose()}
        />
      )}
      {!inbox && (
        <Segments
          value={status}
          options={[
            { id: "all", label: tr("All") },
            { id: "submitted", label: tr("To review") },
            { id: "changes_requested", label: tr("Changes") },
            { id: "reviewed", label: tr("Reviewed") },
          ]}
          onChange={setStatus}
        />
      )}
      {!inbox && a.role === "admin" && (
        <ChoiceField
          label={tr("Filter by line")}
          value={unit}
          options={[
            { id: "all", label: tr("All lines") },
            ...d.units.map((u) => ({ id: u.id, label: u.name })),
          ]}
          onChange={setUnit}
        />
      )}
      {!inbox && (
        <TextButton
          label={tr("Export reports")}
          onPress={() =>
            void exportCsv("crewgrain-captain-reports", [
              [
                "Line",
                "Date",
                "Captain",
                "Finished",
                "Packed",
                "Scheduled",
                "Present",
                "Blockers",
                "Notes",
                "Status",
                "Revision",
              ],
              ...reports.map((r) => [
                d.units.find((u) => u.id === r.unitId)?.name ?? "",
                r.workDate,
                d.employees.find((e) => e.id === r.captainId)?.name ?? "",
                r.completed,
                r.packed,
                r.scheduled,
                r.present,
                r.blockers,
                r.notes,
                r.status,
                r.revision,
              ]),
            ]).catch((e) => notify(e.message))
          }
        />
      )}
      {!reports.length && (
        <Empty title={tr("No reports yet")} icon="document-text-outline" />
      )}
      {reports.map((r) => (
        <Card key={r.id}>
          <View style={styles.between}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.body, { fontWeight: "700" }]}>
                {d.units.find((u) => u.id === r.unitId)?.name}
              </Text>
              <Text style={styles.muted}>
                {r.workDate}
                {tr("\u00B7 Revision")}
                {r.revision}
              </Text>
            </View>
            <Pill
              label={label(r.status)}
              tone={r.status === "reviewed" ? "neutral" : "warning"}
            />
          </View>
          <View style={styles.row}>
            {[
              [r.completed, "Finished"],
              [r.packed, "Packed"],
              [`${r.present}/${r.scheduled}`, "Present"],
            ].map(([v, k]) => (
              <View key={k} style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 23, color: c.ink, fontWeight: "600" }}>
                  {v}
                </Text>
                <Text style={styles.muted}>{k}</Text>
              </View>
            ))}
          </View>
          {!!r.blockers && (
            <Text style={styles.body}>
              {tr("Blockers:")}
              {r.blockers}
            </Text>
          )}
          {!!r.notes && <Text style={styles.muted}>{r.notes}</Text>}
          {!!r.reviewerNote && (
            <Text style={styles.muted}>
              {tr("Admin:")}
              {r.reviewerNote}
            </Text>
          )}
          {a.role === "captain" && r.status !== "reviewed" && (
            <TextButton
              label={tr("Update report")}
              onPress={() => compose(r.workDate)}
            />
          )}
          {a.role === "admin" && r.status === "submitted" && (
            <View style={styles.row}>
              {(["reviewed", "changes_requested"] as const).map((decision) => (
                <View style={{ flex: 1 }} key={decision}>
                  <ActionButton
                    label={
                      decision === "reviewed"
                        ? tr("Accept report")
                        : tr("Ask for changes")
                    }
                    secondary={decision !== "reviewed"}
                    onPress={() =>
                      open({
                        title:
                          decision === "reviewed"
                            ? tr("Accept report")
                            : tr("Request changes"),
                        fields: [
                          {
                            key: "reason",
                            label: tr("Review note"),
                            required: decision === "changes_requested",
                            multiline: true,
                          },
                        ],
                        submitLabel: tr("Save review"),
                        onSubmit: async (v) => {
                          await s.act({
                            type: "review_report",
                            id: r.id,
                            decision,
                            reason: v.reason,
                          });
                          notify(tr("Report reviewed."));
                        },
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
        </Card>
      ))}
    </>
  );
}
export function Corrections({ open, notify }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!;
  const list = (d.corrections ?? []).filter((r) => r.status === "pending");
  return (
    <>
      {list.length > 0 && <SectionTitle title={tr("Employee corrections")} />}
      {list.map((r) => (
        <Card key={r.id}>
          <Text style={[styles.body, { fontWeight: "700" }]}>
            {r.employeeName} · {r.workDate}
          </Text>
          <Text style={{ fontSize: 23, color: c.ink, fontWeight: "600" }}>
            {r.originalQuantity} → {r.requestedQuantity}
          </Text>
          <Text style={styles.muted}>{r.reason}</Text>
          <View style={styles.row}>
            {(["accepted", "rejected"] as const).map((decision) => (
              <View style={{ flex: 1 }} key={decision}>
                <ActionButton
                  label={decision === "accepted" ? tr("Accept") : tr("Reject")}
                  secondary={decision === "rejected"}
                  onPress={() =>
                    open({
                      title: tr("Review correction"),
                      description: tr(
                        "Accepting adds an adjustment; original counts stay unchanged.",
                      ),
                      fields: [
                        {
                          key: "note",
                          label: tr("Review note"),
                          required: decision === "rejected",
                        },
                      ],
                      submitLabel:
                        decision === "accepted"
                          ? tr("Accept correction")
                          : tr("Reject correction"),
                      onSubmit: async (v) => {
                        await s.workspaceAct({
                          type: "review_correction",
                          id: r.id,
                          decision,
                          note: v.note,
                        });
                        notify(tr("Correction reviewed."));
                      },
                    })
                  }
                />
              </View>
            ))}
          </View>
        </Card>
      ))}
    </>
  );
}
export const adminTools: () => {
  id: string;
  title: string;
  detail: string;
  icon: IconName;
  tone?: "neutral" | "warning" | "info" | "danger";
}[] = () => [
  {
    id: "production",
    title: tr("Production"),
    detail: tr("Counts by line and day"),
    icon: "shirt-outline",
  },
  {
    id: "tasks",
    title: tr("Assign operations"),
    detail: tr("Assign operations to employees"),
    icon: "cut-outline",
    tone: "warning",
  },
  {
    id: "payroll",
    title: tr("Payroll"),
    detail: tr("Approved pay & exports"),
    icon: "wallet-outline",
  },
  {
    id: "reports",
    title: tr("Captain summaries"),
    detail: tr("Production & attendance"),
    icon: "document-text-outline",
    tone: "info",
  },
  {
    id: "units",
    title: tr("Lines"),
    detail: tr("Captains and what each line works on"),
    icon: "business-outline",
  },
  {
    id: "styles",
    title: tr("Styles & rates"),
    detail: tr("Operations and piece rates"),
    icon: "shirt-outline",
    tone: "warning",
  },
  {
    id: "lots",
    title: tr("Batches"),
    detail: tr("Cloth batches to produce"),
    icon: "layers-outline",
  },
  {
    id: "requests",
    title: tr("Employee requests"),
    detail: tr("Review new team members"),
    icon: "person-add-outline",
    tone: "info",
  },
  {
    id: "audit",
    title: tr("Audit trail"),
    detail: tr("Who changed what and when"),
    icon: "shield-checkmark-outline",
  },
  {
    id: "settings",
    title: tr("Factory settings"),
    detail: tr("Contact and pay period"),
    icon: "settings-outline",
  },
];
export function Hub({
  go,
  ids,
}: Tools & {
  ids: string[];
}) {
  useTranslation();
  return (
    <View style={{ gap: 10 }}>
      {ids
        .filter(
          (id) =>
            id !== "audit" && (CAPTAIN_REPORTS_ENABLED || id !== "reports"),
        )
        .map((id) => {
          const item = adminTools().find((t) => t.id === id)!;
          return (
            <MenuRow
              key={id}
              title={item.title}
              detail={item.detail}
              icon={item.icon}
              onPress={() => go?.(id)}
            />
          );
        })}
    </View>
  );
}
export {
  ProductionView as Production,
  OperationsBreakdown,
  BatchesAlerts,
} from "./ProductionView";
export function AuditTrail({ open, notify }: Tools) {
  useTranslation();
  const { data: d } = useDailyStore(),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(30);
  const rows = d!.audit.filter((r) =>
    `${r.action} ${r.detail} ${d!.employees.find((e) => e.id === r.actorId)?.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <Search
        value={query}
        onChange={setQuery}
        placeholder={tr("Find action, employee or change")}
      />
      <TextButton
        label={tr("Export audit CSV")}
        onPress={() =>
          void exportCsv("crewgrain-audit", [
            ["Time", "Actor", "Action", "Entity", "Detail"],
            ...rows.map((r) => [
              r.at,
              d!.employees.find((e) => e.id === r.actorId)?.name ?? r.actorId,
              r.action,
              r.entityId,
              r.detail,
            ]),
          ]).catch((e) => notify(e.message))
        }
      />
      {!rows.length && (
        <Empty
          title={tr("No matching changes")}
          icon="shield-checkmark-outline"
        />
      )}
      {rows.slice(0, limit).map((r) => (
        <MenuRow
          key={r.id}
          icon="shield-checkmark-outline"
          title={label(r.action)}
          detail={`${d!.employees.find((e) => e.id === r.actorId)?.name ?? tr("Admin")} · ${formatDateTime(new Date(r.at), { timeZone: "Asia/Kolkata" })}`}
          onPress={() =>
            open({
              title: label(r.action),
              description: r.detail,
              fields: [],
              submitLabel: tr("Done"),
              onSubmit: async () => {},
            })
          }
        />
      ))}
      {rows.length > limit && (
        <TextButton
          label={tr("Show more")}
          onPress={() => setLimit((n) => n + 30)}
        />
      )}
    </>
  );
}
export function Settings({ open, notify, go }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    v = d.settings ?? { name: "Crewgrain", phone: "", payPeriod: "weekly" };
  return (
    <>
      <Card>
        <Text style={styles.eyebrow}>{tr("FACTORY DETAILS")}</Text>
        <Text style={styles.heading}>{v.name}</Text>
        <Text style={styles.body}>{v.phone || "Contact number not set"}</Text>
        <Text style={styles.muted}>
          {tr("Pay period:")}
          {v.payPeriod}
        </Text>
        <ActionButton
          label={tr("Edit factory details")}
          secondary
          icon="settings-outline"
          onPress={() =>
            open({
              title: tr("Factory settings"),
              fields: [
                {
                  key: "name",
                  label: tr("Factory name"),
                  value: v.name,
                  required: true,
                },
                { key: "phone", label: tr("Support phone"), value: v.phone },
                {
                  key: "payPeriod",
                  label: tr("Pay period"),
                  value: v.payPeriod,
                  options: ["weekly", "fortnightly", "monthly"].map((x) => ({
                    value: x,
                    label: label(x),
                  })),
                },
              ],
              submitLabel: tr("Save settings"),
              onSubmit: async (x) => {
                await s.workspaceAct({
                  type: "save_settings",
                  name: x.name,
                  phone: x.phone,
                  payPeriod: x.payPeriod as typeof v.payPeriod,
                });
                notify(tr("Factory settings saved."));
              },
            })
          }
        />
      </Card>
      <MenuRow
        title={tr("Approval rules")}
        icon="shield-checkmark-outline"
        onPress={() =>
          open({
            title: tr("Approval rules"),
            description: tr(
              "Captains review piece counts and attendance. Employees record their own pieces. Rates stay with each saved count.",
            ),
            fields: [],
            submitLabel: tr("Done"),
            onSubmit: async () => {},
          })
        }
      />
      <MenuRow
        title={tr("Phone access")}
        icon="call-outline"
        onPress={() => go?.("people")}
      />
      {!s.demo && (
        <TextButton
          label={tr("Sign out")}
          onPress={() => void s.logout().catch((e) => notify(e.message))}
        />
      )}
    </>
  );
}
export function Profile({
  go,
  notify,
  onExit,
}: Tools & {
  onExit: () => void;
}) {
  useTranslation();
  const s = useDailyStore(),
    a = s.actor!,
    d = s.data!;
  return (
    <>
      <Card style={{ alignItems: "center", paddingVertical: 26 }}>
        <View
          style={{
            width: 72,
            height: 72,
            backgroundColor: c.soft,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 27, color: c.primary, fontWeight: "600" }}>
            {a.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </Text>
        </View>
        <Text style={styles.heading}>{a.name}</Text>
        <Pill label={a.role === "worker" ? tr("Employee") : label(a.role)} />
        <Text style={styles.muted}>
          {a.employeeId} · {d.units.find((u) => u.id === a.unitId)?.name}
        </Text>
      </Card>
      <MenuRow
        title={tr("Connection & saved counts")}
        detail={tr("{{value0}} changes waiting \u00B7 {{value1}}", {
          value0: s.outbox.length,
          value1: s.online ? tr("Online") : tr("Offline"),
        })}
        icon="cloud-done-outline"
        onPress={() =>
          void s
            .sync()
            .then(() => notify(tr("Saved work checked.")))
            .catch((e) => notify(e.message))
        }
      />
      {!!d.settings?.phone && (
        <MenuRow
          title={tr("Contact factory")}
          detail={d.settings.phone}
          icon="call-outline"
          onPress={() =>
            void Linking.openURL(
              `tel:${d.settings!.phone.replace(/[^\d+]/g, "")}`,
            ).catch((e) => notify(e.message))
          }
        />
      )}
      <MenuRow
        title={
          a.role === "worker"
            ? tr("My pay")
            : a.role === "captain"
              ? tr("Output")
              : tr("Factory settings")
        }
        icon={
          a.role === "worker"
            ? "wallet-outline"
            : a.role === "captain"
              ? "document-text-outline"
              : "settings-outline"
        }
        onPress={() =>
          go?.(
            a.role === "worker"
              ? "earnings"
              : a.role === "captain"
                ? "reports"
                : "settings",
          )
        }
      />
      <Card>
        <Text style={[styles.body, { fontWeight: "700" }]}>
          {a.role === "admin"
            ? tr("Admin access")
            : tr("This phone is your access")}
        </Text>
        <Text style={styles.muted}>
          {a.role === "admin"
            ? tr("Your email and password protect factory administration.")
            : tr(
                "No OTP or password is needed. If you change phones, ask your admin for a new setup link.",
              )}
        </Text>
      </Card>
      {!s.demo && a.role === "admin" && (
        <ActionButton
          label={tr("Sign out")}
          icon="log-out-outline"
          onPress={() =>
            void s
              .logout()
              .then(onExit)
              .catch((e) => notify(e.message))
          }
        />
      )}
      <ActionButton
        label={s.demo ? tr("Switch sample role") : tr("Back to access screen")}
        secondary
        icon="log-out-outline"
        onPress={onExit}
      />
    </>
  );
}
