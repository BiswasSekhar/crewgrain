import { describe, expect, it } from "vitest";
import { makeDemo } from "../src/domain/demo";
import {
  ALL_PRODUCTION,
  filterProduction,
  groupProduction,
  productionRows,
} from "../src/domain/production";
import { ledger, totals } from "../src/domain/workspace";
import type { ProductionEntry } from "../src/domain/types";

function fixture() {
  const s = makeDemo();
  s.counts = [];
  s.days = [];
  s.adjustments = [];
  const entry = (
    id: string,
    unitId: string,
    employeeId: string,
    operationId: string,
    workDate: string,
    quantity: number,
    status: ProductionEntry["status"] = "pending",
  ): ProductionEntry => ({
    id,
    unitId,
    employeeId,
    operationId,
    lotId: "lot",
    workDate,
    quantity,
    status,
    ratePaise: 250,
    createdAt: "2026-11-10T10:00:00Z",
  });
  s.entries = [
    entry("a", "u1", "worker", "task1", "2026-11-10", 10, "approved"),
    entry("b", "u1", "w2", "task1", "2026-11-10", 20),
    entry("c", "u1", "worker", "task2", "2026-11-09", 30),
    entry("d", "u2", "w3", "task1", "2026-11-04", 40, "approved"),
    entry("old", "u1", "worker", "task1", "2026-11-03", 50),
    entry("future", "u1", "worker", "task1", "2026-11-11", 60),
    entry("rejected", "u1", "worker", "task1", "2026-11-10", 100, "rejected"),
    entry("void", "u1", "worker", "task1", "2026-11-10", 100, "void"),
  ];
  return s;
}
describe("production report", () => {
  it("includes exactly seven days through today and excludes rejected, void and future work", () => {
    const rows = productionRows(fixture(), "7", ALL_PRODUCTION, "2026-11-10");
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(totals(rows)).toEqual({
      pieces: 100,
      approved: 12500,
      pending: 12500,
    });
    expect(
      productionRows(fixture(), "1", ALL_PRODUCTION, "2026-11-10")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(
      productionRows(fixture(), "30", ALL_PRODUCTION, "2026-11-10"),
    ).toHaveLength(5);
    expect(
      productionRows(fixture(), "all", ALL_PRODUCTION, "2026-11-10"),
    ).toHaveLength(5);
  });
  it("filters line, current captain and employee without adding other lines", () => {
    const s = fixture(),
      rows = ledger(s);
    expect(
      filterProduction(s, rows, { ...ALL_PRODUCTION, line: "u2" }).map(
        (r) => r.id,
      ),
    ).toEqual(["d"]);
    expect(
      filterProduction(s, rows, { ...ALL_PRODUCTION, captain: "captain2" }).map(
        (r) => r.id,
      ),
    ).toEqual(["d"]);
    expect(
      filterProduction(s, rows, { ...ALL_PRODUCTION, employee: "w2" }).map(
        (r) => r.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterProduction(s, rows, {
        line: "u2",
        captain: "captain",
        employee: "all",
      }),
    ).toHaveLength(0);
    expect(
      filterProduction(s, rows, { ...ALL_PRODUCTION, captain: "missing" }),
    ).toHaveLength(0);
  });
  it("reconciles every line, day, task and employee subtotal to the period total", () => {
    const rows = productionRows(fixture(), "7", ALL_PRODUCTION, "2026-11-10");
    const lines = groupProduction(rows, (r) => r.unitId);
    const leaves = lines.flatMap((line) =>
      groupProduction(line.rows, (r) => r.workDate).flatMap((day) =>
        groupProduction(day.rows, (r) => r.operationId).flatMap((task) =>
          groupProduction(task.rows, (r) => r.employeeId),
        ),
      ),
    );
    expect(leaves.reduce((n, x) => n + x.pieces, 0)).toBe(totals(rows).pieces);
    expect(leaves.reduce((n, x) => n + x.approved + x.pending, 0)).toBe(
      totals(rows).approved + totals(rows).pending,
    );
    expect(leaves.flatMap((x) => x.rows.map((r) => r.id)).sort()).toEqual(
      rows.map((r) => r.id).sort(),
    );
    expect(
      groupProduction(
        lines.find((x) => x.id === "u1")!.rows,
        (r) => r.workDate,
      ),
    ).toHaveLength(2);
    expect(
      groupProduction(
        rows.filter((r) => r.unitId === "u1" && r.workDate === "2026-11-10"),
        (r) => r.operationId,
      ),
    ).toHaveLength(1);
    expect(
      groupProduction(
        rows.filter((r) => r.workDate === "2026-11-10"),
        (r) => r.employeeId,
      ),
    ).toHaveLength(2);
  });
  it("returns empty groups and zero totals for no matching work", () => {
    const rows = productionRows(
      fixture(),
      "7",
      { ...ALL_PRODUCTION, line: "unknown" },
      "2026-11-10",
    );
    expect(groupProduction(rows, (r) => r.unitId)).toEqual([]);
    expect(totals(rows)).toEqual({ pieces: 0, approved: 0, pending: 0 });
  });
});
