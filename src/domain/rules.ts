import { numberLocale } from "../lib/i18n";
import type {
  Employee,
  Snapshot,
  EntryInput,
  ProductionEntry,
  Action,
} from "./types";
export function factoryDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dateOffset(days: number, today = factoryDate()) {
  return new Date(Date.parse(today + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function money(paise: number) {
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
export function compactMoney(paise: number) {
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(paise / 100);
}
function captainMoneySeries(s: Snapshot, unitId: string) {
  const totals = new Map<string, number>(),
    representedLegacy = new Set<string>(),
    add = (date: string, amount: number) =>
      totals.set(date, (totals.get(date) ?? 0) + amount);
  for (const count of s.counts ?? []) {
    if (count.unitId !== unitId) continue;
    const assignment = s.assignments.find((a) => a.id === count.assignmentId);
    if (!assignment) continue;
    const legacyKey = `${count.employeeId}:${assignment.operationId}:${assignment.lotId}:${count.workDate}`;
    representedLegacy.add(legacyKey);
    const day = s.days?.find(
        (d) =>
          d.employeeId === count.employeeId && d.workDate === count.workDate,
      ),
      checked = day?.tasks.find((t) => t.assignmentId === count.assignmentId),
      adjusted = (s.adjustments ?? [])
        .filter(
          (row) =>
            row.assignmentId === count.assignmentId &&
            row.workDate === count.workDate,
        )
        .reduce((sum, row) => sum + row.quantityDelta, 0),
      approved = !!day && day.status !== "needs_admin",
      quantity = approved
        ? (checked?.finalQuantity ?? count.quantity) + adjusted
        : count.quantity,
      rate = checked?.ratePaise ?? count.ratePaise;
    add(count.workDate, quantity * rate);
  }
  for (const entry of s.entries) {
    const key = `${entry.employeeId}:${entry.operationId}:${entry.lotId}:${entry.workDate}`;
    if (
      entry.unitId === unitId &&
      ["approved", "pending"].includes(entry.status) &&
      !representedLegacy.has(key)
    )
      add(entry.workDate, entry.quantity * entry.ratePaise);
  }
  return [...totals.entries()]
    .map(([workDate, amountPaise]) => ({ workDate, amountPaise }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
}
export function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
export function scopeSnapshot(s: Snapshot, actor: Employee): Snapshot {
  if (!actor.active)
    throw new Error("This account is inactive. Ask your admin.");
  if (actor.role === "admin") return s;
  const unit = actor.unitId;
  const teamMoney =
    actor.role === "captain"
      ? (s.teamMoney ?? captainMoneySeries(s, unit)).filter(
          (row) => row.amountPaise >= 0,
        )
      : undefined;
  const historicalLots = new Set(
    s.assignments.filter((a) => a.employeeId === actor.id).map((a) => a.lotId),
  );
  const historicalUnits = new Set(
    s.lots.filter((l) => historicalLots.has(l.id)).map((l) => l.unitId),
  );
  const historicalLines = new Set(
    s.lots.filter((l) => historicalLots.has(l.id)).map((l) => l.lineId),
  );
  const entries = s.entries
    .filter((e) =>
      actor.role === "worker" ? e.employeeId === actor.id : e.unitId === unit,
    )
    .map((e) => (actor.role === "captain" ? { ...e, ratePaise: 0 } : e));
  return {
    ...s,
    operationDefaults: (s.operationDefaults ?? []).filter((d) =>
      actor.role === "worker"
        ? d.employeeId === actor.id
        : s.employees.some((e) => e.id === d.employeeId && e.unitId === unit),
    ),
    teamMoney,
    dayPlan: (s.dayPlan ?? []).filter((x) => x.unitId === unit),
    rateSettings: undefined,
    styles: s.styles.map((x) => ({ ...x, perMinutePaise: undefined })),
    units: s.units.filter(
      (u) =>
        u.id === unit ||
        (actor.role === "worker" &&
          (historicalUnits.has(u.id) ||
            entries.some((e) => e.unitId === u.id))),
    ),
    lines: s.lines.filter(
      (l) =>
        l.unitId === unit ||
        (actor.role === "worker" &&
          (historicalLines.has(l.id) ||
            s.lots.some(
              (lot) =>
                lot.lineId === l.id && entries.some((e) => e.lotId === lot.id),
            ))),
    ),
    employees: s.employees.filter((e) =>
      actor.role === "worker" ? e.id === actor.id : e.unitId === unit,
    ),
    lots: s.lots.filter(
      (l) =>
        l.unitId === unit ||
        (actor.role === "worker" &&
          (historicalLots.has(l.id) || entries.some((e) => e.lotId === l.id))),
    ),
    assignments: s.assignments.filter((a) =>
      actor.role === "worker"
        ? a.employeeId === actor.id
        : s.lots.find((l) => l.id === a.lotId)?.unitId === unit,
    ),
    entries,
    requests:
      actor.role === "captain"
        ? s.requests.filter((r) => r.unitId === unit)
        : [],
    reports:
      actor.role === "captain"
        ? s.reports.filter((r) => r.unitId === unit)
        : [],
    audit: [],
    counts: s.counts
      ?.filter((c) =>
        actor.role === "worker" ? c.employeeId === actor.id : c.unitId === unit,
      )
      .map((c) => (actor.role === "captain" ? { ...c, ratePaise: 0 } : c)),
    days: s.days
      ?.filter((d) =>
        actor.role === "worker" ? d.employeeId === actor.id : d.unitId === unit,
      )
      .map((d) =>
        actor.role === "captain"
          ? { ...d, tasks: d.tasks.map((t) => ({ ...t, ratePaise: 0 })) }
          : d,
      ),
    devices: [],
    corrections: (s.corrections ?? []).filter((r) =>
      actor.role === "worker" ? r.employeeId === actor.id : r.unitId === unit,
    ),
    adjustments: (s.adjustments ?? [])
      .filter((r) =>
        actor.role === "worker" ? r.employeeId === actor.id : r.unitId === unit,
      )
      .map((r) =>
        actor.role === "captain" ? { ...r, ratePaise: 0, amountPaise: 0 } : r,
      ),
    flags:
      actor.role === "captain" ? s.flags.filter((f) => f.unitId === unit) : [],
    operations: s.operations.map((o) =>
      actor.role === "captain" ? { ...o, ratePaise: 0 } : o,
    ),
  };
}
export function validateEntry(
  s: Snapshot,
  actor: Employee,
  input: EntryInput,
  now = new Date(),
): ProductionEntry {
  if (!actor.active || actor.role !== "worker" || input.employeeId !== actor.id)
    throw new Error("Only the assigned active worker can record this work.");
  integer(input.quantity, 1, 2000, "Quantity");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.workDate) ||
    input.workDate > factoryDate(now) ||
    input.workDate < dateOffset(-2, factoryDate(now))
  )
    throw new Error("Choose today or either of the previous two days.");
  const lot = s.lots.find(
    (l) =>
      l.id === input.lotId &&
      l.status === "active" &&
      l.unitId === actor.unitId,
  );
  const operation = s.operations.find(
    (o) => o.id === input.operationId && o.styleId === lot?.styleId,
  );
  if (
    !lot ||
    !operation ||
    !s.assignments.some(
      (a) =>
        a.active &&
        a.employeeId === actor.id &&
        a.lotId === lot.id &&
        a.operationId === operation.id,
    )
  )
    throw new Error(
      "This work is no longer assigned to you. Ask your captain.",
    );
  return {
    id: input.id,
    employeeId: actor.id,
    unitId: lot.unitId,
    lotId: lot.id,
    operationId: operation.id,
    quantity: input.quantity,
    workDate: input.workDate,
    ratePaise: operation.ratePaise,
    status: "pending",
    createdAt: now.toISOString(),
  };
}
export function editable(
  entry: ProductionEntry,
  actor: Employee,
  now = new Date(),
) {
  return (
    entry.status === "pending" &&
    actor.role === "worker" &&
    entry.employeeId === actor.id &&
    now.getTime() - Date.parse(entry.createdAt) <= 3600000
  );
}
export function requireAdmin(actor: Employee) {
  if (actor.role !== "admin" || !actor.active)
    throw new Error("Admin access is required.");
}
export function requireUnit(actor: Employee, unitId: string) {
  if (
    !actor.active ||
    (actor.role !== "admin" &&
      (actor.role !== "captain" || actor.unitId !== unitId))
  )
    throw new Error("You do not have access to this unit.");
}
export function validateAction(a: Action) {
  if ("name" in a && !a.name.trim()) throw new Error("Enter a name.");
  if (
    "employeeId" in a &&
    ["add_employee", "request_employee"].includes(a.type) &&
    !/^[A-Za-z0-9-]{2,24}$/.test(a.employeeId)
  )
    throw new Error(
      "Employee ID must contain 2–24 letters, numbers or hyphens.",
    );
  if ("ratePaise" in a) integer(a.ratePaise, 0, 10000000, "Rate in paise");
  if ("totalPieces" in a) integer(a.totalPieces, 1, 1000000, "Lot quantity");
  if (a.type === "submit_report") {
    integer(a.completed, 0, 1000000, "Completed pieces");
    integer(a.packed, 0, 1000000, "Packed pieces");
    integer(a.scheduled, 0, 1000, "Scheduled employees");
    integer(a.present, 0, a.scheduled, "Present employees");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.workDate))
      throw new Error("Enter a valid report date.");
  }
  if (
    a.type === "review_request" &&
    a.decision === "rejected" &&
    !a.reason.trim()
  )
    throw new Error("Enter a rejection reason.");
  if (
    a.type === "review_entry" &&
    a.decision === "rejected" &&
    !a.reason.trim()
  )
    throw new Error("Enter a rejection reason.");
  if (
    a.type === "review_report" &&
    a.decision === "changes_requested" &&
    !a.reason.trim()
  )
    throw new Error("Explain what needs to change.");
}
/** Line number used as the first digit of employee IDs (U01 -> 1, else order). */
export function lineNumber(s: Pick<Snapshot, "units">, unitId: string) {
  const unit = s.units.find((u) => u.id === unitId);
  const fromCode = Number(unit?.code.replace(/\D/g, ""));
  if (fromCode >= 1 && fromCode <= 9) return fromCode;
  const index = [...s.units]
    .sort((a, b) => a.code.localeCompare(b.code))
    .findIndex((u) => u.id === unitId);
  return Math.min(9, Math.max(1, index + 1));
}
/** The first letter (A to Z) of a name, or "E" when it has none (for example a
 *  name written only in another script). Accents are dropped: "Élan" gives E. */
export function idLetter(name: string) {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return plain.match(/[A-Z]/)?.[0] ?? "E";
}
/** New employee ID: the first letter of the name plus three random digits
 *  (Ravi gives R482). Skips any ID already used, deleted staff included. The
 *  database also refuses a repeat, so a rare clash is caught there. */
export function nextEmployeeId(
  s: Pick<Snapshot, "employees"> & { requests?: { employeeId?: string }[] },
  name: string,
  random: () => number = Math.random,
) {
  const letter = idLetter(name),
    used = new Set<string>(
      [
        ...s.employees.map((e) => e.employeeId),
        ...(s.requests ?? []).map((r) => r.employeeId ?? ""),
      ].map((id) => id.toUpperCase()),
    );
  for (let tries = 0; tries < 200; tries += 1) {
    const id = `${letter}${String(Math.floor(random() * 1000)).padStart(3, "0")}`;
    if (!used.has(id)) return id;
  }
  throw new Error(
    "No free employee IDs for this letter. Use a different name.",
  );
}
export const DEFAULT_PER_MINUTE_PAISE = 350;
/** Pay for one piece: seconds taken / 60 x rate per minute, in paise. */
export function taskRate(seconds: number, perMinutePaise: number) {
  return Math.round((seconds / 60) * perMinutePaise);
}
/** The rate per minute that applies to a style (style override, else factory default). */
export function perMinuteFor(
  s: Pick<Snapshot, "styles" | "rateSettings">,
  styleId: string,
) {
  return (
    s.styles.find((x) => x.id === styleId)?.perMinutePaise ??
    s.rateSettings?.perMinutePaise ??
    DEFAULT_PER_MINUTE_PAISE
  );
}
