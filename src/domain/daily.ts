import type { Snapshot, Employee, CounterChange, DayApproval } from "./types";
import {
  factoryDate,
  dateOffset,
  integer,
  requireUnit,
  requireAdmin,
} from "./rules";
export type DailyAction =
  | {
      type: "assign_task";
      employeeId: string;
      operationId: string;
      lotId: string;
      workDate: string;
    }
  | {
      type: "approve_day";
      employeeId: string;
      workDate: string;
      attendance: "present" | "absent";
      tasks: {
        assignmentId: string;
        quantity: number;
        expectedVersion: number;
        reason: string;
      }[];
    }
  | {
      type: "admin_decide_day";
      id: string;
      decision: "captain" | "employee";
      note: string;
    }
  | { type: "revoke_device"; id: string };
export function operationsFor(
  s: Snapshot,
  employeeId: string,
  date = factoryDate(),
) {
  return s.assignments
    .filter(
      (a) =>
        a.employeeId === employeeId &&
        a.active &&
        (!a.workDate || a.workDate === date) &&
        s.lots.some((l) => l.id === a.lotId && l.status === "active"),
    )
    .sort(
      (a, b) =>
        (s.operations.find((o) => o.id === a.operationId)?.sequence ?? 0) -
        (s.operations.find((o) => o.id === b.operationId)?.sequence ?? 0),
    );
}
export function countFor(
  s: Snapshot,
  assignmentId: string,
  date = factoryDate(),
) {
  return s.counts?.find(
    (c) => c.assignmentId === assignmentId && c.workDate === date,
  );
}
export function dayFor(s: Snapshot, employeeId: string, date = factoryDate()) {
  return s.days?.find(
    (d) => d.employeeId === employeeId && d.workDate === date,
  );
}
export function checkDate(value: string, now = new Date()) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < dateOffset(-2, factoryDate(now)) ||
    value > factoryDate(now)
  )
    throw new Error("Choose today or either of the previous two days.");
}
function clone(s: Snapshot) {
  return JSON.parse(JSON.stringify(s)) as Snapshot;
}
export function seedDaily(s: Snapshot): Snapshot {
  s.counts ??= [];
  s.days ??= [];
  s.devices ??= [];
  if (s.counts.length) return s;
  for (const a of s.assignments) {
    const own = s.entries.filter(
      (e) =>
        e.employeeId === a.employeeId &&
        e.operationId === a.operationId &&
        e.lotId === a.lotId &&
        e.workDate === factoryDate() &&
        ["pending", "approved"].includes(e.status),
    );
    if (!own.length) continue;
    s.counts.push({
      id: `count-${a.id}`,
      assignmentId: a.id,
      employeeId: a.employeeId,
      unitId: s.lots.find((l) => l.id === a.lotId)!.unitId,
      workDate: factoryDate(),
      quantity: own.reduce((n, e) => n + e.quantity, 0),
      ratePaise: own[0].ratePaise,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
  }
  // Several tasks for the same employee are a normal work day.
  for (const op of ["o1", "o3"])
    if (
      !s.assignments.some(
        (a) =>
          a.employeeId === "worker" &&
          a.operationId === op &&
          a.lotId === "lot1",
      )
    )
      s.assignments.push({
        id: `daily-${op}`,
        employeeId: "worker",
        operationId: op,
        lotId: "lot1",
        active: true,
        workDate: factoryDate(),
        assignedBy: "captain",
      });
  return s;
}
export function applyCounter(
  s: Snapshot,
  actor: Employee,
  event: CounterChange,
  now = new Date(),
): Snapshot {
  if (!actor.active || actor.role !== "worker" || event.employeeId !== actor.id)
    throw new Error("This phone cannot change this employee’s work.");
  const previous = s.audit.find(
    (a) => a.entityId === event.id && a.action === "count_change",
  );
  if (previous) {
    const saved = JSON.parse(previous.detail);
    if (
      saved.assignmentId !== event.assignmentId ||
      saved.delta !== event.delta ||
      saved.workDate !== event.workDate ||
      saved.employeeId !== event.employeeId
    )
      throw new Error("This change ID is already used.");
    return s;
  }
  checkDate(event.workDate, now);
  integer(event.delta, -20000, 20000, "Change");
  if (event.delta === 0) throw new Error("Enter a change.");
  const assignment = operationsFor(s, actor.id, event.workDate).find(
    (a) => a.id === event.assignmentId,
  );
  if (
    !assignment ||
    assignment.operationId !== event.operationId ||
    assignment.lotId !== event.lotId ||
    s.lots.find((l) => l.id === assignment.lotId)?.unitId !== actor.unitId
  )
    throw new Error("This task is not assigned to you.");
  if (dayFor(s, actor.id, event.workDate))
    throw new Error(
      "This day has already been approved. Ask the admin about a correction.",
    );
  const result = {
    ...s,
    counts: (s.counts ?? []).map((c) => ({ ...c })),
    audit: [...s.audit],
  };
  let count = countFor(result, assignment.id, event.workDate);
  const next = (count?.quantity ?? 0) + event.delta;
  integer(next, 0, 20000, "Daily count");
  if (count) {
    count.quantity = next;
    count.version++;
    count.updatedAt = now.toISOString();
  } else {
    count = {
      id: `count-${event.id}`,
      assignmentId: assignment.id,
      employeeId: actor.id,
      unitId: actor.unitId,
      workDate: event.workDate,
      quantity: next,
      version: 1,
      ratePaise: s.operations.find((o) => o.id === assignment.operationId)!
        .ratePaise,
      updatedAt: now.toISOString(),
    };
    result.counts.push(count);
  }
  result.audit.unshift({
    id: event.id,
    actorId: actor.id,
    action: "count_change",
    entityId: event.id,
    at: now.toISOString(),
    detail: JSON.stringify({
      ...event,
      receivedAt: now.toISOString(),
      beforeQuantity: next - event.delta,
      afterQuantity: next,
      serverContext: {
        unitId: actor.unitId,
        operationId: assignment.operationId,
        styleId: s.operations.find((o) => o.id === assignment.operationId)
          ?.styleId,
        material:
          assignment.material ||
          s.styles.find(
            (st) =>
              st.id ===
              s.operations.find((o) => o.id === assignment.operationId)
                ?.styleId,
          )?.material ||
          "",
        standardSeconds: s.operations.find(
          (o) => o.id === assignment.operationId,
        )?.seconds,
      },
    }),
  });
  return result;
}
export function applyDailyAction(
  s: Snapshot,
  actor: Employee,
  action: DailyAction,
  id: string,
  now = new Date(),
): Snapshot {
  if (!actor.active) throw new Error("This account is inactive.");
  const result = clone(s);
  result.counts ??= [];
  result.days ??= [];
  if (action.type === "assign_task") {
    checkDate(action.workDate, now);
    const e = result.employees.find(
        (e) => e.id === action.employeeId && e.role === "worker" && e.active,
      ),
      lot = result.lots.find(
        (l) => l.id === action.lotId && l.status === "active",
      ),
      op = result.operations.find((o) => o.id === action.operationId);
    if (
      !e ||
      !lot ||
      !op ||
      e.unitId !== lot.unitId ||
      op.styleId !== lot.styleId
    )
      throw new Error("Choose a task and employee from the same unit.");
    requireUnit(actor, e.unitId);
    if (dayFor(result, e.id, action.workDate))
      throw new Error("This employee’s day has already been approved.");
    if (
      operationsFor(result, e.id, action.workDate).some(
        (a) => a.operationId === op.id && a.lotId === lot.id,
      )
    )
      throw new Error("This task is already assigned.");
    result.assignments.push({
      id,
      employeeId: e.id,
      operationId: op.id,
      lotId: lot.id,
      active: true,
      workDate: action.workDate,
      assignedBy: actor.id,
    });
  } else if (action.type === "approve_day") {
    if (actor.role !== "captain")
      throw new Error("The unit captain approves the day.");
    checkDate(action.workDate, now);
    const e = result.employees.find(
      (e) => e.id === action.employeeId && e.active && e.role === "worker",
    );
    if (!e) throw new Error("Employee not found.");
    requireUnit(actor, e.unitId);
    if (dayFor(result, e.id, action.workDate))
      throw new Error("This day has already been approved.");
    const assigned = operationsFor(result, e.id, action.workDate);
    if (
      !assigned.length ||
      action.tasks.length !== assigned.length ||
      new Set(action.tasks.map((t) => t.assignmentId)).size !== assigned.length
    )
      throw new Error("Tasks changed. Refresh the day before approving.");
    const checked = assigned.map((a) => {
      const proposed = action.tasks.find((t) => t.assignmentId === a.id),
        count = countFor(result, a.id, action.workDate);
      if (!proposed || (count?.version ?? 0) !== proposed.expectedVersion)
        throw new Error(
          "The employee’s count changed. Refresh before approving.",
        );
      integer(proposed.quantity, 0, 20000, "Checked count");
      const entered = count?.quantity ?? 0;
      if (entered !== proposed.quantity)
        throw new Error("Only the employee can change their recorded count.");
      if (action.attendance === "absent" && entered > 0)
        throw new Error(
          "This employee recorded work. Check attendance before approving.",
        );
      return {
        assignmentId: a.id,
        enteredQuantity: entered,
        captainQuantity: proposed.quantity,
        finalQuantity: proposed.quantity,
        ratePaise:
          count?.ratePaise ??
          result.operations.find((o) => o.id === a.operationId)!.ratePaise,
        reason: proposed.reason.trim(),
      };
    });
    if (!["present", "absent"].includes(action.attendance))
      throw new Error("Choose attendance.");
    result.days.push({
      id,
      employeeId: e.id,
      unitId: e.unitId,
      workDate: action.workDate,
      captainId: actor.id,
      checkedAt: now.toISOString(),
      attendance: action.attendance,
      status: checked.some((t) => t.enteredQuantity !== t.captainQuantity)
        ? "needs_admin"
        : "approved",
      tasks: checked,
    });
  } else if (action.type === "admin_decide_day") {
    requireAdmin(actor);
    const day = result.days.find((d) => d.id === action.id);
    if (!day || day.status !== "needs_admin")
      throw new Error("This change has already been reviewed.");
    if (action.decision !== "employee")
      throw new Error("The employee's recorded count must be kept.");
    day.tasks.forEach(
      (t) =>
        (t.finalQuantity =
          action.decision === "captain"
            ? t.captainQuantity
            : t.enteredQuantity),
    );
    Object.assign(day, {
      status: "admin_approved",
      adminId: actor.id,
      adminDecision: action.decision,
      adminNote: action.note,
      reviewedAt: now.toISOString(),
    });
  } else {
    requireAdmin(actor);
    const device = result.devices?.find((d) => d.id === action.id);
    if (!device) throw new Error("Linked phone not found.");
    device.revokedAt = now.toISOString();
  }
  result.audit.unshift({
    id,
    actorId: actor.id,
    action: action.type,
    entityId: "id" in action ? action.id : id,
    at: now.toISOString(),
    detail: JSON.stringify(action),
  });
  return result;
}
export function approvedPay(day: DayApproval) {
  return day.status === "needs_admin"
    ? 0
    : day.tasks.reduce((n, t) => n + t.finalQuantity * t.ratePaise, 0);
}

/** Compatibility for older callers; the current UI calls operationsFor. */
export { operationsFor as tasksFor };
