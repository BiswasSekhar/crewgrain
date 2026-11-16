import { formatDate } from "../lib/i18n";
import type { Snapshot } from "./types";
import { dateOffset, factoryDate } from "./rules";
import { ledger, totals, type LedgerRow } from "./workspace";
export type ProductionFilters = {
  line: string;
  captain: string;
  employee: string;
};
export const ALL_PRODUCTION: ProductionFilters = {
  line: "all",
  captain: "all",
  employee: "all",
};
export function filterProduction(
  s: Snapshot,
  rows: LedgerRow[],
  filters: ProductionFilters,
) {
  const captain = s.employees.find(
    (e) => e.id === filters.captain && e.role === "captain",
  );
  return rows.filter(
    (row) =>
      !["void", "rejected"].includes(row.status) &&
      (filters.line === "all" || row.unitId === filters.line) &&
      (filters.captain === "all" ||
        (!!captain && row.unitId === captain.unitId)) &&
      (filters.employee === "all" || row.employeeId === filters.employee),
  );
}
export function productionRows(
  s: Snapshot,
  period: string,
  filters = ALL_PRODUCTION,
  today = factoryDate(),
) {
  const start =
    period === "all" ? "0000-01-01" : dateOffset(-(Number(period) - 1), today);
  return filterProduction(
    s,
    ledger(s).filter((row) => row.workDate >= start && row.workDate <= today),
    filters,
  );
}
export function groupProduction(
  rows: LedgerRow[],
  key: (row: LedgerRow) => string,
) {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return [...groups].map(([id, records]) => ({
    id,
    rows: records,
    ...totals(records),
  }));
}
export const productionDate = (date: string) =>
  formatDate(new Date(`${date}T12:00:00Z`), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
