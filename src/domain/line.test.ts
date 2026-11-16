import { describe, expect, it } from "vitest";
import { ledger } from "./workspace";
import { lineActiveDates, lineDay, lineRecentDays, lineStaff } from "./line";

const D = "2026-11-12";
const emp = (id: string, name: string, unitId: string, extra = {}) => ({
  id,
  employeeId: id.toUpperCase(),
  name,
  role: "worker",
  unitId,
  operation: "",
  active: true,
  authReady: true,
  ...extra,
});
const assign = (id: string, employeeId: string) => ({
  id,
  employeeId,
  operationId: "op",
  lotId: "lot",
  active: true,
  workDate: D,
  assignedBy: "cap",
});
const count = (
  assignmentId: string,
  employeeId: string,
  unitId: string,
  q: number,
  workDate = D,
) => ({
  id: `c-${assignmentId}-${workDate}`,
  assignmentId,
  employeeId,
  unitId,
  workDate,
  quantity: q,
  ratePaise: 100,
  version: 1,
  updatedAt: "",
});
const day = (
  employeeId: string,
  status: string,
  unitId = "u1",
  workDate = D,
) => ({
  id: `d-${employeeId}-${workDate}`,
  employeeId,
  unitId,
  workDate,
  captainId: "cap",
  checkedAt: "",
  attendance: "present",
  status,
  tasks: [],
});
function snap(over: Record<string, unknown> = {}) {
  return {
    units: [],
    employees: [
      emp("w2", "Zara", "u1"),
      emp("cap", "Mohan", "u1", { role: "captain" }),
      emp("w1", "Asha", "u1"),
      emp("gone", "Gone", "u1", { active: false }),
      emp("del", "Deleted", "u1", { deletedAt: "2026-01-01" }),
      emp("boss", "Admin", "u1", { role: "admin" }),
      emp("o1", "Other", "u2"),
    ],
    assignments: [
      assign("a1", "w1"),
      assign("a2", "w2"),
      assign("a3", "o1"),
      assign("a4", "gone"),
    ],
    counts: [],
    days: [],
    entries: [],
    adjustments: [],
    ...over,
  } as never;
}

describe("lineStaff", () => {
  it("lists the captain first then workers by name, without inactive, deleted or admin", () => {
    expect(lineStaff(snap(), "u1").map((e) => e.name)).toEqual([
      "Mohan",
      "Asha",
      "Zara",
    ]);
  });
});

describe("lineDay", () => {
  it("is empty when nothing is recorded", () => {
    const r = lineDay(snap(), "u1", D);
    expect(r.hasActivity).toBe(false);
    expect(r.pieces).toBe(0);
    expect(r.amountPaise).toBe(0);
    expect(r.checked).toBe(0);
    expect(r.total).toBe(2);
    expect(r.staff.every((p) => p.status === "not_started")).toBe(true);
  });
  it("marks people with counts but no check as counting and prices them as an estimate", () => {
    const r = lineDay(snap({ counts: [count("a1", "w1", "u1", 10)] }), "u1", D);
    const asha = r.staff.find((p) => p.employee.id === "w1")!;
    expect(asha).toMatchObject({
      status: "counting",
      pieces: 10,
      amountPaise: 1000,
    });
    expect(r.staff.find((p) => p.employee.id === "w2")!.status).toBe(
      "not_started",
    );
    expect(r.hasActivity).toBe(true);
    expect(r.pieces).toBe(10);
    expect(r.checked).toBe(0);
  });
  it("shows checked, approved and needs_admin from the day record", () => {
    const s = snap({
      counts: [count("a1", "w1", "u1", 10), count("a2", "w2", "u1", 5)],
      days: [day("w1", "approved"), day("w2", "needs_admin")],
    });
    const r = lineDay(s, "u1", D);
    expect(r.staff.find((p) => p.employee.id === "w1")!.status).toBe("checked");
    expect(r.staff.find((p) => p.employee.id === "w2")!.status).toBe(
      "needs_admin",
    );
    expect(r.checked).toBe(2);
    const approved = lineDay(
      snap({
        counts: [count("a1", "w1", "u1", 10)],
        days: [day("w1", "admin_approved")],
      }),
      "u1",
      D,
    );
    expect(approved.staff.find((p) => p.employee.id === "w1")!.status).toBe(
      "approved",
    );
  });
  it("ignores other lines and other days", () => {
    const s = snap({
      counts: [
        count("a3", "o1", "u2", 99),
        count("a1", "w1", "u1", 7, "2026-11-11"),
      ],
    });
    const r = lineDay(s, "u1", D);
    expect(r.pieces).toBe(0);
    expect(r.hasActivity).toBe(false);
    expect(lineDay(s, "u2", D).pieces).toBe(99);
  });
  it("does not list inactive staff but keeps captain first", () => {
    const r = lineDay(
      snap({ counts: [count("a4", "gone", "u1", 3)] }),
      "u1",
      D,
    );
    expect(r.staff.map((p) => p.employee.id)).toEqual(["cap", "w1", "w2"]);
    expect(r.staff[0].isCaptain).toBe(true);
    expect(r.total).toBe(2);
  });
});

describe("lineRecentDays", () => {
  it("returns n days newest first with pieces and amount for that line only", () => {
    const s = snap({
      counts: [
        count("a1", "w1", "u1", 4),
        count("a1", "w1", "u1", 6, "2026-11-10"),
        count("a3", "o1", "u2", 50),
      ],
    });
    const r = lineRecentDays(s, "u1", D, 7);
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual({ date: D, pieces: 4, amountPaise: 400 });
    expect(r[1].pieces).toBe(0);
    expect(r[2]).toEqual({ date: "2026-11-10", pieces: 6, amountPaise: 600 });
  });
  it("lists the days that have work", () => {
    const s = snap({ counts: [count("a1", "w1", "u1", 4)] });
    expect([...lineActiveDates(ledger(s), "u1")]).toEqual([D]);
  });
});
