import { describe, it, expect } from "vitest";
import { makeDemo } from "./demo";
import { plannedStyleIds, styleUsage } from "./plan";
const date = "2026-01-05";
function setup() {
  const s = makeDemo(),
    worker = s.employees.find((e) => e.id === "worker")!,
    op = s.operations[0];
  s.dayPlan = [
    { unitId: worker.unitId, workDate: date, styleId: "s2", position: 1 },
    { unitId: worker.unitId, workDate: date, styleId: "s1", position: 0 },
    { unitId: "other", workDate: date, styleId: "s3", position: 0 },
  ];
  s.assignments = [
    {
      id: "a1",
      employeeId: worker.id,
      operationId: op.id,
      lotId: s.lots[0].id,
      active: true,
      workDate: date,
    },
    {
      id: "a2",
      employeeId: worker.id,
      operationId: op.id,
      lotId: s.lots[0].id,
      active: false,
      workDate: date,
    },
    {
      id: "a3",
      employeeId: worker.id,
      operationId: op.id,
      lotId: s.lots[0].id,
      active: true,
      workDate: "2026-01-04",
    },
  ];
  s.counts = [];
  s.days = [];
  return { s, worker, op };
}
describe("day plan helpers", () => {
  it("lists planned styles for the line in plan order", () => {
    const { s, worker } = setup();
    expect(plannedStyleIds(s, worker.unitId, date)).toEqual(["s1", "s2"]);
    expect(plannedStyleIds(s, worker.unitId, "2026-01-06")).toEqual([]);
  });
  it("counts only active assignments of that day and style", () => {
    const { s, worker, op } = setup();
    expect(styleUsage(s, worker.unitId, date, op.styleId)).toEqual({
      assigned: 1,
      counted: 0,
      approved: false,
    });
    expect(styleUsage(s, worker.unitId, date, "s2").assigned).toBe(0);
  });
  it("sees recorded counts and approved days", () => {
    const { s, worker, op } = setup();
    s.counts = [
      {
        id: "c1",
        assignmentId: "a1",
        employeeId: worker.id,
        unitId: worker.unitId,
        workDate: date,
        quantity: 0,
        ratePaise: 0,
        version: 1,
        updatedAt: "",
      },
    ];
    expect(styleUsage(s, worker.unitId, date, op.styleId).counted).toBe(0);
    s.counts[0].quantity = 4;
    expect(styleUsage(s, worker.unitId, date, op.styleId).counted).toBe(1);
    s.days = [
      {
        id: "d1",
        employeeId: worker.id,
        unitId: worker.unitId,
        workDate: date,
        captainId: "c",
        checkedAt: "",
        attendance: "present",
        status: "approved",
        tasks: [
          {
            assignmentId: "a1",
            enteredQuantity: 4,
            captainQuantity: 4,
            finalQuantity: 4,
            ratePaise: 0,
            reason: "",
          },
        ],
      },
    ];
    expect(styleUsage(s, worker.unitId, date, op.styleId).approved).toBe(true);
  });
});
