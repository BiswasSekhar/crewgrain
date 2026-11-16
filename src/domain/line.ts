import type { Employee, Snapshot } from "./types";
import { dateOffset, factoryDate } from "./rules";
import { dayFor } from "./daily";
import { ledger, totals, type LedgerRow } from "./workspace";

/** Where one person's day stands.
 *  not_started: nothing counted and no check. counting: counts exist, the
 *  captain has not checked yet. checked: the captain checked the day.
 *  needs_admin: the captain changed a count, so the admin must decide.
 *  approved: the admin has decided. */
export type StaffStatus =
  "not_started" | "counting" | "checked" | "needs_admin" | "approved";

export type LineStaffDay = {
  employee: Employee;
  isCaptain: boolean;
  pieces: number;
  amountPaise: number;
  status: StaffStatus;
};
export type LineDay = {
  pieces: number;
  amountPaise: number;
  /** Employees on the line whose day has been checked (any outcome). */
  checked: number;
  /** Employees (not captains) on the line. */
  total: number;
  /** True when anything at all was recorded for the line on this day. */
  hasActivity: boolean;
  staff: LineStaffDay[];
};

const live = (r: LedgerRow) => !["void", "rejected"].includes(r.status);
const money = (rows: LedgerRow[]) => {
  const t = totals(rows);
  return t.approved + t.pending;
};

/** Active people of a line: the captain first, then employees by name. */
export function lineStaff(s: Snapshot, unitId: string): Employee[] {
  return s.employees
    .filter(
      (e) =>
        e.unitId === unitId &&
        e.active &&
        !e.deletedAt &&
        (e.role === "captain" || e.role === "worker"),
    )
    .sort(
      (a, b) =>
        Number(b.role === "captain") - Number(a.role === "captain") ||
        a.name.localeCompare(b.name),
    );
}

/** Everything the Line screen shows for one line on one day. */
export function lineDay(
  s: Snapshot,
  unitId: string,
  date: string,
  rows: LedgerRow[] = ledger(s),
): LineDay {
  const day = rows.filter(
    (r) => r.unitId === unitId && r.workDate === date && live(r),
  );
  const staff = lineStaff(s, unitId).map((employee): LineStaffDay => {
    const mine = day.filter((r) => r.employeeId === employee.id),
      record = dayFor(s, employee.id, date),
      pieces = totals(mine).pieces;
    return {
      employee,
      isCaptain: employee.role === "captain",
      pieces,
      amountPaise: money(mine),
      status: record
        ? record.status === "needs_admin"
          ? "needs_admin"
          : record.status === "admin_approved"
            ? "approved"
            : "checked"
        : pieces > 0
          ? "counting"
          : "not_started",
    };
  });
  const workers = staff.filter((p) => !p.isCaptain);
  const t = totals(day);
  return {
    pieces: t.pieces,
    amountPaise: t.approved + t.pending,
    checked: workers.filter((p) =>
      ["checked", "needs_admin", "approved"].includes(p.status),
    ).length,
    total: workers.length,
    hasActivity: t.pieces > 0 || staff.some((p) => p.status !== "not_started"),
    staff,
  };
}

/** The last n days (newest first, starting at today) for one line. */
export function lineRecentDays(
  s: Snapshot,
  unitId: string,
  today = factoryDate(),
  n = 7,
  rows: LedgerRow[] = ledger(s),
) {
  const mine = rows.filter((r) => r.unitId === unitId && live(r));
  return Array.from({ length: n }, (_, i) => {
    const date = dateOffset(-i, today),
      of = mine.filter((r) => r.workDate === date);
    return { date, pieces: totals(of).pieces, amountPaise: money(of) };
  });
}

/** Dates on which the line has any recorded work, for calendar dots. */
export function lineActiveDates(rows: LedgerRow[], unitId: string) {
  return new Set(
    rows
      .filter((r) => r.unitId === unitId && live(r) && r.entered > 0)
      .map((r) => r.workDate),
  );
}
