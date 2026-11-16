import { describe, it, expect } from "vitest";
import { makeDemo, demoAction, demoEntry } from "./demo";
import {
  factoryDate,
  validateEntry,
  scopeSnapshot,
  editable,
  dateOffset,
} from "./rules";
import { csv } from "../lib/export-csv";
const id = "f72bd6e0-21d5-4050-a301-338d43b02e71";
describe("production and role rules", () => {
  it("uses factory time across UTC midnight boundaries", () => {
    expect(factoryDate(new Date("2026-11-06T19:00:00Z"))).toBe("2026-11-07");
  });
  it("retries the same entry without duplicating pieces or wages", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "worker")!,
      entry = {
        id,
        employeeId: a.id,
        operationId: "o2",
        lotId: "lot1",
        quantity: 20,
        workDate: factoryDate(),
        capturedAt: new Date().toISOString(),
      };
    const once = demoEntry(s, a, entry),
      twice = demoEntry(once, a, entry);
    expect(twice.entries.length).toBe(s.entries.length + 1);
    expect(twice.entries.filter((e) => e.id === id)).toHaveLength(1);
    expect(() => demoEntry(twice, a, { ...entry, quantity: 21 })).toThrow(
      "different work",
    );
  });
  it("denies unassigned work and malformed quantities", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "worker")!,
      entry = {
        id,
        employeeId: a.id,
        operationId: "o2",
        lotId: "lot1",
        quantity: 0,
        workDate: factoryDate(),
        capturedAt: new Date().toISOString(),
      };
    expect(() => validateEntry(s, a, entry)).toThrow("Quantity");
    expect(() =>
      validateEntry(s, a, { ...entry, quantity: 2, lotId: "lot2" }),
    ).toThrow("assigned");
    expect(() =>
      validateEntry(s, a, { ...entry, quantity: 2, workDate: dateOffset(-3) }),
    ).toThrow("previous two days");
  });
  it("locks reviewed records and the server-time edit window", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "worker")!,
      e = {
        ...s.entries.find((e) => e.employeeId === a.id)!,
        createdAt: "2026-11-07T01:00:00Z",
      };
    expect(editable(e, a, new Date("2026-11-07T02:01:00Z"))).toBe(false);
    expect(
      editable(
        { ...e, status: "approved" },
        a,
        new Date("2026-11-07T01:30:00Z"),
      ),
    ).toBe(false);
  });
  it("does not expose another unit or worker wages to a captain", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "captain")!,
      view = scopeSnapshot(s, a);
    expect(view.units.map((u) => u.id)).toEqual(["u1"]);
    expect(
      view.entries.every((e) => e.unitId === "u1" && e.ratePaise === 0),
    ).toBe(true);
    expect(view.requests.every((r) => r.unitId === "u1")).toBe(true);
    expect(view.audit).toEqual([]);
    expect(() =>
      demoAction(
        s,
        a,
        { type: "review_request", id: "r2", decision: "approved", reason: "" },
        id,
      ),
    ).toThrow("Admin access");
  });
  it("keeps historical entry rates after an admin changes a rate", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "admin")!,
      before = s.entries.find((e) => e.operationId === "o2")!.ratePaise;
    const changed = demoAction(
      s,
      a,
      { type: "set_rate", id: "o2", ratePaise: 999, reason: "Updated rate" },
      id,
    );
    expect(changed.operations.find((o) => o.id === "o2")!.ratePaise).toBe(999);
    expect(changed.entries.find((e) => e.operationId === "o2")!.ratePaise).toBe(
      before,
    );
  });
  it("requires admin approval before activating a captain's employee request", () => {
    const s = makeDemo(),
      captain = s.employees.find((e) => e.id === "captain")!,
      admin = s.employees.find((e) => e.id === "admin")!;
    const review = {
      type: "review_request" as const,
      id: "r1",
      decision: "approved" as const,
      reason: "",
    };
    expect(() => demoAction(s, captain, review, id)).toThrow("Admin access");
    expect(s.requests.find((r) => r.id === "r1")?.status).toBe("pending");
    expect(s.employees.some((e) => e.employeeId === "ZV-051")).toBe(false);
    const changed = demoAction(s, admin, review, id);
    expect(
      changed.employees.find((e) => e.employeeId === "ZV-051"),
    ).toMatchObject({ active: true, unitId: "u1", authReady: false });
  });
  it("lets admins add employees directly and rejects duplicate employee IDs", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "admin")!,
      action = {
        type: "add_employee" as const,
        employeeId: "ZV-099",
        name: "Test Employee",
        unitId: "u3",
        role: "worker" as const,
        operation: "Stitching",
      };
    const changed = demoAction(s, a, action, id);
    expect(
      changed.employees.find((e) => e.employeeId === "ZV-099")?.active,
    ).toBe(true);
    expect(() => demoAction(changed, a, action, id + "x")).toThrow(
      "already exists",
    );
  });
  it("validates attendance and prevents changes to reviewed captain reports", () => {
    const s = makeDemo(),
      a = s.employees.find((e) => e.id === "captain")!,
      action = {
        type: "submit_report" as const,
        unitId: "u1",
        workDate: factoryDate(),
        scheduled: 2,
        present: 3,
        completed: 20,
        packed: 12,
        blockers: "",
        notes: "",
      };
    expect(() => demoAction(s, a, action, id)).toThrow("Present employees");
    const changed = demoAction(
      s,
      s.employees.find((e) => e.id === "admin")!,
      {
        type: "review_report",
        id: "rep1",
        decision: "reviewed",
        reason: "Checked",
      },
      id,
    );
    expect(() => demoAction(changed, a, { ...action, present: 2 }, id)).toThrow(
      "locked",
    );
  });
  it("neutralizes spreadsheet formulas while preserving readable CSV", () => {
    expect(csv([['=HYPERLINK("https://evil.invalid")', 2]])).toContain(
      "'=HYPERLINK",
    );
    expect(csv([["a,b", 'a"b']])).toContain('"a,b","a""b"');
  });
});
