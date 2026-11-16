import {
  applyOperationsAction,
  operationCode,
  operationActionTypes,
  type OperationsAction,
} from "./operations";
import { formatDate } from "../lib/i18n";
import type {
  Snapshot,
  Employee,
  FactorySettings,
  CorrectionRequest,
  DailyCount,
} from "./types";
import {
  perMinuteFor,
  taskRate,
  requireAdmin,
  requireUnit,
  factoryDate,
  dateOffset,
  integer,
} from "./rules";
import { dayFor } from "./daily";
export type WorkspaceAction =
  | OperationsAction
  | {
      type: "update_unit";
      id: string;
      name: string;
      code: string;
      active: boolean;
    }
  | {
      type: "update_line";
      id: string;
      name: string;
    }
  | {
      type: "add_line";
      unitId: string;
      name: string;
    }
  | {
      type: "rename_line";
      id: string;
      name: string;
    }
  | {
      type: "remove_line";
      id: string;
    }
  | {
      type: "rename_unit";
      id: string;
      name: string;
    }
  | {
      type: "set_day_plan";
      unitId: string;
      workDate: string;
      items: {
        styleId: string;
        count?: number;
      }[];
    }
  | {
      type: "save_style";
      id?: string;
      name: string;
      code: string;
      category: string;
      notes: string;
    }
  | {
      type: "add_operations";
      styleId: string;
      tasks: {
        name: string;
        seconds?: number;
        ratePaise?: number;
      }[];
    }
  | {
      type: "set_rate_settings";
      perMinutePaise: number;
    }
  | {
      type: "set_style_pricing";
      styleId: string;
      perMinutePaise: number | null;
    }
  | {
      type: "set_task_pricing";
      id: string;
      seconds?: number;
      ratePaise?: number | null;
    }
  | {
      type: "update_style";
      id: string;
      name: string;
      code: string;
      notes: string;
    }
  | {
      type: "update_operation";
      id: string;
      name: string;
      prerequisiteIds: string[];
    }
  | {
      type: "update_lot";
      id: string;
      code: string;
      totalPieces: number;
      status: "active" | "closed";
    }
  | {
      type: "deactivate_assignment";
      id: string;
      reason: string;
    }
  | {
      type: "save_settings";
      name: string;
      phone: string;
      payPeriod: FactorySettings["payPeriod"];
    }
  | {
      type: "request_correction";
      assignmentId: string;
      workDate: string;
      quantity: number;
      reason: string;
    }
  | {
      type: "review_correction";
      id: string;
      decision: "accepted" | "rejected";
      note: string;
    };
