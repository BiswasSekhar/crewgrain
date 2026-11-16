import type { Employee, Snapshot } from "./types";

/** Someone whose app talked to the server in the last 5 minutes is "online". */
export const ONLINE_MS = 5 * 60 * 1000;
/** Seen today but not in the last 5 minutes. */
export type PresenceState = "online" | "earlier" | "away";

export type PresenceRow = {
  employee: Employee;
  /** ISO time, or null when this person has not been seen in the last 7 days. */
  lastSeenAt: string | null;
  state: PresenceState;
};

/** Online within 5 minutes; "earlier" within 24 hours; otherwise "away". */
export function presenceState(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
): PresenceState {
  const at = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(at)) return "away";
  const age = now - at;
  if (age <= ONLINE_MS) return "online";
  return age <= 24 * 3600 * 1000 ? "earlier" : "away";
}
/** Every active person with their last-seen state, most recent first. Admins
 *  are included so the owner can see who else is signed in. */
export function staffPresence(
  s: Pick<Snapshot, "employees" | "presence">,
  now = Date.now(),
): PresenceRow[] {
  const seen = new Map(
    (s.presence ?? []).map((p) => [p.profileId, p.lastSeenAt]),
  );
  const order = { online: 0, earlier: 1, away: 2 } as const;
  return s.employees
    .filter((e) => e.active && !e.deletedAt)
    .map((employee) => {
      const lastSeenAt = seen.get(employee.id) ?? null;
      return { employee, lastSeenAt, state: presenceState(lastSeenAt, now) };
    })
    .sort(
      (a, b) =>
        order[a.state] - order[b.state] ||
        Date.parse(b.lastSeenAt ?? "0") - Date.parse(a.lastSeenAt ?? "0") ||
        a.employee.name.localeCompare(b.employee.name),
    );
}
/** Whole minutes since the time, never negative. */
export function minutesAgo(lastSeenAt: string, now = Date.now()) {
  return Math.max(0, Math.round((now - Date.parse(lastSeenAt)) / 60000));
}
