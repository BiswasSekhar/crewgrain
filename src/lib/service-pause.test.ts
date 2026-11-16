import { describe, expect, it } from "vitest";
import { PAUSED_FALLBACK, parsePause } from "./service-pause";

describe("parsePause", () => {
  it("reads the message from a string, an Error and an error-like object", () => {
    expect(parsePause("SERVICE_PAUSED|Payment due")).toEqual({
      message: "Payment due",
    });
    expect(parsePause(new Error("SERVICE_PAUSED|  Pay up  "))).toEqual({
      message: "Pay up",
    });
    expect(
      parsePause({ message: "SERVICE_PAUSED|Hold", code: "P0001" }),
    ).toEqual({ message: "Hold" });
  });
  it("allows an empty message", () => {
    expect(parsePause("SERVICE_PAUSED|")).toEqual({ message: "" });
  });
  it("finds the marker inside longer text and keeps later pipes", () => {
    expect(parsePause("Error: SERVICE_PAUSED|a | b")).toEqual({
      message: "a | b",
    });
  });
  it("ignores everything else", () => {
    expect(parsePause("Could not complete this.")).toBeNull();
    expect(parsePause(null)).toBeNull();
    expect(parsePause(undefined)).toBeNull();
    expect(parsePause({})).toBeNull();
    expect(parsePause(42)).toBeNull();
  });
  it("has a polite fallback text", () => {
    expect(PAUSED_FALLBACK).toMatch(/paused/);
  });
});
