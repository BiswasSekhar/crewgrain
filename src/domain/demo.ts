import type { Snapshot, Employee, Action, EntryInput } from "./types";
import {
  dateOffset,
  factoryDate,
  validateAction,
  validateEntry,
  requireAdmin,
  requireUnit,
  editable,
  integer,
} from "./rules";

export function makeDemo(): Snapshot {
  const today = factoryDate();
  const units = ["Line 1", "Line 2", "Line 3", "Line 4"].map((name, i) => ({
    id: `u${i + 1}`,
    name,
    code: `U0${i + 1}`,
    active: true,
  }));
  const lines = units.map((u, i) => ({
    id: `l${i + 1}`,
    unitId: u.id,
    name: `Line ${i + 1}`,
  }));
  const employees: Employee[] = [
    {
      id: "admin",
      employeeId: "ZV-001",
      name: "Demo Admin",
      role: "admin",
      unitId: "u1",
      operation: "Factory admin",
      active: true,
      authReady: true,
    },
    {
      id: "captain",
      employeeId: "ZV-010",
      name: "Demo Supervisor 1",
      role: "captain",
      unitId: "u1",
      lineId: "l1",
      operation: "Unit captain",
      active: true,
      authReady: true,
    },
    {
      id: "captain2",
      employeeId: "ZV-020",
      name: "Demo Supervisor 2",
      role: "captain",
      unitId: "u2",
      lineId: "l2",
      operation: "Unit captain",
      active: true,
      authReady: true,
    },
    {
      id: "worker",
      employeeId: "ZV-041",
      name: "Demo Worker 1",
      role: "worker",
      unitId: "u1",
      lineId: "l1",
      operation: "Sleeve attachment",
      active: true,
      authReady: true,
    },
    {
      id: "w2",
      employeeId: "ZV-042",
      name: "Demo Worker 2",
      role: "worker",
      unitId: "u1",
      lineId: "l1",
      operation: "Panel stitching",
      active: true,
      authReady: true,
    },
    {
      id: "w3",
      employeeId: "ZV-043",
      name: "Demo Worker 3",
      role: "worker",
      unitId: "u2",
      lineId: "l2",
      operation: "Quality check",
      active: true,
      authReady: true,
    },
    {
      id: "w4",
      employeeId: "ZV-044",
      name: "Demo Worker 4",
      role: "worker",
      unitId: "u3",
      lineId: "l3",
      operation: "Panel stitching",
      active: true,
      authReady: true,
    },
    {
      id: "w5",
      employeeId: "ZV-045",
      name: "Demo Worker 5",
      role: "worker",
      unitId: "u4",
      lineId: "l4",
      operation: "Packing",
      active: true,
      authReady: true,
    },
  ];
  const entries = [
    ["w2", "u1", "o1", "lot1", 164],
    ["worker", "u1", "o2", "lot1", 128],
    ["w3", "u2", "o3", "lot2", 146],
    ["w4", "u3", "o1", "lot3", 172],
    ["w5", "u4", "o4", "lot4", 118],
  ].flatMap(([employeeId, unitId, operationId, lotId, quantity], i) =>
    [0, 1, 2, 3, 4].map((d) => ({
      id: `e${i}-${d}`,
      employeeId: String(employeeId),
      unitId: String(unitId),
      operationId: String(operationId),
      lotId: String(lotId),
      quantity: Number(quantity) - d * 7,
      workDate: dateOffset(-d),
      ratePaise: [350, 425, 200, 350, 150][i],
      status: (d === 0 ? "pending" : "approved") as "pending" | "approved",
      createdAt: `${dateOffset(-d)}T05:30:00Z`,
    })),
  );
  return {
    units,
    lines,
    employees,
    styles: [
      {
        id: "s1",
        name: "Everyday kurta",
        code: "ZV-026",
        color: "#DBC4AA",
        notes: "Cotton · autumn collection",
        category: "Kurta",
      },
      {
        id: "s2",
        name: "Linen co-ord",
        code: "ZV-031",
        color: "#9BAEA3",
        notes: "Linen blend · relaxed fit",
        category: "Co-ord set",
      },
    ],
    operations: [
      {
        id: "o1",
        styleId: "s1",
        name: "Panel stitching",
        sequence: 1,
        ratePaise: 350,
        prerequisiteIds: [],
      },
      {
        id: "o2",
        styleId: "s1",
        name: "Sleeve attachment",
        sequence: 2,
        ratePaise: 425,
        prerequisiteIds: ["o1"],
      },
      {
        id: "o3",
        styleId: "s1",
        name: "Quality check",
        sequence: 3,
        ratePaise: 200,
        prerequisiteIds: ["o2"],
      },
      {
        id: "o4",
        styleId: "s1",
        name: "Packing",
        sequence: 4,
        ratePaise: 150,
        prerequisiteIds: ["o3"],
      },
    ],
    lots: units.map((u, i) => ({
      id: `lot${i + 1}`,
      styleId: "s1",
      unitId: u.id,
      lineId: `l${i + 1}`,
      code: `LOT-10${i + 1}`,
      totalPieces: 600,
      status: "active",
    })),
    assignments: [
      ["worker", "o2", "lot1"],
      ["w2", "o1", "lot1"],
      ["w3", "o3", "lot2"],
      ["w4", "o1", "lot3"],
      ["w5", "o4", "lot4"],
    ].map(([employeeId, operationId, lotId], i) => ({
      id: `a${i}`,
      employeeId,
      operationId,
      lotId,
      active: true,
    })),
    entries,
    requests: [
      {
        id: "r1",
        employeeId: "ZV-051",
        name: "Demo Applicant 1",
        unitId: "u1",
        operation: "Panel stitching",
        status: "pending",
        requestedBy: "captain",
      },
      {
        id: "r2",
        employeeId: "ZV-052",
        name: "Demo Applicant 2",
        unitId: "u2",
        operation: "Quality check",
        status: "pending",
        requestedBy: "captain2",
      },
    ],
    reports: [
      {
        id: "rep1",
        unitId: "u1",
        captainId: "captain",
        workDate: today,
        completed: 292,
        packed: 112,
        scheduled: 2,
        present: 2,
        blockers: "Need replacement needles for machine 04.",
        notes: "Sleeve work continues after lunch. No rework pending.",
        status: "submitted",
        submittedAt: `${today}T08:00:00Z`,
        revision: 1,
      },
      {
        id: "rep2",
        unitId: "u2",
        captainId: "captain2",
        workDate: today,
        completed: 146,
        packed: 130,
        scheduled: 1,
        present: 1,
        blockers: "",
        notes: "Quality checks complete for the morning batch.",
        status: "reviewed",
        submittedAt: `${today}T07:00:00Z`,
        reviewerNote: "Count checked against dispatch sheet.",
        revision: 1,
      },
    ],
    audit: [],
    flags: [],
  };
}