export type LedgerRow = {
  id: string;
  source: "daily" | "legacy";
  employeeId: string;
  unitId: string;
  assignmentId?: string;
  operationId: string;
  lotId: string;
  workDate: string;
  entered: number;
  checked?: number;
  payable: number;
  ratePaise: number;
  amountPaise: number;
  estimatePaise: number;
  status: "pending" | "needs_admin" | "approved" | "rejected" | "void";
  adjustment: number;
};
export function ledger(s: Snapshot): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const modern = new Set<string>();
  const snapshots = new Map<string, DailyCount>();
  for (const count of s.counts ?? [])
    snapshots.set(`${count.assignmentId}:${count.workDate}`, count);
  for (const day of s.days ?? [])
    for (const task of day.tasks)
      if (!snapshots.has(`${task.assignmentId}:${day.workDate}`))
        snapshots.set(`${task.assignmentId}:${day.workDate}`, {
          id: `day-${day.id}-${task.assignmentId}`,
          assignmentId: task.assignmentId,
          employeeId: day.employeeId,
          unitId: day.unitId,
          workDate: day.workDate,
          quantity: task.enteredQuantity,
          ratePaise: task.ratePaise,
          version: 0,
          updatedAt: day.checkedAt,
        });
  for (const count of snapshots.values()) {
    const a = s.assignments.find((a) => a.id === count.assignmentId);
    if (!a) continue;
    modern.add(
      `${count.employeeId}:${a.operationId}:${a.lotId}:${count.workDate}`,
    );
    const day = dayFor(s, count.employeeId, count.workDate),
      checked = day?.tasks.find((t) => t.assignmentId === a.id),
      approved = !!day && day.status !== "needs_admin";
    const delta = (s.adjustments ?? [])
        .filter((x) => x.assignmentId === a.id && x.workDate === count.workDate)
        .reduce((n, x) => n + x.quantityDelta, 0),
      rate = checked?.ratePaise ?? count.ratePaise,
      payable = approved
        ? (checked?.finalQuantity ?? count.quantity) + delta
        : 0;
    rows.push({
      id: count.id,
      source: "daily",
      employeeId: count.employeeId,
      unitId: count.unitId,
      assignmentId: a.id,
      operationId: a.operationId,
      lotId: a.lotId,
      workDate: count.workDate,
      entered: count.quantity,
      checked: checked?.captainQuantity,
      payable,
      ratePaise: rate,
      amountPaise: payable * rate,
      estimatePaise: approved ? 0 : count.quantity * rate,
      status: approved
        ? "approved"
        : day?.status === "needs_admin"
          ? "needs_admin"
          : "pending",
      adjustment: delta,
    });
  }
  for (const e of s.entries) {
    if (modern.has(`${e.employeeId}:${e.operationId}:${e.lotId}:${e.workDate}`))
      continue;
    const approved = e.status === "approved";
    rows.push({
      id: e.id,
      source: "legacy",
      employeeId: e.employeeId,
      unitId: e.unitId,
      operationId: e.operationId,
      lotId: e.lotId,
      workDate: e.workDate,
      entered: e.quantity,
      payable: approved ? e.quantity : 0,
      ratePaise: e.ratePaise,
      amountPaise: approved ? e.quantity * e.ratePaise : 0,
      estimatePaise: e.status === "pending" ? e.quantity * e.ratePaise : 0,
      status: e.status,
      adjustment: 0,
    });
  }
  return rows.sort((a, b) => b.workDate.localeCompare(a.workDate));
}
export function totals(rows: LedgerRow[]) {
  return {
    pieces: rows
      .filter((r) => !["void", "rejected"].includes(r.status))
      .reduce((n, r) => n + r.entered, 0),
    approved: rows.reduce((n, r) => n + r.amountPaise, 0),
    pending: rows.reduce((n, r) => n + r.estimatePaise, 0),
  };
}
/** Pieces and money for one employee on one day. A captain's snapshot carries a
 *  computed amount per employee and day (employeeMoney); for everyone else the
 *  amount comes from the ledger rows. */
