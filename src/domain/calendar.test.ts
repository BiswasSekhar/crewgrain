import { describe, expect, it } from "vitest";
import {
  clampDate,
  inRange,
  monthOf,
  monthWeeks,
  shiftMonth,
} from "./calendar";

describe("calendar helpers", () => {
  it("builds Monday-first weeks with padding", () => {
    // 1 November 2026 is a Sunday, so the first week has six empty cells.
    const weeks = monthWeeks("2026-11");
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "2026-11-01",
    ]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-11-01");
    expect(days[29]).toBe("2026-11-30");
  });
  it("handles leap February and a month that starts on Monday", () => {
    expect(monthWeeks("2028-02").flat().filter(Boolean)).toHaveLength(29);
    // 1 June 2026 is a Monday: no leading padding.
    expect(monthWeeks("2026-06")[0][0]).toBe("2026-06-01");
  });
  it("moves between months across year ends", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-03", -14)).toBe("2025-01");
    expect(monthOf("2026-11-12")).toBe("2026-11");
  });
  it("checks and clamps a date range", () => {
    expect(inRange("2026-11-12", "2026-11-10", "2026-11-20")).toBe(true);
    expect(inRange("2026-11-09", "2026-11-10", "2026-11-20")).toBe(false);
    expect(inRange("2026-11-21", "2026-11-10", "2026-11-20")).toBe(false);
    expect(inRange("2030-01-01")).toBe(true);
    expect(clampDate("2026-11-01", "2026-11-10", "2026-11-20")).toBe(
      "2026-11-10",
    );
    expect(clampDate("2026-12-01", "2026-11-10", "2026-11-20")).toBe(
      "2026-11-20",
    );
    expect(clampDate("2026-11-15", "2026-11-10", "2026-11-20")).toBe(
      "2026-11-15",
    );
  });
});
