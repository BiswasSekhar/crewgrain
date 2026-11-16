import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isExpectedFailure,
  makeTimedFetch,
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
} from "./request-limits";

// A fetch that never answers until it is aborted, like a stalled phone connection.
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError")),
    );
  });

describe("request time limit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stops a request that never answers and says so clearly", async () => {
    const timed = makeTimedFetch(1000, hanging);
    const result = timed("https://example.test").catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await result;
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toMatch(/not responding/);
  });
  it("lets a fast answer through untouched", async () => {
    const ok = new Response("ok");
    const timed = makeTimedFetch(1000, async () => ok);
    await expect(timed("https://example.test")).resolves.toBe(ok);
    // The timer is cleared, so nothing fires later.
    await vi.advanceTimersByTimeAsync(5000);
  });
  it("does not hide ordinary network errors as timeouts", async () => {
    const boom = new TypeError("Network request failed");
    const timed = makeTimedFetch(1000, async () => {
      throw boom;
    });
    await expect(timed("https://example.test")).rejects.toBe(boom);
  });
  it("still honours the caller's own abort", async () => {
    const own = new AbortController();
    const timed = makeTimedFetch(10000, hanging);
    const result = timed("https://example.test", { signal: own.signal }).catch(
      (e) => e,
    );
    own.abort();
    const error = await result;
    expect(error).not.toBeInstanceOf(RequestTimeoutError);
    expect((error as Error).name).toBe("AbortError");
  });
  it("uses a sensible default limit", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(15000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });
});

describe("which failures are worth reporting", () => {
  it("treats the database's own rule messages as expected", () => {
    for (const code of ["P0001", "42501", "22023", "54000", "23505", "23514"])
      expect(isExpectedFailure({ code, message: "Choose a valid day" })).toBe(
        true,
      );
    expect(isExpectedFailure(new Error("SERVICE_PAUSED|Payment pending"))).toBe(
      true,
    );
  });
  it("reports timeouts, server errors and surprises", () => {
    expect(isExpectedFailure(new RequestTimeoutError())).toBe(false);
    expect(isExpectedFailure({ code: "PGRST202", message: "x" })).toBe(false);
    expect(isExpectedFailure({ code: "XX000", message: "internal" })).toBe(
      false,
    );
    expect(isExpectedFailure(new TypeError("Network request failed"))).toBe(
      false,
    );
    expect(isExpectedFailure(null)).toBe(false);
  });
});
