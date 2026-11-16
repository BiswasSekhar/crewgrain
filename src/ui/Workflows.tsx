import { operationCode } from "../domain/operations";
import { plannedStyleIds } from "../domain/plan";
import { formatTime, numberLocale, tr, errorText } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { ProductionTotals } from "./ProductionView";
import { Text, TextInput } from "./Typography";
import React, { useState } from "react";
import {
  View,
  Pressable,
  Share,
  Platform,
  useWindowDimensions,
} from "react-native";
import { cachedLedger, useDailyStore } from "../lib/daily-store";
import { countFor, dayFor, operationsFor, approvedPay } from "../domain/daily";
import {
  dateOffset,
  factoryDate,
  money,
  nextEmployeeId,
} from "../domain/rules";
import { dayFigures, totals } from "../domain/workspace";
import { FilterBar } from "./FilterBar";
import type { Snapshot, Employee, DayApproval } from "../domain/types";
import { exportCsv } from "../lib/export";
import { DayPlan } from "./DayPlan";
import { EmployeeDetail } from "./Output";
import {
  ADMIN_DESKTOP_BREAKPOINT,
  ink,
  grey,
  line,
  styles,
  ActionButton,
  Checkbox,
  SelectAllRow,
  TextButton,
  Counter,
  Sheet,
  Tools,
  c,
  Search,
  ChoiceField,
  Icon,
  IconButton,
  Pill,
  Card,
  Segments,
  Tap,
} from "./kit";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableCell,
} from "../../components/ui/table";
export function EmployeeToday({ notify, go }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    a = s.actor!,
    date = factoryDate(),
    day = dayFor(d, a.id, date),
    tasks = operationsFor(d, a.id, date).sort(
      (x, y) =>
        (d.operations.find((o) => o.id === x.operationId)?.sequence ?? 0) -
        (d.operations.find((o) => o.id === y.operationId)?.sequence ?? 0),
    );
  const pending = s.outbox.filter(
    (r) => r.kind === "counter" && r.workDate === date,
  );
  const commonLot =
    new Set(tasks.map((t) => t.lotId)).size === 1
      ? d.lots.find((l) => l.id === tasks[0]?.lotId)
      : undefined;
  const change = (id: string, delta: number) => {
    void s.change(id, delta).catch((e) => notify(e.message));
  };
  const todayStyles = (d.dayPlan ?? [])
    .filter((x) => x.unitId === a.unitId && x.workDate === date)
    .sort((x, y) => x.position - y.position)
    .map((x) => d.styles.find((st) => st.id === x.styleId)?.code)
    .filter(Boolean)
    .join(", ");
  const total = tasks.reduce(
    (n, task) =>
      n +
      (countFor(d, task.id, date)?.quantity ?? 0) +
      pending
        .filter((r) => r.assignmentId === task.id)
        .reduce((m, r) => m + (r.delta ?? 0), 0),
    0,
  );
  const todayPay = totals(
    cachedLedger(d).filter(
      (row) => row.employeeId === a.id && row.workDate === date,
    ),
  );
  return (
    <>
      {tasks.length > 0 && (
        <>
          <ProductionTotals
            summary={{
              ...todayPay,
              pending:
                todayPay.pending +
                pending.reduce(
                  (sum, row) =>
                    sum +
                    (row.delta ?? 0) *
                      (countFor(d, row.assignmentId!, date)?.ratePaise ??
                        d.operations.find((o) => o.id === row.operationId)
                          ?.ratePaise ??
                        0),
                  0,
                ),
              pieces: total,
            }}
            onMoney={() => go?.("history")}
            status={
              day?.status === "needs_admin"
                ? tr("Admin checking")
                : day
                  ? tr("Approved")
                  : tr("To check")
            }
          />
          <Text style={{ fontSize: 18, fontWeight: "700", color: ink }}>
            {tr("Operations")}
          </Text>
        </>
      )}
      {tasks.length === 0 && (
        <View
          style={[styles.card, { alignItems: "center", paddingVertical: 32 }]}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: ink }}>
            {tr("No operations assigned")}
          </Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            {tr("Ask your captain to add your operations for today.")}
          </Text>
        </View>
      )}
      {tasks.map((task) => {
        const op = d.operations.find((o) => o.id === task.operationId)!,
          lot = d.lots.find((l) => l.id === task.lotId),
          count =
            (countFor(d, task.id, date)?.quantity ?? 0) +
            pending
              .filter((r) => r.assignmentId === task.id)
              .reduce((n, r) => n + (r.delta ?? 0), 0),
          checked = day?.tasks.find((t) => t.assignmentId === task.id);
        return (
          <Card
            key={task.id}
            style={{
              gap: 10,
              padding: 12,
              borderWidth: 1,
              borderRadius: 16,
              backgroundColor: c.paper,
              borderColor: line,
            }}
          >
            <View style={styles.between}>
              <Text
                style={{ fontSize: 15, fontWeight: "700", color: ink, flex: 1 }}
              >
                {operationCode(op)} · {op.name}
              </Text>
              {!!lot && (!commonLot || !todayStyles) && (
                <Text style={styles.muted}>{lot.code}</Text>
              )}
            </View>
            <Counter
              small
              label={op.name}
              value={count}
              disabled={!!day}
              onSet={(next) => change(task.id, next - count)}
            />
            {checked && checked.enteredQuantity !== checked.captainQuantity && (
              <Text style={styles.muted}>
                {tr("You entered")}
                {checked.enteredQuantity}. Captain checked{" "}
                {checked.captainQuantity}.
                {day?.status === "needs_admin"
                  ? tr(" Admin is reviewing the change.")
                  : ""}
              </Text>
            )}
          </Card>
        );
      })}
    </>
  );
}
export function CaptainDay({ open, notify, go }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    date = factoryDate(),
    employees = d.employees.filter((e) => e.active && e.role === "worker"),
    [checkFilter, setCheckFilter] = useState("todo"),
    [review, setReview] = useState<{
      employee: Employee;
      data: Snapshot;
    } | null>(null);
  const checked = employees.filter((e) => dayFor(d, e.id, date)).length;
  const teamRows = cachedLedger(d),
    todayRows = teamRows.filter((row) => row.workDate === date),
    teamValue =
      d.teamMoney?.find((row) => row.workDate === date)?.amountPaise ?? 0,
    present = employees.filter(
      (employee) => dayFor(d, employee.id, date)?.attendance === "present",
    ).length;
  const myUnit = d.units.find((u) => u.id === s.actor!.unitId);
  return (
    <>
      <ProductionTotals
        summary={{
          pieces: totals(todayRows).pieces,
          approved: teamValue,
          pending: 0,
        }}
        onMoney={() => go?.("reports")}
      />
      {myUnit && (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={tr("Change today's styles")}
          onPress={() => go?.("plan")}
          style={[
            styles.card,
            styles.between,
            { minHeight: 56, padding: 12, gap: 10 },
          ]}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: c.violetLight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="shirt-outline" color={c.violet} size={19} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 12, color: grey }}>{tr("Styles")}</Text>
            <Text style={{ color: ink, fontSize: 16, fontWeight: "600" }}>
              {(d.dayPlan ?? [])
                .filter((x) => x.unitId === myUnit.id && x.workDate === date)
                .sort((x, y) => x.position - y.position)
                .map((x) => d.styles.find((st) => st.id === x.styleId)?.code)
                .filter(Boolean)
                .join(", ") || "Choose styles"}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={grey} />
        </Tap>
      )}
      <View style={{ gap: 12 }}>
        <View style={styles.between}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: ink }}>
            {tr("Employees")}
          </Text>
          <Text style={styles.muted}>
            {present}
            {tr("present")}
          </Text>
        </View>
        <Segments
          value={checkFilter}
          options={[
            {
              id: "todo",
              label: tr("To check \u00B7 {{value0}}", {
                value0: employees.length - checked,
              }),
            },
            {
              id: "checked",
              label: tr("Checked \u00B7 {{value0}}", { value0: checked }),
            },
          ]}
          onChange={setCheckFilter}
        />
        <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {employees
            .filter((e) =>
              checkFilter === "todo"
                ? !dayFor(d, e.id, date)
                : !!dayFor(d, e.id, date),
            )
            .map((e) => {
              const tasks = operationsFor(d, e.id, date),
                day = dayFor(d, e.id, date),
                count = tasks.reduce(
                  (n, t) => n + (countFor(d, t.id, date)?.quantity ?? 0),
                  0,
                );
              return (
                <Tap
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={tr(
                    "{{value0}}, {{value1}} pieces. {{value2}}",
                    {
                      value0: e.name,
                      value1: count,
                      value2: day
                        ? tr("View checked counts")
                        : tasks.length
                          ? tr("Check and approve")
                          : tr("Assign operations"),
                    },
                  )}
                  onPress={() =>
                    tasks.length
                      ? setReview({ employee: e, data: d })
                      : go?.("team")
                  }
                  style={({ pressed }) => [
                    styles.listRow,
                    {
                      borderBottomWidth: 1,
                      borderColor: line,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      minHeight: 72,
                      backgroundColor: pressed ? c.soft : c.paper,
                    },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text
                      style={{ fontSize: 17, color: ink, fontWeight: "600" }}
                    >
                      {e.name}
                    </Text>
                    <Text
                      style={[
                        styles.muted,
                        {
                          color:
                            day?.status === "needs_admin" ? c.warning : grey,
                        },
                      ]}
                    >
                      {day?.status === "needs_admin"
                        ? tr("Admin to check")
                        : day
                          ? day.attendance === "absent"
                            ? tr("Absent")
                            : tr("Approved")
                          : tasks.length
                            ? tr("{{value0}} operations", {
                                value0: tasks.length,
                              })
                            : tr("Assign operations")}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "600",
                      color: ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {count}
                  </Text>
                  <Icon
                    name={day ? "checkmark-circle-outline" : "chevron-forward"}
                    size={20}
                    color={
                      day?.status === "needs_admin"
                        ? c.warning
                        : day
                          ? c.primary
                          : grey
                    }
                  />
                </Tap>
              );
            })}
          {!employees.some((e) =>
            checkFilter === "todo"
              ? !dayFor(d, e.id, date)
              : !!dayFor(d, e.id, date),
          ) && (
            <View style={{ padding: 24, gap: 8 }}>
              <Icon name="checkmark-circle-outline" />
              <Text style={styles.body}>
                {employees.length === 0
                  ? tr("Add employees from Team.")
                  : checkFilter === "todo"
                    ? tr("Everyone is checked.")
                    : tr("No checks yet.")}
              </Text>
            </View>
          )}
        </Card>
      </View>
      {review && (
        <ReviewDay
          employee={review.employee}
          snapshot={review.data}
          onClose={() => setReview(null)}
          notify={notify}
        />
      )}
    </>
  );
}
export function ReviewDay({
  employee,
  snapshot,
  onClose,
  notify,
}: {
  employee: Employee;
  snapshot: Snapshot;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  useTranslation();
  const s = useDailyStore(),
    date = factoryDate(),
    existing = dayFor(snapshot, employee.id, date),
    tasks = operationsFor(snapshot, employee.id, date);
  const [attendance, setAttendance] = useState<"present" | "absent">(
    existing?.attendance ?? "present",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const hasWork = tasks.some(
    (task) => (countFor(snapshot, task.id, date)?.quantity ?? 0) > 0,
  );
  async function approve() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await s.dailyAct({
        type: "approve_day",
        employeeId: employee.id,
        workDate: date,
        attendance,
        tasks: tasks.map((task) => ({
          assignmentId: task.id,
          quantity: countFor(snapshot, task.id, date)?.quantity ?? 0,
          expectedVersion: countFor(snapshot, task.id, date)?.version ?? 0,
          reason: "",
        })),
      });
      notify(tr("Day approved."));
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={employee.name}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        existing ? undefined : (
          <>
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: c.danger }}>
                {errorText(error)}
              </Text>
            )}
            <ActionButton
              label={busy ? tr("Approving\u2026") : tr("Approve counts")}
              disabled={
                busy || !tasks.length || (attendance === "absent" && hasWork)
              }
              onPress={() => void approve()}
            />
          </>
        )
      }
    >
      <View style={styles.list}>
        {tasks.map((task, index) => (
          <View
            key={task.id}
            style={[
              styles.listRow,
              { borderTopWidth: index ? 1 : 0, borderColor: line },
            ]}
          >
            <Text style={[styles.body, { flex: 1 }]}>
              {
                snapshot.operations.find((op) => op.id === task.operationId)
                  ?.name
              }
            </Text>
            <Text selectable style={styles.number}>
              {existing?.tasks.find((t) => t.assignmentId === task.id)
                ?.enteredQuantity ??
                countFor(snapshot, task.id, date)?.quantity ??
                0}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>
        {tr("Counts entered by")}
        {employee.name.split(" ")[0]}.
      </Text>
      {existing ? (
        <Text style={styles.body}>
          {tr("Approved. Attendance:")}
          {tr(existing.attendance)}.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>{tr("Attendance")}</Text>
          <Segments
            value={attendance}
            options={[
              { id: "present", label: tr("Present") },
              { id: "absent", label: tr("Absent") },
            ]}
            onChange={(value) => setAttendance(value as "present" | "absent")}
          />
          {attendance === "absent" && hasWork && (
            <Text style={{ color: c.danger }}>
              {tr(
                "This employee logged pieces. Check attendance before approving.",
              )}
            </Text>
          )}
        </>
      )}
    </Sheet>
  );
}
export function OperationAssignments({
  open,
  notify,
  initialLine,
  initialDate,
}: Tools & { initialLine?: string; initialDate?: string }) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    admin = s.actor?.role === "admin",
    today = factoryDate(),
    [date, setDate] = useState(
      initialDate &&
        initialDate >= dateOffset(-35, today) &&
        initialDate <= dateOffset(7, today)
        ? initialDate
        : today,
    ),
    // An admin chooses the line. A captain only ever sees their own line.
    ownUnit = s.actor?.role === "captain" ? s.actor.unitId : "",
    [lineChoice, setLineId] = useState(
      d.units.find((u) => u.id === initialLine && u.active)?.id ??
        d.units.find((u) => u.active)?.id ??
        "",
    ),
    lineId = ownUnit || lineChoice,
    [employee, setEmployee] = useState<Employee | null>(null),
    [search, setSearch] = useState("");
  // Operations can be assigned for today and the two days before.
  const canAssign = date >= dateOffset(-2, today) && date <= today,
    rows = cachedLedger(d),
    lineStaff = d.employees.filter(
      (e) => e.active && e.role === "worker" && e.unitId === lineId,
    ),
    // Days with a plan for this line get a dot in the calendar.
    planned = new Set(
      (d.dayPlan ?? [])
        .filter((x) => x.unitId === lineId)
        .map((x) => x.workDate),
    ),
    dayTotals = lineStaff.reduce(
      (n, e) => {
        const f = dayFigures(d, rows, e.id, date);
        return {
          pieces: n.pieces + f.pieces,
          amountPaise: n.amountPaise + f.amountPaise,
        };
      },
      { pieces: 0, amountPaise: 0 },
    );
  return (
    <>
      <FilterBar
        line={admin ? lineId : undefined}
        lines={admin ? d.units.filter((u) => u.active) : undefined}
        onLine={setLineId}
        staticLine={
          admin ? undefined : d.units.find((u) => u.id === lineId)?.name
        }
        date={date}
        onDate={setDate}
        min={dateOffset(-35, today)}
        max={dateOffset(7, today)}
        marked={planned}
      />
      {d.units.find((u) => u.id === lineId) && (
        <DayPlan
          unit={d.units.find((u) => u.id === lineId)!}
          date={date}
          showTitle
          open={open}
          notify={notify}
        />
      )}
      <View style={[styles.between, { gap: 12 }]}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: c.ink }}>
          {tr("Employees on {{value0}}", {
            value0: d.units.find((u) => u.id === lineId)?.name ?? "",
          })}
        </Text>
        <Text style={styles.muted}>{lineStaff.length}</Text>
      </View>
      {date <= today && (
        <Card>
          <View style={[styles.between, { gap: 12 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.muted}>{tr("Pieces made")}</Text>
              <Text style={{ fontSize: 22, fontWeight: "700", color: c.ink }}>
                {dayTotals.pieces.toLocaleString(numberLocale())}
              </Text>
            </View>
            {(admin || s.data?.employeeMoney) && (
              <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
                <Text style={styles.muted}>{tr("Amount")}</Text>
                <Text style={{ fontSize: 22, fontWeight: "700", color: c.ink }}>
                  {money(dayTotals.amountPaise)}
                </Text>
              </View>
            )}
          </View>
        </Card>
      )}
      {date > today && (
        <Text style={styles.muted}>
          {tr(
            "Operations can be assigned on the day itself. You can plan styles ahead.",
          )}
        </Text>
      )}
      <TextInput
        accessibilityLabel={tr("Find employee")}
        placeholder={tr("Find by name or ID")}
        value={search}
        onChangeText={setSearch}
        style={styles.input}
      />
      {lineStaff
        .filter((e) =>
          `${e.name} ${e.employeeId}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((e) => {
          const figures = dayFigures(d, rows, e.id, date),
            tasks = operationsFor(d, e.id, date);
          return (
            <View key={e.id} style={styles.card}>
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { fontWeight: "700" }]}>
                    {e.name}
                  </Text>
                  <Text style={styles.muted}>
                    {d.units.find((u) => u.id === e.unitId)?.name} -{" "}
                    {e.employeeId}
                  </Text>
                  {date <= today && (
                    <Text style={styles.muted}>
                      {figures.pieces.toLocaleString(numberLocale())}
                      {tr("pcs")}
                      {(admin || s.data?.employeeMoney) &&
                        ` · ${money(figures.amountPaise)}`}
                    </Text>
                  )}
                </View>
                {canAssign && !dayFor(d, e.id, date) && (
                  <TextButton
                    label={tr("Operations")}
                    onPress={() => setEmployee(e)}
                  />
                )}
              </View>
              {tasks.map((task) => (
                <View key={task.id} style={styles.between}>
                  <Text style={[styles.muted, { flex: 1 }]}>
                    {d.operations.find((o) => o.id === task.operationId)?.name}{" "}
                    - {d.lots.find((l) => l.id === task.lotId)?.code}
                  </Text>
                  {canAssign &&
                    !dayFor(d, e.id, date) &&
                    !countFor(d, task.id, date)?.quantity && (
                      <TextButton
                        label={tr("Remove")}
                        onPress={() =>
                          open({
                            title: tr("Remove operation"),
                            description: tr(
                              "Only operations with no logged or approved pieces can be removed.",
                            ),
                            fields: [
                              {
                                key: "reason",
                                label: tr("Reason"),
                                required: true,
                              },
                            ],
                            submitLabel: tr("Remove operation"),
                            onSubmit: async (v) => {
                              await s.workspaceAct({
                                type: "deactivate_assignment",
                                id: task.id,
                                reason: v.reason,
                              });
                              notify(tr("Operation removed."));
                            },
                          })
                        }
                        destructive
                      />
                    )}
                </View>
              ))}
              {!tasks.length && (
                <Text style={styles.muted}>
                  {tr("No operations assigned yet.")}
                </Text>
              )}
            </View>
          );
        })}
      {employee && (
        <AssignOperations
          employee={employee}
          workDate={date}
          onClose={() => setEmployee(null)}
          notify={notify}
        />
      )}
    </>
  );
}
export function AssignOperations({
  employee,
  onClose,
  notify,
  workDate = factoryDate(),
}: {
  employee: Employee;
  onClose: () => void;
  notify: (s: string) => void;
  /** The day to assign for; today when left out. */
  workDate?: string;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!;
  // Only the styles planned for this employee's line on that day can be picked.
  const plannedIds = plannedStyleIds(d, employee.unitId, workDate),
    plannedStyles = plannedIds
      .map((id) => d.styles.find((st) => st.id === id))
      .filter((st): st is NonNullable<typeof st> => !!st);
  const [styleId, setStyleId] = useState(plannedStyles[0]?.id ?? "");
  // Ticks are kept per style so several styles can be added in one visit.
  const [picks, setPicks] = useState<Record<string, string[]>>({}),
    [materials, setMaterials] = useState<Record<string, string>>({}),
    [showAdded, setShowAdded] = useState(true),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saveDefaults, setSaveDefaults] = useState(false);
  const materialOf = (sid: string) =>
      materials[sid] ?? d.styles.find((st) => st.id === sid)?.material ?? "",
    selected = picks[styleId] ?? [],
    setSelected = (next: string[]) =>
      setPicks((p) => ({ ...p, [styleId]: next }));
  const assigned = operationsFor(d, employee.id, workDate),
    styleOf = (operationId: string) =>
      d.operations.find((o) => o.id === operationId)?.styleId,
    addedHere = new Set(
      assigned
        .filter((a) => styleOf(a.operationId) === styleId)
        .map((a) => a.operationId),
    ),
    // Assignments for a style that has left the plan still show, read only.
    leftOver = assigned.filter((a) => {
      const sid = styleOf(a.operationId);
      return !!sid && !plannedIds.includes(sid);
    });
  const defaults = d.operationDefaults?.find(
    (x) => x.employeeId === employee.id && x.styleId === styleId,
  );
  const operations = d.operations
    .filter((o) => o.styleId === styleId)
    .sort((a, b) => a.sequence - b.sequence);
  const matches = (o: (typeof operations)[number]) =>
    (operationCode(o) + " " + o.name + " " + (o.steps || []).join(" "))
      .toLowerCase()
      .includes(search.toLowerCase());
  const newOps = operations.filter((o) => !addedHere.has(o.id) && matches(o)),
    shownOps = operations.filter(
      (o) => matches(o) && (showAdded || !addedHere.has(o.id)),
    ),
    // Everything ticked, across every planned style, not yet added.
    toSave = plannedIds
      .map((sid) => ({
        styleId: sid,
        operationIds: (picks[sid] ?? []).filter(
          (id) =>
            !assigned.some((a) => a.operationId === id) &&
            d.operations.some((o) => o.id === id && o.styleId === sid),
        ),
      }))
      .filter((x) => x.operationIds.length),
    total = toSave.reduce((n, x) => n + x.operationIds.length, 0);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      for (const part of toSave) {
        await s.workspaceAct({
          type: "assign_operations",
          employeeId: employee.id,
          styleId: part.styleId,
          operationIds: part.operationIds,
          workDate,
          saveDefaults,
          material: materialOf(part.styleId),
        });
        // Saved styles drop out so a later failure leaves only the rest ticked.
        setPicks((p) => ({ ...p, [part.styleId]: [] }));
      }
      notify(tr("Operations saved."));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={tr("Operations for {{value0}}", {
        value0: employee.name.split(" ")[0],
      })}
      footer={
        <>
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: c.danger }}>
              {errorText(error)}
            </Text>
          )}
          <ActionButton
            disabled={busy || !total}
            label={
              busy
                ? tr("Saving…")
                : total
                  ? total === 1
                    ? tr("Add 1 operation")
                    : tr("Add {{value0}} operations", { value0: total })
                  : tr("Add operations")
            }
            onPress={() => void save()}
          />
        </>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!plannedStyles.length ? (
        <Text style={styles.muted}>
          {tr("Add styles for this day first, then choose operations.")}
        </Text>
      ) : (
        <>
          <ChoiceField
            label={tr("Style")}
            value={styleId}
            onChange={(id) => {
              setStyleId(id);
              setSearch("");
            }}
            options={plannedStyles.map((st) => ({
              id: st.id,
              label: st.code + " · " + st.name,
            }))}
          />
          <Text style={styles.label}>{tr("Cloth / material")}</Text>
          <TextInput
            value={materialOf(styleId)}
            onChangeText={(v) => setMaterials((m) => ({ ...m, [styleId]: v }))}
            maxLength={120}
            accessibilityLabel={tr("Cloth / material")}
            placeholder={tr("Optional, for today’s cloth")}
            style={styles.input}
          />
          <Search
            value={search}
            onChange={setSearch}
            placeholder={tr("Find operation or OP code")}
          />
          <Checkbox
            checked={showAdded}
            onChange={setShowAdded}
            label={tr("Show added operations")}
          >
            <Text style={[styles.body, { flex: 1 }]}>
              {tr("Show added operations")}
            </Text>
          </Checkbox>
          {!!operations.length && (
            <Text style={styles.muted}>
              {tr("Added {{value0}} of {{value1}}", {
                value0: addedHere.size,
                value1: operations.length,
              })}
            </Text>
          )}
          {!!defaults?.operationIds.length && (
            <TextButton
              label={tr("Use defaults")}
              onPress={() =>
                setSelected(
                  defaults.operationIds.filter((id) =>
                    newOps.some((o) => o.id === id),
                  ),
                )
              }
            />
          )}
          {!!newOps.length && (
            <SelectAllRow
              onAll={() =>
                setSelected([
                  ...new Set([...selected, ...newOps.map((o) => o.id)]),
                ])
              }
              onClear={() =>
                setSelected(
                  selected.filter((id) => !newOps.some((o) => o.id === id)),
                )
              }
            />
          )}
          {shownOps.map((o) => {
            const added = addedHere.has(o.id),
              checked = added || selected.includes(o.id);
            return (
              <View
                key={o.id}
                style={{
                  borderBottomWidth: 1,
                  borderColor: line,
                  paddingVertical: 4,
                }}
              >
                <Checkbox
                  checked={checked}
                  disabled={busy || added}
                  label={
                    operationCode(o) +
                    " " +
                    o.name +
                    (added ? ", " + tr("Added") : "")
                  }
                  onChange={(on) =>
                    setSelected(
                      on
                        ? [...selected, o.id]
                        : selected.filter((id) => id !== o.id),
                    )
                  }
                >
                  <View style={{ flex: 1, gap: 3, paddingVertical: 6 }}>
                    <Text
                      style={{
                        color: c.primary,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {operationCode(o)}
                    </Text>
                    <Text style={styles.body}>{o.name}</Text>
                    {added && <Pill label={tr("Added")} tone="info" />}
                    {!!o.steps?.length && (
                      <Text style={styles.muted}>{o.steps.join(" · ")}</Text>
                    )}
                  </View>
                </Checkbox>
              </View>
            );
          })}
          {!operations.length && (
            <Text style={styles.muted}>
              {tr(
                "No operations in this style. Ask the admin to add them in Styles.",
              )}
            </Text>
          )}
          <Checkbox
            checked={saveDefaults}
            onChange={setSaveDefaults}
            label={tr("Save as daily defaults")}
          >
            <Text style={[styles.body, { flex: 1 }]}>
              {tr("Save as daily defaults")}
            </Text>
          </Checkbox>
        </>
      )}
      {!!leftOver.length && (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>
            {tr("This style is no longer in today's plan")}
          </Text>
          {leftOver.map((a) => {
            const o = d.operations.find((x) => x.id === a.operationId);
            return (
              <Text key={a.id} style={styles.muted}>
                {o ? operationCode(o) + " " + o.name : a.operationId} ·{" "}
                {tr("Added")}
              </Text>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
export function AdminDay({ notify }: Tools) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    [tab, setTab] = useState("changes"),
    [selected, setSelected] = useState<DayApproval | null>(null),
    pending = (d.days ?? []).filter((day) => day.status === "needs_admin"),
    [assign, setAssign] = useState<Employee | null>(null);
  const employees = d.employees.filter((e) => e.active && e.role === "worker");
  return (
    <>
      <View style={styles.row}>
        <TextButton
          label={tr("Changes to check ({{value0}})", {
            value0: pending.length,
          })}
          onPress={() => setTab("changes")}
        />
        <TextButton label={tr("All counts")} onPress={() => setTab("work")} />
      </View>
      {tab === "changes" ? (
        pending.length ? (
          pending.map((day) => {
            const e = d.employees.find((e) => e.id === day.employeeId),
              captain = d.employees.find((e) => e.id === day.captainId);
            return (
              <View
                key={day.id}
                style={{
                  gap: 12,
                  paddingBottom: 22,
                  borderBottomWidth: 1,
                  borderColor: line,
                }}
              >
                <View>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>
                    {e?.name}
                  </Text>
                  <Text style={styles.muted}>
                    {captain?.name}
                    {tr("changed")}{" "}
                    {
                      day.tasks.filter(
                        (t) => t.enteredQuantity !== t.captainQuantity,
                      ).length
                    }{" "}
                    {day.tasks.filter(
                      (t) => t.enteredQuantity !== t.captainQuantity,
                    ).length === 1
                      ? tr("operation count")
                      : tr("operation counts")}{" "}
                    · {day.workDate}
                  </Text>
                </View>
                {day.tasks
                  .filter((t) => t.enteredQuantity !== t.captainQuantity)
                  .map((t) => (
                    <View style={styles.between} key={t.assignmentId}>
                      <Text style={[styles.body, { flex: 1 }]}>
                        {
                          d.operations.find(
                            (o) =>
                              o.id ===
                              d.assignments.find((a) => a.id === t.assignmentId)
                                ?.operationId,
                          )?.name
                        }
                      </Text>
                      <Text
                        style={{ fontSize: 20, color: ink, fontWeight: "600" }}
                      >
                        {t.enteredQuantity} → {t.captainQuantity}
                      </Text>
                    </View>
                  ))}
                <ActionButton
                  label={tr("Review change")}
                  onPress={() => setSelected(day)}
                />
              </View>
            );
          })
        ) : (
          <Text style={styles.body}>{tr("No captain changes to check.")}</Text>
        )
      ) : (
        <>
          {employees.map((e) => {
            const tasks = operationsFor(d, e.id),
              day = dayFor(d, e.id),
              qty = tasks.reduce(
                (n, t) => n + (countFor(d, t.id)?.quantity ?? 0),
                0,
              );
            return (
              <View
                key={e.id}
                style={{
                  ...styles.card,
                  gap: 7,
                }}
              >
                <View style={styles.between}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 17, fontWeight: "600", color: ink }}
                    >
                      {e.name}
                    </Text>
                    <Text style={styles.muted}>
                      {d.units.find((u) => u.id === e.unitId)?.name} · {qty}{" "}
                      {tr("pieces")}
                    </Text>
                  </View>
                  <TextButton
                    label={day ? tr("View day") : tr("Add operation")}
                    onPress={() => (day ? setSelected(day) : setAssign(e))}
                  />
                </View>
                <Text style={styles.muted}>
                  {day?.status === "needs_admin"
                    ? tr("Captain changed counts \u2014 review needed")
                    : day
                      ? tr("Approved")
                      : tr("Captain has not checked yet")}
                </Text>
              </View>
            );
          })}
          <TextButton
            label={tr("Export today\u2019s wages")}
            onPress={() =>
              void exportCsv(`crewgrain-approved-${factoryDate()}`, [
                ["Employee", "Date", "Status", "Approved INR"],
                ...(d.days ?? [])
                  .filter(
                    (day) =>
                      day.status !== "needs_admin" &&
                      day.workDate === factoryDate(),
                  )
                  .map((day) => [
                    d.employees.find((e) => e.id === day.employeeId)?.name ??
                      "",
                    day.workDate,
                    day.status,
                    approvedPay(day) / 100,
                  ]),
              ]).catch((e) => notify(e.message))
            }
          />
        </>
      )}
      {selected && (
        <AdminReview
          day={selected}
          onClose={() => setSelected(null)}
          notify={notify}
        />
      )}
      {assign && (
        <AssignOperations
          employee={assign}
          onClose={() => setAssign(null)}
          notify={notify}
        />
      )}
    </>
  );
}
export function AdminReview({
  day,
  onClose,
  notify,
}: {
  day: DayApproval;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const difference = day.tasks.reduce(
    (n, t) => n + (t.captainQuantity - t.enteredQuantity) * t.ratePaise,
    0,
  );
  async function decide(decision: "employee") {
    setBusy(true);
    try {
      await s.dailyAct({
        type: "admin_decide_day",
        id: day.id,
        decision,
        note: tr("Admin kept employee count"),
      });
      notify(tr("Employee’s original count kept."));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={
        d.employees.find((e) => e.id === day.employeeId)?.name ??
        tr("Check changes")
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        error || day.status === "needs_admin" ? (
          <>
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: c.danger }}>
                {errorText(error)}
              </Text>
            )}
            {day.status === "needs_admin" && (
              <>
                <ActionButton
                  label={tr("Keep employee’s recorded pieces")}
                  secondary
                  disabled={busy}
                  onPress={() => void decide("employee")}
                />
              </>
            )}
          </>
        ) : undefined
      }
    >
      <Text style={styles.muted}>
        {d.employees.find((e) => e.id === day.captainId)?.name} · {day.workDate}{" "}
        ·{" "}
        {formatTime(new Date(day.checkedAt), {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
      {day.tasks
        .filter(
          (t) =>
            day.status !== "needs_admin" ||
            t.enteredQuantity !== t.captainQuantity,
        )
        .map((t) => (
          <View
            key={t.assignmentId}
            style={{
              gap: 12,
              paddingBottom: 18,
              borderBottomWidth: 1,
              borderColor: line,
            }}
          >
            <Text style={[styles.body, { fontWeight: "600" }]}>
              {
                d.operations.find(
                  (o) =>
                    o.id ===
                    d.assignments.find((a) => a.id === t.assignmentId)
                      ?.operationId,
                )?.name
              }
            </Text>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.muted}>{tr("Employee entered")}</Text>
                <Text style={{ fontSize: 30, color: ink, fontWeight: "600" }}>
                  {t.enteredQuantity}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.muted}>{tr("Captain checked")}</Text>
                <Text
                  style={{
                    fontSize: 30,
                    color:
                      t.enteredQuantity === t.captainQuantity ? ink : c.signal,
                    fontWeight: "600",
                  }}
                >
                  {t.captainQuantity}
                </Text>
              </View>
            </View>
            {!!t.reason && <Text style={styles.body}>{t.reason}</Text>}
          </View>
        ))}
      <Text style={styles.body}>
        {tr("Wage difference:")}
        {difference < 0 ? "−" : ""}
        {money(Math.abs(difference))}
      </Text>
      <Text style={styles.muted}>
        {day.status === "needs_admin"
          ? tr("Not payable until you check.")
          : tr("Attendance: {{value0}}. Final count: {{value1}}.", {
              value0: day.attendance,
              value1:
                day.adminDecision === "employee"
                  ? tr("employee\u2019s count")
                  : tr("captain\u2019s count"),
            })}
      </Text>
    </Sheet>
  );
}
export function People({
  open,
  notify,
  initialLine = "all",
}: Tools & { initialLine?: string }) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    { width: windowWidth } = useWindowDimensions(),
    [listing, setListing] = useState({ key: "", visible: 30 }),
    [filtersOpen, setFiltersOpen] = useState(false),
    [role, setRole] = useState("all"),
    [status, setStatus] = useState("active"),
    [selectedLine, setSelectedLine] = useState(initialLine),
    [search, setSearch] = useState(""),
    [assign, setAssign] = useState<Employee | null>(null),
    [employee, setEmployee] = useState<Employee | null>(null),
    [detail, setDetail] = useState<Employee | null>(null),
    [link, setLink] = useState<{
      employee: Employee;
      url: string;
    } | null>(null);
  const listKey = JSON.stringify([role, status, selectedLine, search]);
  const visible = listing.key === listKey ? listing.visible : 30;
  function add() {
    const lines = d.units.filter((u) => u.active);
    open({
      title: tr("Add employee"),
      description: tr(
        "Their ID is created automatically: the first letter of the name and three digits.",
      ),
      fields: [
        { key: "name", label: tr("Name"), required: true },
        { key: "phone", label: tr("Phone") },
        {
          key: "unitId",
          label: tr("Line"),
          required: true,
          value: selectedLine === "all" ? lines[0]?.id : selectedLine,
          options: lines.map((u) => ({ value: u.id, label: u.name })),
        },
        {
          key: "role",
          label: tr("Role"),
          value: "worker",
          options: [
            { value: "worker", label: tr("Employee") },
            { value: "captain", label: tr("Captain") },
          ],
        },
      ],
      submitLabel: tr("Add employee"),
      onSubmit: async (v) => {
        await s.act({
          type: "add_employee",
          name: v.name,
          phone: v.phone,
          employeeId: nextEmployeeId(d, v.name),
          unitId: v.unitId,
          role: v.role as "worker" | "captain",
          operation: "",
        });
        notify(tr("Employee added."));
      },
    });
  }
  const filteredEmployees = d.employees.filter(
    (e) =>
      e.role !== "admin" &&
      !e.deletedAt &&
      (role === "all" || e.role === role) &&
      (selectedLine === "all" || e.unitId === selectedLine) &&
      (status === "all" || (status === "active" ? e.active : !e.active)) &&
      `${e.name} ${e.employeeId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const desktopTable =
    Platform.OS === "web" && windowWidth >= ADMIN_DESKTOP_BREAKPOINT;
  return (
    <>
      {desktopTable ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Text style={styles.muted}>
            {filteredEmployees.length}
            {tr("employees")}
          </Text>
          <ActionButton
            label={tr("Add employee")}
            icon="person-add-outline"
            onPress={add}
          />
        </View>
      ) : (
        <ActionButton label={tr("Add employee")} icon="add" onPress={add} />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Search
            value={search}
            onChange={setSearch}
            placeholder={tr("Find employee")}
          />
        </View>
        <IconButton
          name="filter-outline"
          label={tr("Filters")}
          onPress={() => setFiltersOpen(true)}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill
          label={
            status === "active"
              ? tr("Active")
              : status === "archived"
                ? tr("Archived")
                : tr("All")
          }
          tone="info"
        />
        {role !== "all" && (
          <Pill label={role === "captain" ? tr("Captains") : tr("Employees")} />
        )}
        {selectedLine !== "all" && (
          <Pill
            label={
              d.units.find((u) => u.id === selectedLine)?.name || tr("Line")
            }
          />
        )}
      </View>
      {filtersOpen && (
        <Sheet title={tr("Filters")} onClose={() => setFiltersOpen(false)}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <ChoiceField
                label={tr("Role")}
                value={role}
                onChange={setRole}
                options={[
                  { id: "all", label: tr("Everyone") },
                  { id: "worker", label: tr("Employees") },
                  { id: "captain", label: tr("Captains") },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ChoiceField
                label={tr("Status")}
                value={status}
                onChange={setStatus}
                options={[
                  { id: "active", label: tr("Active") },
                  { id: "archived", label: tr("Archived") },
                  { id: "all", label: tr("All") },
                ]}
              />
            </View>
          </View>
          <ChoiceField
            label={tr("Line")}
            value={selectedLine}
            onChange={setSelectedLine}
            options={[
              { id: "all", label: tr("All lines") },
              ...d.units.map((u) => ({ id: u.id, label: u.name })),
            ]}
          />

          <ActionButton
            label={tr("Done")}
            onPress={() => setFiltersOpen(false)}
          />
        </Sheet>
      )}
      {desktopTable ? (
        <Table style={{ minWidth: 760 }}>
          <TableHeader>
            <TableHead style={{ flex: 1.55 }}>{tr("Employee")}</TableHead>
            <TableHead style={{ flex: 0.85 }}>{tr("ID")}</TableHead>
            <TableHead style={{ flex: 0.8 }}>{tr("Role")}</TableHead>
            <TableHead style={{ flex: 1.15 }}>{tr("Line")}</TableHead>
            <TableHead style={{ flex: 0.7 }}>{tr("Status")}</TableHead>
            <TableHead style={{ width: 92 }}>{tr("Actions")}</TableHead>
          </TableHeader>
          {filteredEmployees.slice(0, visible).map((e) => (
            <TableRow key={e.id} style={{ minHeight: 62 }}>
              <TableCell style={{ flex: 1.55 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 13, fontWeight: "600", color: ink }}
                >
                  {e.name}
                </Text>
              </TableCell>
              <TableCell style={{ flex: 0.85 }}>
                <Text numberOfLines={1} style={styles.muted}>
                  {e.employeeId}
                </Text>
              </TableCell>
              <TableCell style={{ flex: 0.8 }}>
                <Text style={{ fontSize: 12, color: ink }}>
                  {e.role === "captain" ? tr("Captain") : tr("Employee")}
                </Text>
              </TableCell>
              <TableCell style={{ flex: 1.15 }}>
                <Text numberOfLines={1} style={styles.muted}>
                  {d.units.find((u) => u.id === e.unitId)?.name ??
                    tr("Unassigned")}
                </Text>
              </TableCell>
              <TableCell style={{ flex: 0.7 }}>
                <Text
                  style={{
                    color: e.active ? c.success : c.muted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {e.active ? tr("Active") : tr("Archived")}
                </Text>
              </TableCell>
              <TableCell style={{ width: 92 }}>
                <TextButton
                  label={tr("Manage")}
                  onPress={() => setEmployee(e)}
                />
              </TableCell>
            </TableRow>
          ))}
          {filteredEmployees.length === 0 && (
            <View style={{ padding: 24 }}>
              <Text style={styles.muted}>
                {tr("No employees match that search.")}
              </Text>
            </View>
          )}
        </Table>
      ) : (
        filteredEmployees.slice(0, visible).map((e) => (
          <View
            key={e.id}
            style={{
              ...styles.card,
              gap: 5,
            }}
          >
            <View style={styles.between}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("{{value0}} details", {
                  value0: e.name,
                })}
                onPress={() => setDetail(e)}
                style={{ flex: 1 }}
              >
                <Text style={{ fontSize: 17, fontWeight: "600", color: ink }}>
                  {e.name}
                </Text>
                <Text style={styles.muted}>
                  {e.employeeId} ·{" "}
                  {e.role === "captain"
                    ? tr("Captain")
                    : d.units.find((u) => u.id === e.unitId)?.name}
                  {e.active ? "" : tr(" · Archived")}
                </Text>
              </Pressable>
              <TextButton label={tr("Manage")} onPress={() => setEmployee(e)} />
            </View>
          </View>
        ))
      )}
      {filteredEmployees.length > visible && (
        <TextButton
          label={tr("More employees")}
          onPress={() => setListing({ key: listKey, visible: visible + 30 })}
        />
      )}
      {!desktopTable && filteredEmployees.length === 0 && (
        <Card>
          <Text style={styles.muted}>
            {tr("No employees match that search.")}
          </Text>
        </Card>
      )}
      {employee && (
        <Sheet title={employee.name} onClose={() => setEmployee(null)}>
          <ActionButton
            label={tr("Role and line")}
            secondary
            onPress={() => {
              const e = employee;
              setEmployee(null);
              open({
                title: tr("Role and line"),
                fields: [
                  {
                    key: "role",
                    label: tr("Role"),
                    value: e.role,
                    required: true,
                    options: [
                      { value: "worker", label: tr("Employee") },
                      { value: "captain", label: tr("Captain") },
                    ],
                  },
                  {
                    key: "unitId",
                    label: tr("Line"),
                    value: e.unitId,
                    required: true,
                    options: d.units
                      .filter((u) => u.active)
                      .map((u) => ({ value: u.id, label: u.name })),
                  },
                ],
                submitLabel: tr("Save changes"),
                onSubmit: async (v) => {
                  await s.workspaceAct({
                    type: "manage_employee",
                    id: e.id,
                    role: v.role as "worker" | "captain",
                    unitId: v.unitId,
                  });
                  notify(tr("Employee updated."));
                },
              });
            }}
          />

          <ActionButton
            label={tr("Edit employee details")}
            secondary
            onPress={() => {
              const e = employee;
              setEmployee(null);
              open({
                title: tr("Edit employee"),
                fields: [
                  {
                    key: "name",
                    label: tr("Name"),
                    value: e.name,
                    required: true,
                  },
                  { key: "phone", label: tr("Phone"), value: e.phone },
                ],
                submitLabel: tr("Save changes"),
                onSubmit: async (v) => {
                  await s.act({
                    type: "update_employee",
                    id: e.id,
                    name: v.name,
                    unitId: e.unitId,
                    operation: e.operation,
                    phone: v.phone,
                    reason: "Details updated",
                  });
                  notify(tr("Employee updated."));
                },
              });
            }}
          />
          {employee.role === "worker" && (
            <ActionButton
              label={tr("Assign operations")}
              onPress={() => {
                const e = employee;
                setEmployee(null);
                setAssign(e);
              }}
            />
          )}
          <ActionButton
            label={tr("Link their phone")}
            secondary
            onPress={() =>
              void s
                .issuePhone(employee.id)
                .then((url) => {
                  setLink({ employee, url });
                  setEmployee(null);
                })
                .catch((e) => notify(e.message))
            }
          />
          {(d.devices ?? [])
            .filter((p) => p.profileId === employee.id && !p.revokedAt)
            .map((p) => (
              <ActionButton
                key={p.id}
                label={tr("Unlink current phone")}
                secondary
                onPress={() =>
                  open({
                    title: tr("Unlink phone"),
                    description: tr(
                      "This phone will lose access. Link a new phone to restore it.",
                    ),
                    fields: [],
                    submitLabel: tr("Unlink phone"),
                    onSubmit: async () => {
                      await s.dailyAct({ type: "revoke_device", id: p.id });
                      setEmployee(null);
                      notify(tr("Phone unlinked."));
                    },
                  })
                }
              />
            ))}
          <ActionButton
            label={
              employee.active ? tr("Archive employee") : tr("Restore employee")
            }
            secondary
            onPress={() => {
              const e = employee;
              setEmployee(null);
              open({
                title: e.active
                  ? tr("Archive {{value0}}?", { value0: e.name })
                  : tr("Restore {{value0}}?", { value0: e.name }),
                description: e.active
                  ? tr(
                      "Their operations and app access stop. Saved counts and pay remain. You can restore access later.",
                    )
                  : tr("They can receive operations and log in again."),
                fields: [],
                submitLabel: e.active ? tr("Archive") : tr("Restore"),
                onSubmit: async () => {
                  await s.act({
                    type: "set_employee_active",
                    id: e.id,
                    active: !e.active,
                    reason: e.active
                      ? tr("Removed from team")
                      : tr("Restored to team"),
                  });
                  notify(
                    e.active
                      ? tr("Removed from team.")
                      : tr("Restored to team."),
                  );
                },
              });
            }}
          />
          <TextButton
            label={tr("Delete employee")}
            destructive
            onPress={() => {
              const e = employee;
              setEmployee(null);
              open({
                title: tr("Delete {{value0}}?", { value0: e.name }),
                description: tr(
                  "This removes their account and phone access. Past production and pay records stay saved. This cannot be undone.",
                ),
                fields: [],
                submitLabel: tr("Delete employee"),
                destructive: true,
                onSubmit: async () => {
                  await s.workspaceAct({ type: "delete_employee", id: e.id });
                  notify(tr("Employee deleted."));
                },
              });
            }}
          />
        </Sheet>
      )}
      {detail && (
        <EmployeeDetail employee={detail} onClose={() => setDetail(null)} />
      )}
      {assign && (
        <AssignOperations
          employee={assign}
          onClose={() => setAssign(null)}
          notify={notify}
        />
      )}
      {link && (
        <Sheet
          title={tr("Link {{value0}}\u2019s phone", {
            value0: link.employee.name.split(" ")[0],
          })}
          onClose={() => setLink(null)}
        >
          <Text style={styles.body}>
            {tr(
              "Open this link on their phone within 15 minutes. It works once.",
            )}
          </Text>
          <Text selectable style={{ fontSize: 13, color: grey }}>
            {link.url}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: grey }}>
            {tr(
              "If the link does not open when tapped, copy it. Then open the Crewgrain app on their phone, choose “I have a setup link” on the sign-in screen, and paste it.",
            )}
          </Text>
          <ActionButton
            label={tr("Share setup link")}
            onPress={() => void Share.share({ message: link.url })}
          />
        </Sheet>
      )}
    </>
  );
}
