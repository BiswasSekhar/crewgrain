import { describe, expect, it } from "vitest";
import { idLetter, nextEmployeeId } from "./rules";

const staff = (...ids: string[]) => ({
  employees: ids.map((employeeId) => ({ employeeId })) as never,
});

describe("new employee ID", () => {
  it("uses the first letter of the name", () => {
    expect(idLetter("Ravi Kumar")).toBe("R");
    expect(idLetter("  anitha")).toBe("A");
    expect(idLetter("Élan")).toBe("E");
    expect(idLetter("4th Shift Ravi")).toBe("T");
  });
  it("falls back to E when the name has no Latin letter", () => {
    expect(idLetter("രവി")).toBe("E");
    expect(idLetter("")).toBe("E");
    expect(idLetter("123")).toBe("E");
  });
  it("adds three digits and keeps the leading zeros", () => {
    expect(nextEmployeeId(staff(), "Ravi", () => 0.482)).toBe("R482");
    expect(nextEmployeeId(staff(), "Ravi", () => 0.007)).toBe("R007");
    expect(nextEmployeeId(staff(), "Ravi", () => 0)).toBe("R000");
    expect(nextEmployeeId(staff(), "Ravi", () => 0.9999)).toBe("R999");
  });
  it("matches the database rule for staff IDs", () => {
    for (const name of ["Ravi", "Mary Joseph", "ഷീജ", "Élan"])
      expect(nextEmployeeId(staff(), name)).toMatch(/^[A-Z0-9-]{2,24}$/);
  });
  it("skips IDs already used by staff or pending requests", () => {
    // Draws: 482 (used by staff), 482 again, 113 (used by a pending request),
    // then 555, which is free.
    const values = [0.482, 0.482, 0.113, 0.555];
    let i = 0;
    const id = nextEmployeeId(
      { ...staff("r482"), requests: [{ employeeId: "R113" }] },
      "Ravi",
      () => values[i++],
    );
    expect(id).toBe("R555");
  });
  it("never repeats an existing ID", () => {
    const used = Array.from(
      { length: 600 },
      (_, n) => `S${String(n).padStart(3, "0")}`,
    );
    const seen = new Set(used);
    for (let n = 0; n < 200; n += 1) {
      const id = nextEmployeeId(staff(...used), "Sita");
      expect(seen.has(id)).toBe(false);
      expect(id.startsWith("S")).toBe(true);
    }
  });
  it("stops with a clear message when a letter is full", () => {
    const all = Array.from(
      { length: 1000 },
      (_, n) => `Q${String(n).padStart(3, "0")}`,
    );
    expect(() => nextEmployeeId(staff(...all), "Quinn")).toThrow(
      /No free employee IDs/,
    );
  });
});
