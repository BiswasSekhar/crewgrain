import { describe, it, expect } from "vitest";
import { makeDemo } from "./demo";
import {
  seedDaily,
  applyCounter,
  applyDailyAction,
  tasksFor,
  countFor,
  approvedPay,
} from "./daily";
import { factoryDate, scopeSnapshot } from "./rules";
describe("simple daily workflow", () => {
  it("gives one employee several task counters and saves reversible deltas exactly once", () => {
    const s = seedDaily(makeDemo()),
      worker = s.employees.find((e) => e.id === "worker")!;
    expect(tasksFor(s, worker.id)).toHaveLength(3);
    const event = {
      id: "change-1",
      employeeId: worker.id,
      assignmentId: "daily-o1",
      operationId: "o1",
      lotId: "lot1",
      workDate: factoryDate(),
      delta: 3,
      capturedAt: new Date().toISOString(),
    };
    const once = applyCounter(s, worker, event),
      twice = applyCounter(once, worker, event);
    expect(countFor(twice, "daily-o1")?.quantity).toBe(3);
    expect(
      countFor(
        applyCounter(twice, worker, { ...event, id: "change-2", delta: -2 }),
        "daily-o1",
      )?.quantity,
    ).toBe(1);
  });
  it("lets captains approve worker counts but denies altered counts and false absence", () => {
    const s = seedDaily(makeDemo()),
      captain = s.employees.find((e) => e.id === "captain")!,
      admin = s.employees.find((e) => e.id === "admin")!;
    const tasks = tasksFor(s, "worker").map((a) => ({
      assignmentId: a.id,
      quantity: countFor(s, a.id)?.quantity ?? 0,
      expectedVersion: countFor(s, a.id)?.version ?? 0,
      reason: "",
    }));
    const action = {
      type: "approve_day" as const,
      employeeId: "worker",
      workDate: factoryDate(),
      attendance: "present" as const,
      tasks,
    };
    expect(() =>
      applyDailyAction(
        s,
        captain,
        {
          ...action,
          tasks: tasks.map((t) =>
            t.assignmentId === "a0"
              ? { ...t, quantity: 120, reason: "Recounted" }
              : t,
          ),
        },
        "bad",
      ),
    ).toThrow("Only the employee");
    expect(() =>
      applyDailyAction(
        s,
        captain,
        { ...action, attendance: "absent" },
        "absent",
      ),
    ).toThrow("recorded work");
    expect(() => applyDailyAction(s, admin, action, "admin")).toThrow(
      "captain",
    );
    const checked = applyDailyAction(s, captain, action, "day-1");
    const day = checked.days!.find((d) => d.id === "day-1")!;
    expect(day.status).toBe("approved");
    expect(day.tasks.find((t) => t.assignmentId === "a0")).toMatchObject({
      enteredQuantity: 128,
      captainQuantity: 128,
      finalQuantity: 128,
    });
    expect(approvedPay(day)).toBe(128 * 425);
  });
  it("only restores the worker original when resolving a legacy captain override", () => {
    const s = seedDaily(makeDemo()),
      admin = s.employees.find((e) => e.id === "admin")!;
    s.days!.push({
      id: "legacy",
      employeeId: "worker",
      unitId: "u1",
      workDate: factoryDate(),
      captainId: "captain",
      checkedAt: new Date().toISOString(),
      attendance: "present",
      status: "needs_admin",
      tasks: [
        {
          assignmentId: "a0",
          enteredQuantity: 128,
          captainQuantity: 120,
          finalQuantity: 120,
          ratePaise: 425,
          reason: "Old recount",
        },
      ],
    });
    expect(() =>
      applyDailyAction(
        s,
        admin,
        {
          type: "admin_decide_day",
          id: "legacy",
          decision: "captain",
          note: "",
        },
        "bad",
      ),
    ).toThrow("must be kept");
    const decided = applyDailyAction(
      s,
      admin,
      {
        type: "admin_decide_day",
        id: "legacy",
        decision: "employee",
        note: "Keep original",
      },
      "restore",
    );
    expect(
      decided.days!.find((d) => d.id === "legacy")!.tasks[0],
    ).toMatchObject({
      enteredQuantity: 128,
      captainQuantity: 120,
      finalQuantity: 128,
    });
  });
  it("redacts financial rates and all other units for captains", () => {
    const s = seedDaily(makeDemo()),
      captain = s.employees.find((e) => e.id === "captain")!,
      view = scopeSnapshot(s, captain);
    expect(
      view.counts?.every(
        (c) => c.unitId === captain.unitId && c.ratePaise === 0,
      ),
    ).toBe(true);
    expect(view.devices).toEqual([]);
  });
});
