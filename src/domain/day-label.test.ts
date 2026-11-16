import { describe, expect, it } from "vitest";
import { dayLabelKind } from "./calendar";

describe("dayLabelKind", () => {
  const today = "2026-11-12";
  it("names today, yesterday and tomorrow", () => {
    expect(dayLabelKind("2026-11-12", today)).toBe("today");
    expect(dayLabelKind("2026-11-11", today)).toBe("yesterday");
    expect(dayLabelKind("2026-11-13", today)).toBe("tomorrow");
  });
  it("uses a weekday date in the current year", () => {
    expect(dayLabelKind("2026-11-05", today)).toBe("sameYear");
    expect(dayLabelKind("2026-01-01", today)).toBe("sameYear");
  });
  it("adds the year for other years", () => {
    expect(dayLabelKind("2025-11-12", today)).toBe("otherYear");
    expect(dayLabelKind("2027-01-02", today)).toBe("otherYear");
  });
  it("handles year boundaries for yesterday and tomorrow", () => {
    expect(dayLabelKind("2025-12-31", "2026-01-01")).toBe("yesterday");
    expect(dayLabelKind("2027-01-01", "2026-12-31")).toBe("tomorrow");
  });
});
