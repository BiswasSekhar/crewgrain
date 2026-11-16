/**
 * Navigation trail: where the user came from, so Back returns there and not to
 * a fixed parent screen. Pure functions only; the shell holds the array.
 */
export type Loc = {
  view: string;
  line?: string;
  captain?: string;
  employee?: string;
  period?: string;
  date?: string;
};
export type Trail = readonly Loc[];
export const MAX_TRAIL = 20;

const KEYS = ["view", "line", "captain", "employee", "period", "date"] as const;

/** Drops empty values so `{line: undefined}` and `{}` are the same place. */
export function clean(loc: Loc): Loc {
  const out: Loc = { view: loc.view };
  for (const key of KEYS) if (key !== "view" && loc[key]) out[key] = loc[key];
  return out;
}
export function sameLoc(a: Loc, b: Loc): boolean {
  return KEYS.every((key) => (a[key] || undefined) === (b[key] || undefined));
}
export const locKey = (loc: Loc) =>
  KEYS.map((key) => loc[key] ?? "").join("\u0001");

/**
 * A forward move from `from` to `to`. Returns the new trail.
 * - Same place: nothing changes.
 * - Going to where we just came from: counts as going back (no loop).
 * - Otherwise `from` is pushed (never twice in a row), capped at MAX_TRAIL.
 */
export function push(trail: Trail, from: Loc, to: Loc): Trail {
  const a = clean(from),
    b = clean(to);
  if (sameLoc(a, b)) return trail;
  const top = trail[trail.length - 1];
  if (top && sameLoc(top, b)) return trail.slice(0, -1);
  if (top && sameLoc(top, a)) return trail;
  return [...trail, a].slice(-MAX_TRAIL);
}
/** Pressing a bottom tab or sidebar item starts a fresh trail. */
export function reset(): Trail {
  return [];
}
/**
 * Back: the latest place we left, with every selection restored. With an empty
 * trail (deep link, reload) the caller's fixed parent is used instead.
 */
export function back(
  trail: Trail,
  fallbackView: string,
): { loc: Loc; trail: Trail; fromTrail: boolean } {
  const top = trail[trail.length - 1];
  return top
    ? { loc: top, trail: trail.slice(0, -1), fromTrail: true }
    : { loc: { view: fallbackView }, trail, fromTrail: false };
}
/** Where Back will land, without moving. */
export function peek(trail: Trail, fallbackView: string): Loc {
  return back(trail, fallbackView).loc;
}