export function demoAction(
  source: Snapshot,
  actor: Employee,
  action: Action,
  id: string,
  now = new Date(),
): Snapshot {
  validateAction(action);
  if (!actor.active) throw new Error("This account is inactive.");
  const s = JSON.parse(JSON.stringify(source)) as Snapshot;
  const at = now.toISOString();
  const audit = (detail: string) =>
    s.audit.unshift({
      id,
      actorId: actor.id,
      action: action.type,
      entityId: "id" in action ? action.id : id,
      at,
      detail,
    });
  if (action.type === "add_employee" || action.type === "request_employee") {
    requireUnit(actor, action.unitId);
    if (
      s.employees.some(
        (e) => e.employeeId.toUpperCase() === action.employeeId.toUpperCase(),
      ) ||
      s.requests.some(
        (r) =>
          r.employeeId.toUpperCase() === action.employeeId.toUpperCase() &&
          r.status !== "rejected",
      )
    )
      throw new Error("This employee ID already exists.");
    if (!s.units.some((u) => u.id === action.unitId && u.active))
      throw new Error("Choose an active unit.");
    if (action.type === "add_employee") {
      requireAdmin(actor);
      if (
        action.role === "captain" &&
        s.employees.some(
          (e) => e.active && e.role === "captain" && e.unitId === action.unitId,
        )
      )
        throw new Error("This unit already has an active captain.");
      s.employees.unshift({
        id,
        employeeId: action.employeeId.toUpperCase(),
        name: action.name.trim(),
        role: action.role,
        unitId: action.unitId,
        lineId: action.lineId,
        operation: action.operation,
        phone: action.phone,
        active: true,
        authReady: false,
      });
    } else
      s.requests.unshift({
        id,
        employeeId: action.employeeId.toUpperCase(),
        name: action.name.trim(),
        unitId: action.unitId,
        operation: action.operation,
        phone: action.phone,
        status: "pending",
        requestedBy: actor.id,
      });
  } else if (action.type === "review_request") {
    requireAdmin(actor);
    const r = s.requests.find((r) => r.id === action.id);
    if (!r) throw new Error("Request not found.");
    requireUnit(actor, r.unitId);
    if (r.status !== "pending" && actor.role !== "admin")
      throw new Error("This request has already been reviewed.");
    if (r.status !== "pending" && !action.reason.trim())
      throw new Error("An admin override needs a reason.");
    const existing = s.employees.find((e) => e.employeeId === r.employeeId);
    if (action.decision === "approved") {
      if (existing) existing.active = true;
      else
        s.employees.unshift({
          id: `employee-${r.id}`,
          employeeId: r.employeeId,
          name: r.name,
          role: "worker",
          unitId: r.unitId,
          operation: r.operation,
          phone: r.phone,
          active: true,
          authReady: false,
        });
    } else if (existing) existing.active = false;
    Object.assign(r, {
      status: action.decision,
      reviewedBy: actor.id,
      reviewedAt: at,
      reason: action.reason,
    });
  } else if (action.type === "update_employee") {
    requireAdmin(actor);
    const e = s.employees.find((e) => e.id === action.id);
    if (!e) throw new Error("Employee not found.");
    if (!action.reason.trim())
      throw new Error("Enter a reason for the change.");
    if (!s.units.some((u) => u.id === action.unitId && u.active))
      throw new Error("Choose an active unit.");
    if (
      e.role === "captain" &&
      e.active &&
      s.employees.some(
        (x) =>
          x.id !== e.id &&
          x.active &&
          x.role === "captain" &&
          x.unitId === action.unitId,
      )
    )
      throw new Error("This unit already has an active captain.");
    if (
      e.unitId !== action.unitId &&
      (s.counts || []).some(
        (c) =>
          c.employeeId === e.id &&
          c.quantity > 0 &&
          !(s.days || []).some(
            (d) =>
              d.employeeId === e.id &&
              d.workDate === c.workDate &&
              ["approved", "admin_approved"].includes(d.status),
          ),
      )
    )
      throw new Error(
        "Approve pending counts before changing this employee’s role or line.",
      );
    if (e.unitId !== action.unitId)
      s.assignments
        .filter((x) => x.employeeId === e.id)
        .forEach((x) => (x.active = false));
    Object.assign(e, {
      name: action.name,
      unitId: action.unitId,
      lineId: action.lineId,
      operation: action.operation,
      phone: action.phone,
    });
  } else if (action.type === "set_employee_active") {
    requireAdmin(actor);
    const e = s.employees.find((e) => e.id === action.id);
    if (!e) throw new Error("Employee not found.");
    if (e.id === actor.id)
      throw new Error("You cannot deactivate your own account.");
    if (!action.reason.trim()) throw new Error("Enter a reason.");
    if (e.deletedAt) throw new Error("Deleted employees cannot be restored.");
    if (
      action.active &&
      e.role === "captain" &&
      s.employees.some(
        (x) =>
          x.id !== e.id &&
          x.active &&
          x.role === "captain" &&
          x.unitId === e.unitId,
      )
    )
      throw new Error("This line already has a captain.");
    e.active = action.active;
  } else if (action.type === "submit_report") {
    requireUnit(actor, action.unitId);
    if (actor.role !== "captain")
      throw new Error("Daily reports are submitted by the unit captain.");
    if (
      action.workDate > factoryDate(now) ||
      action.workDate < dateOffset(-2, factoryDate(now))
    )
      throw new Error("Reports must be for today or the previous two days.");
    let r = s.reports.find(
      (r) => r.unitId === action.unitId && r.workDate === action.workDate,
    );
    if (r?.status === "reviewed")
      throw new Error("This report is reviewed and locked.");
    if (r)
      Object.assign(r, action, {
        status: "submitted",
        submittedAt: at,
        revision: r.revision + 1,
      });
    else
      s.reports.unshift({
        id,
        unitId: action.unitId,
        captainId: actor.id,
        workDate: action.workDate,
        completed: action.completed,
        packed: action.packed,
        scheduled: action.scheduled,
        present: action.present,
        blockers: action.blockers,
        notes: action.notes,
        status: "submitted",
        submittedAt: at,
        revision: 1,
      });
  } else if (action.type === "review_report") {
    requireAdmin(actor);
    const r = s.reports.find((r) => r.id === action.id);
    if (!r) throw new Error("Report not found.");
    if (r.status !== "submitted")
      throw new Error("Only a submitted report can be reviewed.");
    Object.assign(r, {
      status: action.decision,
      reviewerNote: action.reason,
      reviewedBy: actor.id,
      reviewedAt: at,
    });
  } else if (
    ["review_entry", "edit_entry", "void_entry"].includes(action.type)
  ) {
    if (!("id" in action)) throw new Error("Entry not found.");
    const e = s.entries.find((e) => e.id === action.id);
    if (!e) throw new Error("Entry not found.");
    if (e.status !== "pending")
      throw new Error(
        "Only pending entries can change. Approved rows are immutable.",
      );
    if (action.type === "review_entry") {
      requireAdmin(actor);
      e.status = action.decision;
      e.reason = action.reason;
    } else {
      if (!editable(e, actor, now))
        throw new Error("The one-hour edit window is closed. Ask your admin.");
      if (!action.reason.trim()) throw new Error("Enter a correction reason.");
      if (action.type === "edit_entry")
        e.quantity = integer(action.quantity, 1, 2000, "Quantity");
      else e.status = "void";
      e.reason = action.reason;
    }
  } else {
    requireAdmin(actor);
    if (action.type === "create_style") {
      if (s.styles.some((x) => x.code === action.code))
        throw new Error("Style code already exists.");
      s.styles.push({
        id,
        name: action.name,
        code: action.code,
        notes: action.notes,
        color: "#DBC4AA",
      });
    }
    if (action.type === "create_operation") {
      if (!s.styles.some((x) => x.id === action.styleId))
        throw new Error("Style not found.");
      s.operations.push({ id, ...action });
    }
    if (action.type === "set_rate") {
      const o = s.operations.find((o) => o.id === action.id);
      if (!o) throw new Error("Operation not found.");
      if (!action.reason.trim()) throw new Error("Enter a rate-change reason.");
      o.ratePaise = action.ratePaise;
    }
    if (action.type === "create_lot") {
      if (
        !s.lines.some(
          (l) => l.id === action.lineId && l.unitId === action.unitId,
        )
      )
        throw new Error("Choose a line in this unit.");
      if (s.lots.some((l) => l.code === action.code))
        throw new Error("Lot code already exists.");
      s.lots.push({ id, ...action, status: "active" });
    }
    if (action.type === "assign_work") {
      const e = s.employees.find(
          (e) => e.id === action.employeeId && e.role === "worker" && e.active,
        ),
        lot = s.lots.find(
          (l) => l.id === action.lotId && l.status === "active",
        ),
        op = s.operations.find((o) => o.id === action.operationId);
      if (
        !e ||
        !lot ||
        !op ||
        lot.unitId !== e.unitId ||
        lot.styleId !== op.styleId
      )
        throw new Error(
          "Worker, lot and operation must belong to the same unit/style.",
        );
      if (
        !s.assignments.some(
          (a) =>
            a.active &&
            a.employeeId === e.id &&
            a.operationId === op.id &&
            a.lotId === lot.id,
        )
      )
        s.assignments.push({
          id,
          employeeId: e.id,
          operationId: op.id,
          lotId: lot.id,
          active: true,
        });
    }
    if (action.type === "create_unit") {
      if (s.units.some((u) => u.code === action.code))
        throw new Error("Unit code already exists.");
      s.units.push({ id, name: action.name, code: action.code, active: true });
      s.lines.push({ id: `${id}-main`, name: "Main", unitId: id });
    }
    if (action.type === "create_line")
      s.lines.push({ id, name: action.name, unitId: action.unitId });
    if (action.type === "resolve_flag") {
      const f = s.flags.find((f) => f.id === action.id);
      if (!f) throw new Error("Flag not found.");
      if (!action.reason.trim()) throw new Error("Enter a resolution note.");
      f.status = "resolved";
      f.resolution = action.reason;
    }
  }
  audit(JSON.stringify(action));
  return s;
}
export function demoEntry(
  source: Snapshot,
  actor: Employee,
  input: EntryInput,
): Snapshot {
  const old = source.entries.find((e) => e.id === input.id);
  if (old) {
    if (
      old.employeeId !== actor.id ||
      old.lotId !== input.lotId ||
      old.operationId !== input.operationId ||
      old.quantity !== input.quantity ||
      old.workDate !== input.workDate
    )
      throw new Error("This submission ID is already used for different work.");
    return source;
  }
  const entry = validateEntry(source, actor, input),
    s = JSON.parse(JSON.stringify(source)) as Snapshot;
  s.entries.unshift(entry);
  const op = s.operations.find((o) => o.id === entry.operationId)!,
    lot = s.lots.find((l) => l.id === entry.lotId)!;
  const total = (o: string) =>
    s.entries
      .filter(
        (e) =>
          e.lotId === lot.id &&
          e.operationId === o &&
          ["pending", "approved"].includes(e.status),
      )
      .reduce((n, e) => n + e.quantity, 0);
  const available = op.prerequisiteIds.length
    ? Math.min(...op.prerequisiteIds.map(total))
    : lot.totalPieces;
  if (
    total(op.id) > available &&
    !s.flags.some(
      (f) =>
        f.lotId === lot.id && f.operationId === op.id && f.status === "open",
    )
  )
    s.flags.unshift({
      id: `flag-${entry.id}`,
      unitId: entry.unitId,
      lotId: lot.id,
      operationId: op.id,
      message: `${op.name} exceeds available upstream pieces. Check source entries.`,
      status: "open",
    });
  return s;
}
