import type { Snapshot } from "./types";
/** Style ids planned for a line on a day, in plan order. */
export function plannedStyleIds(
  s: Snapshot,
  unitId: string,
  date: string,
): string[] {
  return (s.dayPlan ?? [])
    .filter((x) => x.unitId === unitId && x.workDate === date)
    .sort((a, b) => a.position - b.position)
    .map((x) => x.styleId);
}
/** How much of a planned style is already in use on that line and day. */
export function styleUsage(
  s: Snapshot,
  unitId: string,
  date: string,
  styleId: string,
) {
  const lineEmployees = new Set(
      s.employees.filter((e) => e.unitId === unitId).map((e) => e.id),
    ),
    mine = s.assignments.filter(
      (a) =>
        a.active &&
        a.workDate === date &&
        lineEmployees.has(a.employeeId) &&
        s.operations.some(
          (o) => o.id === a.operationId && o.styleId === styleId,
        ),
    ),
    ids = new Set(mine.map((a) => a.id));
  return {
    assigned: mine.length,
    counted: mine.filter((a) =>
      (s.counts ?? []).some(
        (n) => n.assignmentId === a.id && n.workDate === date && n.quantity > 0,
      ),
    ).length,
    approved: (s.days ?? []).some(
      (day) =>
        day.workDate === date && day.tasks.some((t) => ids.has(t.assignmentId)),
    ),
  };
}
