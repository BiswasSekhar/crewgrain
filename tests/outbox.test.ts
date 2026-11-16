import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import type { OutboxRow } from "../src/domain/types";
describe("durable web outbox", () => {
  it("keeps 20 entries across a module restart and retries the same key safely", async () => {
    let storage = await import("../src/lib/storage.web");
    for (let i = 0; i < 20; i++)
      await storage.putOutbox({
        id: `offline-${i}`,
        employeeId: "worker-A",
        operationId: "op-A",
        lotId: "lot-A",
        quantity: i + 1,
        kind: "counter",
        assignmentId: "task-A",
        delta: i % 2 === 0 ? 1 : -1,
        localOrder: 1000 + i,
        workDate: "2026-11-07",
        capturedAt: "2026-11-07T05:30:00Z",
        state: "pending",
        attempts: 0,
        nextAttemptAt: 0,
      });
    vi.resetModules();
    storage = await import("../src/lib/storage.web");
    const rows = await storage.listOutbox();
    expect(rows).toHaveLength(20);
    expect(rows.reduce((n, r) => n + r.quantity, 0)).toBe(210);
    expect(rows.filter((r) => r.delta === -1)).toHaveLength(10);
    expect(rows.map((r) => r.localOrder).sort((a, b) => a! - b!)).toEqual(
      Array.from({ length: 20 }, (_, i) => 1000 + i),
    );
    const retry: OutboxRow = {
      ...rows[0],
      attempts: 1,
      nextAttemptAt: Date.now() + 1000,
    };
    await storage.putOutbox(retry);
    expect(await storage.listOutbox()).toHaveLength(20);
    // Failed/invalid work remains durable, not silently deleted.
    await storage.putOutbox({
      ...retry,
      state: "attention",
      error: "Assignment ended",
    });
    expect(
      (await storage.listOutbox()).find((r) => r.id === retry.id)?.error,
    ).toBe("Assignment ended");
    for (const row of await storage.listOutbox())
      await storage.removeOutbox(row.id);
    expect(await storage.listOutbox()).toHaveLength(0);
  });
});
