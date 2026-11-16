import type { Employee, Snapshot, CountCapture } from "./types";
import { requireAdmin, requireUnit } from "./rules";
import { checkDate, dayFor, operationsFor } from "./daily";

export type OperationsAction =
  | { type: "apply_line_defaults"; unitId: string; workDate: string }
  | {
      type: "manage_employee";
      id: string;
      role: "worker" | "captain";
      unitId: string;
    }
  | { type: "delete_employee"; id: string }
  | { type: "set_line_captain"; unitId: string; employeeId: string }
  | {
      type: "assign_operations";
      employeeId: string;
      styleId: string;
      operationIds: string[];
      workDate: string;
      saveDefaults: boolean;
      material?: string;
    }
  | {
      type: "save_operation_details";
      id: string;
      code: string;
      steps: string[];
    }
  | { type: "save_material"; styleId: string; material: string };

export const operationActionTypes: string[] = [
  "apply_line_defaults",
  "manage_employee",
  "delete_employee",
  "set_line_captain",
  "assign_operations",
  "save_operation_details",
  "save_material",
];
export const operationCode = (operation: { code?: string; sequence: number }) =>
  operation.code || `OP${operation.sequence}`;

/** Isolated from count edits: every role change preserves financial records. */
export function applyOperationsAction(
  source: Snapshot,
  actor: Employee,
  action: OperationsAction,
  id: string,
  now = new Date(),
): Snapshot {
  if (!actor.active || actor.deletedAt)
    throw new Error("This account is inactive.");
  let s = JSON.parse(JSON.stringify(source)) as Snapshot;
  if (action.type === "apply_line_defaults") {
    requireUnit(actor, action.unitId);
    checkDate(action.workDate, now);
    const planned = new Set(
      (s.dayPlan || [])
        .filter(
          (p) => p.unitId === action.unitId && p.workDate === action.workDate,
        )
        .map((p) => p.styleId),
    );
    const defaults = (s.operationDefaults || []).filter(
      (d) =>
        planned.has(d.styleId) &&
        s.employees.some(
          (e) =>
            e.id === d.employeeId &&
            e.unitId === action.unitId &&
            e.active &&
            !e.deletedAt &&
            e.role === "worker",
        ) &&
        !dayFor(s, d.employeeId, action.workDate),
    );
    defaults.forEach((d, i) => {
      s = applyOperationsAction(
        s,
        actor,
        {
          type: "assign_operations",
          ...d,
          workDate: action.workDate,
          saveDefaults: false,
        },
        id + "-" + i,
        now,
      );
    });
  } else if (action.type === "assign_operations") {
    checkDate(action.workDate, now);
    if ((action.material?.length ?? 0) > 120)
      throw new Error("Enter a material up to 120 characters.");
    const employee = s.employees.find(
      (e) =>
        e.id === action.employeeId &&
        e.active &&
        !e.deletedAt &&
        e.role === "worker",
    );
    if (!employee) throw new Error("Choose an active employee.");
    requireUnit(actor, employee.unitId);
    if (dayFor(s, employee.id, action.workDate))
      throw new Error("This day has already been approved.");
    if (!s.styles.some((st) => st.id === action.styleId))
      throw new Error("Style not found.");
    const ids = [...new Set(action.operationIds)];
    if (
      !ids.length ||
      ids.length > 60 ||
      ids.some(
        (op) =>
          !s.operations.some(
            (o) => o.id === op && o.styleId === action.styleId,
          ),
      )
    )
      throw new Error("Choose operations from this style.");
    let lot = s.lots.find(
      (l) =>
        l.unitId === employee.unitId &&
        l.styleId === action.styleId &&
        l.status === "active",
    );
    if (!lot) {
      lot = {
        id: `${id}-batch`,
        styleId: action.styleId,
        unitId: employee.unitId,
        lineId:
          employee.lineId ||
          s.lines.find((l) => l.unitId === employee.unitId)?.id ||
          employee.unitId,
        code: `AUTO-${id}`,
        totalPieces: 1000000,
        status: "active",
      };
      s.lots.push(lot);
    }
    const existing = operationsFor(s, employee.id, action.workDate);
    ids.forEach((operationId, i) => {
      if (
        !existing.some(
          (a) => a.operationId === operationId && a.lotId === lot!.id,
        )
      )
        s.assignments.push({
          id: `${id}-${i}`,
          employeeId: employee.id,
          operationId,
          lotId: lot!.id,
          active: true,
          workDate: action.workDate,
          assignedBy: actor.id,
          material:
            action.material?.trim() ||
            s.styles.find((st) => st.id === action.styleId)?.material ||
            "",
        });
    });
    if (action.saveDefaults)
      s.operationDefaults = [
        ...(s.operationDefaults || []).filter(
          (d) => d.employeeId !== employee.id || d.styleId !== action.styleId,
        ),
        { employeeId: employee.id, styleId: action.styleId, operationIds: ids },
      ];
  } else {
    requireAdmin(actor);
    if (
      action.type === "manage_employee" ||
      action.type === "set_line_captain"
    ) {
      const employee = s.employees.find(
        (e) =>
          e.id ===
            (action.type === "manage_employee"
              ? action.id
              : action.employeeId) &&
          !e.deletedAt &&
          e.role !== "admin",
      );
      if (!employee || !employee.active)
        throw new Error("Restore the employee before changing role or line.");
      if (!s.units.some((u) => u.id === action.unitId && u.active))
        throw new Error("Choose an active line.");
      const role = action.type === "set_line_captain" ? "captain" : action.role;
      if (
        (role !== employee.role || employee.unitId !== action.unitId) &&
        hasPendingCounts(s, employee.id)
      )
        throw new Error(
          "Approve pending counts before changing this employee’s role or line.",
        );
      const previous = s.employees.find(
        (e) =>
          e.id !== employee.id &&
          e.active &&
          e.role === "captain" &&
          e.unitId === action.unitId,
      );
      if (role === "captain" && previous) {
        if (action.type !== "set_line_captain")
          throw new Error(
            "This line already has a captain. Change the captain from Lines.",
          );
        previous.role = "worker";
      }
      if (employee.unitId !== action.unitId)
        s.assignments
          .filter((a) => a.employeeId === employee.id)
          .forEach((a) => (a.active = false));
      employee.role = role;
      employee.unitId = action.unitId;
      employee.lineId = s.lines.find((l) => l.unitId === action.unitId)?.id;
    } else if (action.type === "delete_employee") {
      const employee = s.employees.find(
        (e) => e.id === action.id && !e.deletedAt && e.role !== "admin",
      );
      if (!employee) throw new Error("Employee not found.");
      if (hasPendingCounts(s, employee.id))
        throw new Error(
          "Approve pending counts before deleting this employee.",
        );
      employee.active = false;
      employee.deletedAt = now.toISOString();
      s.devices
        ?.filter((d) => d.profileId === employee.id)
        .forEach((d) => (d.revokedAt = now.toISOString()));
      // Assignments remain available to historical payroll and production.
    } else if (action.type === "save_operation_details") {
      const operation = s.operations.find((o) => o.id === action.id);
      if (
        !operation ||
        !action.code.trim() ||
        action.code.length > 24 ||
        action.steps.length > 30
      )
        throw new Error("Enter an operation code and up to 30 actions.");
      if (
        s.operations.some(
          (o) =>
            o.id !== operation.id &&
            o.styleId === operation.styleId &&
            operationCode(o).toUpperCase() === action.code.trim().toUpperCase(),
        )
      )
        throw new Error("Operation code already exists in this style.");
      operation.code = action.code.trim().toUpperCase();
      operation.steps = action.steps.map((step) => step.trim()).filter(Boolean);
    } else if (action.type === "save_material") {
      const style = s.styles.find((st) => st.id === action.styleId);
      if (!style || action.material.length > 120)
        throw new Error("Enter a material up to 120 characters.");
      style.material = action.material.trim();
    }
  }
  s.audit.unshift({
    id,
    actorId: actor.id,
    action: action.type,
    entityId: "id" in action ? action.id : id,
    at: now.toISOString(),
    detail: JSON.stringify(action),
  });
  return s;
}

function hasPendingCounts(s: Snapshot, employeeId: string) {
  return (s.counts || []).some(
    (c) =>
      c.employeeId === employeeId &&
      c.quantity > 0 &&
      !["approved", "admin_approved"].includes(
        dayFor(s, employeeId, c.workDate)?.status || "",
      ),
  );
}

export type TimingAnchor = {
  id: string;
  assignmentId: string;
  monotonic: number;
  wall: number;
};
export function captureTiming(
  previous: TimingAnchor | undefined,
  assignmentId: string,
  source: CountCapture["source"],
  monotonic: number,
  wall: number,
): Pick<CountCapture, "timing" | "previousEventId" | "intervalMs"> {
  if (source !== "add") return { timing: "correction" };
  if (!previous) return { timing: "first" };
  const elapsed = monotonic - previous.monotonic;
  if (
    previous.assignmentId !== assignmentId ||
    elapsed < 0 ||
    elapsed > 30 * 60_000 ||
    Math.abs(wall - previous.wall - elapsed) > 5000
  )
    return { timing: "interrupted" };
  return {
    timing: "between_additions",
    previousEventId: previous.id,
    intervalMs: Math.round(elapsed),
  };
}
