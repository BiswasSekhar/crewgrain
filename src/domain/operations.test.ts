import { describe, expect, it } from "vitest";
import { makeDemo } from "./demo";
import { seedDaily, applyCounter } from "./daily";
import { factoryDate } from "./rules";
import { applyOperationsAction, captureTiming } from "./operations";
const source = () => seedDaily(makeDemo());
describe("operation capture timing", () => {
  it("does not invent a duration for first additions or corrections", () => {
    expect(captureTiming(undefined, "a", "add", 100, 1000)).toEqual({
      timing: "first",
    });
    const prior = { id: "e", assignmentId: "a", monotonic: 100, wall: 1000 };
    expect(captureTiming(prior, "a", "subtract", 200, 1100)).toEqual({
      timing: "correction",
    });
    expect(captureTiming(prior, "a", "correction", 200, 1100)).toEqual({
      timing: "correction",
    });
  });
  it("captures a monotonic interval and rejects switches, long breaks and clock jumps", () => {
    const prior = { id: "e", assignmentId: "a", monotonic: 100, wall: 1000 };
    expect(captureTiming(prior, "a", "add", 45100, 46000)).toEqual({
      timing: "between_additions",
      previousEventId: "e",
      intervalMs: 45000,
    });
    for (const [assignment, mono, wall] of [
      ["b", 200, 1100],
      ["a", 1900100, 1901000],
      ["a", 200, 999999],
      ["a", 50, 950],
    ] as const)
      expect(captureTiming(prior, assignment, "add", mono, wall)).toEqual({
        timing: "interrupted",
      });
  });
});
describe("operation and staff domain", () => {
  it("reuses defaults as dated assignments without overwriting another day", () => {
    const s = source(),
      admin = s.employees.find((e) => e.role === "admin")!,
      employee = s.employees.find((e) => e.role === "worker")!,
      op = s.operations[0];
    const result = applyOperationsAction(
      s,
      admin,
      {
        type: "assign_operations",
        employeeId: employee.id,
        styleId: op.styleId,
        operationIds: [op.id],
        workDate: factoryDate(),
        saveDefaults: true,
        material: "Linen",
      },
      "new",
    );
    expect(result.operationDefaults).toContainEqual({
      employeeId: employee.id,
      styleId: op.styleId,
      operationIds: [op.id],
    });
    expect(result.counts).toEqual(s.counts);
    expect(s.operationDefaults).toBeUndefined();
  });
  it("preserves history and blocks deleting administrators or assigning as an employee", () => {
    const s = source(),
      admin = s.employees.find((e) => e.role === "admin")!,
      worker = s.employees.find((e) => e.role === "worker")!;
    s.days = [
      ...(s.days || []),
      {
        id: "checked-for-deletion",
        employeeId: worker.id,
        unitId: worker.unitId,
        workDate: factoryDate(),
        captainId: "captain",
        checkedAt: new Date().toISOString(),
        attendance: "present",
        status: "approved",
        tasks: [],
      },
    ];
    const result = applyOperationsAction(
      s,
      admin,
      { type: "delete_employee", id: worker.id },
      "delete",
    );
    expect(result.employees.find((e) => e.id === worker.id)).toMatchObject({
      active: false,
    });
    expect(
      result.employees.find((e) => e.id === worker.id)?.deletedAt,
    ).toBeTruthy();
    expect(result.counts).toEqual(s.counts);
    expect(result.assignments).toEqual(s.assignments);
    expect(() =>
      applyOperationsAction(
        s,
        worker,
        { type: "delete_employee", id: admin.id },
        "bad",
      ),
    ).toThrow();
    expect(() =>
      applyOperationsAction(
        s,
        admin,
        { type: "delete_employee", id: admin.id },
        "bad",
      ),
    ).toThrow();
  });
  it("stores the received timestamp and count context without changing earlier state", () => {
    const s = source(),
      worker = s.employees.find((e) => e.id === "worker")!,
      assignment = s.assignments.find((a) => a.employeeId === worker.id)!;
    const now = new Date(),
      event = {
        id: "capture-test",
        employeeId: worker.id,
        assignmentId: assignment.id,
        operationId: assignment.operationId,
        lotId: assignment.lotId,
        workDate: factoryDate(),
        delta: 1,
        capturedAt: now.toISOString(),
      };
    const result = applyCounter(s, worker, event, now);
    const saved = JSON.parse(result.audit[0].detail);
    expect(saved).toMatchObject({
      capturedAt: event.capturedAt,
      receivedAt: now.toISOString(),
      serverContext: { unitId: worker.unitId },
    });
    expect(result.audit).toHaveLength(s.audit.length + 1);
  });
});
