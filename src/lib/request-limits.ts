/** Any call that gets no answer for this long is stopped, so a weak mobile
 *  connection shows a clear message instead of an endless "Saving...". */
export const REQUEST_TIMEOUT_MS = 25000;

export class RequestTimeoutError extends Error {
  code = "TIMEOUT";
  constructor() {
    super("The server is not responding. Check your connection and try again.");
    this.name = "RequestTimeoutError";
  }
}

/** Wraps fetch with a time limit. A caller's own abort signal still works. */
export function makeTimedFetch(
  limitMs: number = REQUEST_TIMEOUT_MS,
  base: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const caller = init?.signal;
    if (caller) {
      if (caller.aborted) controller.abort();
      else
        caller.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limitMs);
    try {
      return await base(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new RequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

// Messages the database raises on purpose for people (rules, validation, access).
const EXPECTED_CODES = new Set([
  "P0001",
  "42501",
  "22023",
  "54000",
  "23505",
  "23514",
]);

/** True for ordinary messages shown to people (a rule, a validation, a paused
 *  service). False for stalled requests, server errors and anything unexpected,
 *  which are the ones worth reporting. */
export function isExpectedFailure(error: unknown) {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : String(error);
  return EXPECTED_CODES.has(code) || message.startsWith("SERVICE_PAUSED");
}