export function dayFigures(
  s: Pick<Snapshot, "employeeMoney">,
  rows: LedgerRow[],
  employeeId: string,
  date: string,
) {
  const mine = rows.filter(
      (r) => r.employeeId === employeeId && r.workDate === date,
    ),
    t = totals(mine),
    amountPaise = s.employeeMoney
      ? s.employeeMoney
          .filter((m) => m.employeeId === employeeId && m.workDate === date)
          .reduce((n, m) => n + m.amountPaise, 0)
      : t.approved + t.pending;
  return { pieces: t.pieces, amountPaise };
}
export function recentWorkDays(today = factoryDate()) {
  return Array.from({ length: 7 }, (_, index) => {
    const workDate = dateOffset(index - 6, today);
    return {
      workDate,
      label: formatDate(new Date(`${workDate}T12:00:00Z`), {
        weekday: "short",
      }),
    };
  });
}
export function ledgerTrend(rows: LedgerRow[], today = factoryDate()) {
  const dates = recentWorkDays(today);
  return {
    dates,
    pieces: dates.map(({ workDate, label }) => ({
      label,
      value: totals(rows.filter((row) => row.workDate === workDate)).pieces,
    })),
    money: dates.map(({ workDate, label }) => ({
      label,
      value: rows
        .filter((row) => row.workDate === workDate)
        .reduce((sum, row) => sum + row.amountPaise + row.estimatePaise, 0),
    })),
  };
}
export function seedWorkspace(s: Snapshot): Snapshot {
  s.settings ??= { name: "Crewgrain", phone: "", payPeriod: "weekly" };
  s.corrections ??= [];
  s.adjustments ??= [];
  s.days ??= [];
  if (!s.dayPlan) {
    s.dayPlan = [];
    const today = factoryDate(),
      seen = new Set<string>();
    for (const lot of s.lots.filter((x) => x.status === "active")) {
      const key = `${lot.unitId}:${lot.styleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      s.dayPlan.push({
        unitId: lot.unitId,
        workDate: today,
        styleId: lot.styleId,
        position: s.dayPlan.filter((x) => x.unitId === lot.unitId).length,
      });
    }
  }
  for (const offset of [1, 2])
    for (const employee of s.employees.filter(
      (e) => e.role === "worker" && e.active,
    )) {
      const captain = s.employees.find(
        (e) => e.role === "captain" && e.active && e.unitId === employee.unitId,
      );
      if (!captain) continue;
      const date = dateOffset(-offset);
      if (dayFor(s, employee.id, date)) continue;
      const tasks = s.assignments
        .filter((a) => a.employeeId === employee.id && a.active && !a.workDate)
        .map((a) => {
          const entries = s.entries.filter(
            (e) =>
              e.employeeId === employee.id &&
              e.operationId === a.operationId &&
              e.lotId === a.lotId &&
              e.workDate === date &&
              e.status === "approved",
          );
          const quantity = entries.reduce((n, e) => n + e.quantity, 0);
          return {
            assignmentId: a.id,
            enteredQuantity: quantity,
            captainQuantity: quantity,
            finalQuantity: quantity,
            ratePaise: entries[0]?.ratePaise ?? 0,
            reason: "",
          };
        })
        .filter((t) => t.enteredQuantity > 0);
      if (tasks.length)
        s.days.push({
          id: `past-${employee.id}-${date}`,
          employeeId: employee.id,
          unitId: employee.unitId,
          workDate: date,
          captainId: captain.id,
          checkedAt: `${date}T12:00:00Z`,
          attendance: "present",
          status: "approved",
          tasks,
        });
    }
  return s;
}
export function applyWorkspaceAction(
  source: Snapshot,
  actor: Employee,
  action: WorkspaceAction,
  id: string,
  now = new Date(),
): Snapshot {
  if (operationActionTypes.includes(action.type))
    return applyOperationsAction(
      source,
      actor,
      action as OperationsAction,
      id,
      now,
    );
  const a = action as Exclude<WorkspaceAction, OperationsAction>;
  if (!actor.active) throw new Error("This account is inactive.");
  const s = JSON.parse(JSON.stringify(source)) as Snapshot;
  s.corrections ??= [];
  s.adjustments ??= [];
  const at = now.toISOString();
  let before: unknown = null,
    after: unknown = null;
  if (a.type === "request_correction") {
    if (actor.role !== "worker")
      throw new Error("Only an employee can request a correction.");
    integer(a.quantity, 0, 20000, "Correct count");
    if (!a.reason.trim()) throw new Error("Explain the correction.");
    const row = ledger(s).find(
      (r) =>
        r.assignmentId === a.assignmentId &&
        r.workDate === a.workDate &&
        r.employeeId === actor.id &&
        r.status === "approved",
    );
    if (!row)
      throw new Error(
        "Wait until the day is approved before requesting a correction.",
      );
    if (
      s.corrections.some(
        (r) =>
          r.assignmentId === a.assignmentId &&
          r.workDate === a.workDate &&
          r.status === "pending",
      )
    )
      throw new Error("A correction is already waiting for review.");
    if (a.quantity === row.payable) throw new Error("Enter a different count.");
    const request: CorrectionRequest = {
      id,
      employeeId: actor.id,
      employeeName: actor.name,
      unitId: row.unitId,
      assignmentId: a.assignmentId,
      workDate: a.workDate,
      originalQuantity: row.payable,
      requestedQuantity: a.quantity,
      reason: a.reason.trim(),
      status: "pending",
      createdAt: at,
    };
    s.corrections.unshift(request);
    after = request;
  } else if (a.type === "deactivate_assignment") {
    const assignment = s.assignments.find((x) => x.id === a.id);
    if (!assignment) throw new Error("Task not found.");
    const lot = s.lots.find((l) => l.id === assignment.lotId)!;
    requireUnit(actor, lot.unitId);
    const date = assignment.workDate ?? factoryDate(now);
    if (
      dayFor(s, assignment.employeeId, date) ||
      (s.counts ?? []).some(
        (c) => c.assignmentId === a.id && c.workDate === date && c.quantity > 0,
      )
    )
      throw new Error("Recorded or checked work cannot be removed.");
    if (!a.reason.trim()) throw new Error("Enter a reason.");
    before = { ...assignment };
    assignment.active = false;
    after = assignment;
  } else if (a.type === "set_day_plan") {
    requireUnit(actor, a.unitId);
    const today = factoryDate(now);
    if (a.workDate < dateOffset(-1, today) || a.workDate > dateOffset(7, today))
      throw new Error("Choose a day from yesterday to next week.");
    if (a.items.length > 20)
      throw new Error("Choose up to 20 styles for one day.");
    const seen = new Set<string>();
    for (const item of a.items) {
      if (!s.styles.some((x) => x.id === item.styleId))
        throw new Error("Style not found.");
      if (seen.has(item.styleId))
        throw new Error("Each style can be added once.");
      seen.add(item.styleId);
      if (item.count !== undefined) integer(item.count, 1, 1000000, "Count");
    }
    s.dayPlan ??= [];
    const same = (x: { unitId: string; workDate: string }) =>
      x.unitId === a.unitId && x.workDate === a.workDate;
    before = s.dayPlan.filter(same);
    s.dayPlan = s.dayPlan.filter((x) => !same(x));
    a.items.forEach((item, position) => {
      s.dayPlan!.push({
        unitId: a.unitId,
        workDate: a.workDate,
        styleId: item.styleId,
        position,
        count: item.count,
      });
      ensureLot(s, a.unitId, item.styleId, id);
    });
    after = a.items;
  } else if (
    a.type === "add_line" ||
    a.type === "rename_line" ||
    a.type === "remove_line" ||
    a.type === "rename_unit"
  ) {
    // Captains manage the lines of their own unit; admins manage every unit.
    const name = "name" in a ? a.name.trim() : "";
    if ("name" in a && (!name || name.length > 120))
      throw new Error("Enter a name up to 120 characters.");
    if (a.type === "add_line") {
      requireUnit(actor, a.unitId);
      if (!s.units.some((u) => u.id === a.unitId && u.active))
        throw new Error("Unit not found.");
      if (s.lines.some((l) => l.unitId === a.unitId && l.name === name))
        throw new Error("A line with this name already exists.");
      after = { id, unitId: a.unitId, name };
      s.lines.push(after as (typeof s.lines)[number]);
    } else if (a.type === "rename_unit") {
      const unit = s.units.find((u) => u.id === a.id);
      if (!unit) throw new Error("Unit not found.");
      requireUnit(actor, unit.id);
      before = { ...unit };
      unit.name = name;
      after = unit;
    } else {
      const line = s.lines.find((l) => l.id === a.id);
      if (!line) throw new Error("Line not found.");
      requireUnit(actor, line.unitId);
      before = { ...line };
      if (a.type === "rename_line") {
        if (
          s.lines.some(
            (l) =>
              l.id !== line.id && l.unitId === line.unitId && l.name === name,
          )
        )
          throw new Error("A line with this name already exists.");
        line.name = name;
        after = line;
      } else {
        if (s.lots.some((l) => l.lineId === line.id))
          throw new Error(
            "This line has production lots. Close or move them first.",
          );
        if (s.employees.some((e) => e.active && e.lineId === line.id))
          throw new Error("Move employees off this line first.");
        s.lines = s.lines.filter((l) => l.id !== line.id);
      }
    }
  } else {
    requireAdmin(actor);
    if (a.type === "review_correction") {
      const request = s.corrections.find(
        (r) => r.id === a.id && r.status === "pending",
      );
      if (!request)
        throw new Error("This correction has already been reviewed.");
      before = { ...request };
      if (!["accepted", "rejected"].includes(a.decision))
        throw new Error("Choose a decision.");
      if (a.decision === "rejected" && !a.note.trim())
        throw new Error("Explain why the correction is rejected.");
      if (a.decision === "accepted") {
        const row = ledger(s).find(
          (r) =>
            r.assignmentId === request.assignmentId &&
            r.workDate === request.workDate &&
            r.employeeId === request.employeeId &&
            r.status === "approved",
        );
        if (!row) throw new Error("Approved work was not found.");
        const delta = request.requestedQuantity - row.payable;
        s.adjustments.push({
          id: `adjustment-${id}`,
          requestId: request.id,
          employeeId: request.employeeId,
          unitId: request.unitId,
          assignmentId: request.assignmentId,
          workDate: request.workDate,
          quantityDelta: delta,
          ratePaise: row.ratePaise,
          amountPaise: delta * row.ratePaise,
          createdBy: actor.id,
          createdAt: at,
        });
      }
      Object.assign(request, {
        status: a.decision,
        reviewedBy: actor.id,
        reviewedAt: at,
        reviewNote: a.note,
      });
      after = request;
    } else if (a.type === "save_settings") {
      if (
        !a.name.trim() ||
        !["weekly", "fortnightly", "monthly"].includes(a.payPeriod)
      )
        throw new Error("Enter a factory name and valid pay period.");
      before = s.settings;
      s.settings = {
        name: a.name.trim(),
        phone: a.phone.trim(),
        payPeriod: a.payPeriod,
      };
      after = s.settings;
    } else if (a.type === "update_unit") {
      const unit = s.units.find((u) => u.id === a.id);
      if (!unit) throw new Error("Unit not found.");
      if (!a.name.trim() || !a.code.trim())
        throw new Error("Enter unit name and code.");
      if (
        !a.active &&
        s.employees.some(
          (e) => e.active && e.unitId === unit.id && e.role !== "admin",
        )
      )
        throw new Error("Move or deactivate the unit’s employees first.");
      if (s.units.some((u) => u.id !== a.id && u.code === a.code))
        throw new Error("Unit code already exists.");
      before = { ...unit };
      Object.assign(unit, {
        name: a.name.trim(),
        code: a.code.trim(),
        active: a.active,
      });
      after = unit;
    } else if (a.type === "update_line") {
      const x = s.lines.find((l) => l.id === a.id);
      if (!x || !a.name.trim()) throw new Error("Enter a valid line name.");
      before = { ...x };
      x.name = a.name.trim();
      after = x;
    } else if (a.type === "save_style") {
      const name = a.name.trim(),
        code = a.code.trim();
      if (!name || !code) throw new Error("Enter a style name and code.");
      if (s.styles.some((x) => x.id !== a.id && x.code === code))
        throw new Error("Style code already exists.");
      const existing = a.id ? s.styles.find((x) => x.id === a.id) : undefined;
      if (a.id && !existing) throw new Error("Style not found.");
      before = existing ? { ...existing } : undefined;
      const next = {
        name,
        code,
        notes: a.notes,
        category: a.category.trim(),
      };
      if (existing) Object.assign(existing, next);
      else s.styles.push({ id, color: "#27337A", ...next });
      after = existing ?? s.styles[s.styles.length - 1];
    } else if (a.type === "add_operations") {
      if (!s.styles.some((x) => x.id === a.styleId))
        throw new Error("Style not found.");
      if (a.tasks.length < 1 || a.tasks.length > 60)
        throw new Error("Add between 1 and 60 tasks.");
      let sequence = Math.max(
        0,
        ...s.operations
          .filter((o) => o.styleId === a.styleId)
          .map((o) => o.sequence),
      );
      const perMinute = perMinuteFor(s, a.styleId);
      a.tasks.forEach((task, index) => {
        if (!task.name.trim()) throw new Error("Each task needs a name.");
        const noPrice =
          task.ratePaise === undefined && task.seconds === undefined;
        const manual = task.ratePaise !== undefined || noPrice;
        if (task.ratePaise !== undefined)
          integer(task.ratePaise, 0, 10000000, "Rate in paise");
        if (task.seconds !== undefined)
          integer(task.seconds, 1, 36000, "Seconds per piece");
        let codeNumber = sequence + 1;
        while (
          s.operations.some(
            (o) =>
              o.styleId === a.styleId &&
              operationCode(o).toUpperCase() === "OP" + codeNumber,
          )
        )
          codeNumber++;
        s.operations.push({
          code: "OP" + codeNumber,
          id: `${id}-${index}`,
          styleId: a.styleId,
          name: task.name.trim(),
          sequence: ++sequence,
          ratePaise: manual
            ? (task.ratePaise ?? 0)
            : taskRate(task.seconds!, perMinute),
          seconds: task.seconds,
          manual,
          prerequisiteIds: [],
        });
      });
      after = { count: a.tasks.length };
    } else if (a.type === "set_rate_settings") {
      integer(a.perMinutePaise, 1, 100000, "Rate per minute");
      before = { ...s.rateSettings };
      s.rateSettings = { perMinutePaise: a.perMinutePaise };
      after = { ...s.rateSettings, updated: repriceTasks(s) };
    } else if (a.type === "set_style_pricing") {
      const style = s.styles.find((x) => x.id === a.styleId);
      if (!style) throw new Error("Style not found.");
      before = { perMinutePaise: style.perMinutePaise };
      if (a.perMinutePaise === null) delete style.perMinutePaise;
      else {
        integer(a.perMinutePaise, 1, 100000, "Rate per minute");
        style.perMinutePaise = a.perMinutePaise;
      }
      after = {
        perMinutePaise: style.perMinutePaise,
        updated: repriceTasks(s, style.id),
      };
    } else if (a.type === "set_task_pricing") {
      const op = s.operations.find((x) => x.id === a.id);
      if (!op) throw new Error("Task not found.");
      before = { ...op };
      if (a.seconds !== undefined) {
        integer(a.seconds, 1, 36000, "Seconds per piece");
        op.seconds = a.seconds;
      }
      if (typeof a.ratePaise === "number") {
        integer(a.ratePaise, 0, 10000000, "Rate in paise");
        op.manual = true;
        op.ratePaise = a.ratePaise;
      } else if (a.ratePaise === null) {
        if (!op.seconds)
          throw new Error(
            "Add seconds per piece to price this task automatically.",
          );
        op.manual = false;
      }
      if (!op.manual && op.seconds)
        op.ratePaise = taskRate(op.seconds, perMinuteFor(s, op.styleId));
      after = { ...op };
    } else if (a.type === "update_style") {
      const x = s.styles.find((x) => x.id === a.id);
      if (!x || !a.name.trim() || !a.code.trim())
        throw new Error("Enter a style name and code.");
      if (s.styles.some((x) => x.id !== a.id && x.code === a.code))
        throw new Error("Style code already exists.");
      before = { ...x };
      Object.assign(x, {
        name: a.name.trim(),
        code: a.code.trim(),
        notes: a.notes,
      });
      after = x;
    } else if (a.type === "update_operation") {
      const x = s.operations.find((x) => x.id === a.id);
      if (!x || !a.name.trim()) throw new Error("Enter a valid task name.");
      if (
        a.prerequisiteIds.some(
          (id) =>
            !s.operations.some(
              (o) =>
                o.id === id &&
                o.styleId === x.styleId &&
                o.sequence < x.sequence,
            ),
        )
      )
        throw new Error("Choose earlier tasks from this style.");
      before = { ...x };
      x.name = a.name.trim();
      x.prerequisiteIds = a.prerequisiteIds;
      after = x;
    } else if (a.type === "update_lot") {
      const x = s.lots.find((x) => x.id === a.id);
      if (!x || !a.code.trim()) throw new Error("Enter a lot number.");
      integer(a.totalPieces, 1, 1000000, "Lot pieces");
      if (s.lots.some((l) => l.id !== a.id && l.code === a.code))
        throw new Error("Lot number already exists.");
      if (!["active", "closed"].includes(a.status))
        throw new Error("Choose a valid lot status.");
      before = { ...x };
      Object.assign(x, {
        code: a.code.trim(),
        totalPieces: a.totalPieces,
        status: a.status,
      });
      after = x;
    }
  }
  s.audit.unshift({
    id,
    actorId: actor.id,
    action: a.type,
    entityId: ("id" in a && a.id) || id,
    at,
    detail: JSON.stringify({
      before,
      after,
      reason: "reason" in a ? a.reason : undefined,
    }),
  });
  return s;
}
/** Recalculate automatically priced tasks. Returns how many rates changed. */
export function repriceTasks(s: Snapshot, styleId?: string) {
  let changed = 0;
  for (const op of s.operations) {
    if (styleId && op.styleId !== styleId) continue;
    if (op.manual || !op.seconds) continue;
    const next = taskRate(op.seconds, perMinuteFor(s, op.styleId));
    if (next !== op.ratePaise) {
      op.ratePaise = next;
      changed++;
    }
  }
  return changed;
}
/** A style chosen for a line needs a (hidden) batch so work can be assigned. */
export function ensureLot(
  s: Snapshot,
  unitId: string,
  styleId: string,
  id: string,
) {
  if (
    s.lots.some(
      (l) =>
        l.unitId === unitId && l.styleId === styleId && l.status === "active",
    )
  )
    return;
  const style = s.styles.find((x) => x.id === styleId)!;
  const unit = s.units.find((u) => u.id === unitId)!;
  s.lots.push({
    id: `auto-${id}-${styleId}`,
    code: `AUTO-${style.code}-${unit.code}`.slice(0, 40),
    styleId,
    unitId,
    lineId: s.lines.find((l) => l.unitId === unitId)?.id ?? "",
    totalPieces: 1000000,
    status: "active",
  });
}
