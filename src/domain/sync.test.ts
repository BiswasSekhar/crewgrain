import { describe, expect, it } from "vitest";
import { makeDemo } from "./demo";
import { reconcileCountBatch } from "./sync";
import type { DailyCount, OutboxRow } from "./types";
const count: DailyCount = {
  id: "count",
  assignmentId: "assignment",
  employeeId: "worker",
  unitId: "unit",
  workDate: "2026-11-10",
  quantity: 8,
  ratePaise: 100,
  version: 3,
  updatedAt: "2026-11-10T10:00:00Z",
};
const row = (id: string): OutboxRow => ({
  id,
  kind: "counter",
  assignmentId: "assignment",
  employeeId: "worker",
  operationId: "operation",
  lotId: "batch",
  quantity: 1,
  delta: 1,
  workDate: count.workDate,
  capturedAt: count.updatedAt,
  state: "pending",
  attempts: 0,
  nextAttemptAt: 0,
});
describe("batched count reconciliation", () => {
  it("acknowledges a duplicate retry as a batch without adding pending taps twice", () => {
    const source = { ...makeDemo(), counts: [count] };
    const result = reconcileCountBatch(
      source,
      [row("a"), row("b")],
      [
        { id: "a", count: { ...count, version: 5, quantity: 10 } },
        { id: "b", count: { ...count, version: 5, quantity: 10 } },
      ],
    );
    expect(result.data.counts[0].quantity).toBe(10);
    expect([...result.acknowledged]).toEqual(["a", "b"]);
    expect(source.counts[0].quantity).toBe(8);
  });
  it("leaves failed and unacknowledged events pending and ignores unrelated receipts", () => {
    const source = { ...makeDemo(), counts: [count] };
    const result = reconcileCountBatch(
      source,
      [row("a"), row("b")],
      [
        { id: "a", error: "Locked" },
        { id: "b", count: { ...count, employeeId: "other" } },
        { id: "unrelated", count },
      ],
    );
    expect(result.acknowledged.size).toBe(0);
    expect(result.data.counts).toEqual([count]);
  });
  it("never replaces a newer cached count with an older receipt", () => {
    const source = {
      ...makeDemo(),
      counts: [{ ...count, version: 9, quantity: 14 }],
    };
    const result = reconcileCountBatch(
      source,
      [row("a")],
      [{ id: "a", count }],
    );
    expect(result.data.counts[0].quantity).toBe(14);
    expect(result.acknowledged.has("a")).toBe(true);
  });
});
