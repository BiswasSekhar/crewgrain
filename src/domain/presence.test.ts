import { describe, expect, it } from "vitest";
import { minutesAgo, presenceState, staffPresence } from "./presence";

const now = Date.parse("2026-11-12T10:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60000).toISOString();
const person = (id: string, name: string, extra = {}) =>
  ({ id, name, active: true, role: "worker", ...extra }) as never;

describe("presence", () => {
  it("is online within five minutes", () => {
    expect(presenceState(ago(0), now)).toBe("online");
    expect(presenceState(ago(5), now)).toBe("online");
    expect(presenceState(ago(6), now)).toBe("earlier");
  });
  it("is earlier within a day and away after that or when never seen", () => {
    expect(presenceState(ago(23 * 60), now)).toBe("earlier");
    expect(presenceState(ago(25 * 60), now)).toBe("away");
    expect(presenceState(null, now)).toBe("away");
    expect(presenceState("not a time", now)).toBe("away");
  });
  it("sorts online first, then most recent, and includes people never seen", () => {
    const rows = staffPresence(
      {
        employees: [
          person("a", "Asha"),
          person("b", "Bala"),
          person("c", "Chitra"),
          person("d", "Dev", { active: false }),
          person("e", "Esha", { deletedAt: "2026-11-01" }),
          person("f", "Farid", { role: "admin" }),
        ],
        presence: [
          { profileId: "a", lastSeenAt: ago(120) },
          { profileId: "b", lastSeenAt: ago(1) },
          { profileId: "f", lastSeenAt: ago(0) },
        ],
      },
      now,
    );
    expect(rows.map((r) => r.employee.name)).toEqual([
      "Farid",
      "Bala",
      "Asha",
      "Chitra",
    ]);
    expect(rows.map((r) => r.state)).toEqual([
      "online",
      "online",
      "earlier",
      "away",
    ]);
    expect(rows[3].lastSeenAt).toBeNull();
  });
  it("copes with no presence data at all", () => {
    const rows = staffPresence({ employees: [person("a", "Asha")] }, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("away");
  });
  it("counts minutes without going negative", () => {
    expect(minutesAgo(ago(12), now)).toBe(12);
    expect(minutesAgo(new Date(now + 60000).toISOString(), now)).toBe(0);
  });
});
