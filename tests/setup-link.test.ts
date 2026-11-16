import { describe, it, expect } from "vitest";
import { setupTokenFromLink } from "../src/lib/setup-link";
const token = "a1".repeat(32);
describe("staff setup links", () => {
  it("accepts the issued web and native link forms", () => {
    expect(setupTokenFromLink(` https://crewgrain.example/#setup=${token} `)).toBe(
      token,
    );
    expect(setupTokenFromLink(`crewgrain:///?setup=${token}`)).toBe(token);
    expect(setupTokenFromLink(`http://127.0.0.1:8082/#setup=${token}`)).toBe(
      token,
    );
  });
  it("rejects unsafe URLs, incomplete tokens and ambiguous parameters", () => {
    for (const value of [
      "",
      `javascript:alert(1)#setup=${token}`,
      `http://untrusted.example/#setup=${token}`,
      "https://crewgrain.example/#setup=123456",
      `https://crewgrain.example/?setup=${token}#setup=${token}`,
      `https://crewgrain.example/?setup=${token}&setup=${token}`,
    ]) {
      expect(() => setupTokenFromLink(value)).toThrow("full setup link");
    }
  });
});
