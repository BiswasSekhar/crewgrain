import { describe, expect, it } from "vitest";
import { setupTokenFromLink } from "./setup-link";

const a = "a1".repeat(32);
const b = "b2".repeat(32);

describe("setupTokenFromLink", () => {
  it("reads an https link with a hash", () => {
    expect(setupTokenFromLink(`https://crewgrain.example/#setup=${a}`)).toBe(a);
  });
  it("reads the app deep link", () => {
    expect(setupTokenFromLink(`crewgrain://link?setup=${a}`)).toBe(a);
  });
  it("accepts a bare token with surrounding whitespace", () => {
    expect(setupTokenFromLink(`  \n${a}\n `)).toBe(a);
  });
  it("lowercases an uppercase token", () => {
    expect(setupTokenFromLink(a.toUpperCase())).toBe(a);
    expect(setupTokenFromLink(`crewgrain://link?setup=${a.toUpperCase()}`)).toBe(a);
  });
  it("rejects two tokens", () => {
    expect(() =>
      setupTokenFromLink(`crewgrain://link?setup=${a}&setup=${b}`),
    ).toThrow();
    expect(() => setupTokenFromLink(`${a}${b}`)).toThrow();
  });
  it("rejects a wrong length token", () => {
    expect(() => setupTokenFromLink(a.slice(1))).toThrow();
    expect(() => setupTokenFromLink(`crewgrain://link?setup=${a}0`)).toThrow();
  });
  it("rejects other schemes", () => {
    expect(() =>
      setupTokenFromLink(`javascript:alert(1)//?setup=${a}`),
    ).toThrow();
    expect(() => setupTokenFromLink(`ftp://x.test/?setup=${a}`)).toThrow();
    expect(() =>
      setupTokenFromLink(`http://example.com/?setup=${a}`),
    ).toThrow();
  });
  it("rejects empty input", () => {
    expect(() => setupTokenFromLink("")).toThrow();
    expect(() => setupTokenFromLink("   ")).toThrow();
  });
});
