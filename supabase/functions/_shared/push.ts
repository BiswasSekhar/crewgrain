export const tokenPattern = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;

// Generic wording only: never names, counts, wages or amounts.
export const copy: Record<
  string,
  { title: string; body: string; view: string }
> = {
  request_submitted: {
    title: "Crewgrain",
    body: "A new employee request needs your review.",
    view: "requests",
  },
  report_submitted: {
    title: "Crewgrain",
    body: "A day summary is ready for you.",
    view: "approvals",
  },
  day_approved: {
    title: "Crewgrain",
    body: "Your day has been approved.",
    view: "today",
  },
  count_change_pending: {
    title: "Crewgrain",
    body: "A count change is waiting for approval.",
    view: "approvals",
  },
  admin_day_checked: {
    title: "Crewgrain",
    body: "A captain checked an employee's day.",
    view: "approvals",
  },
  line_check_complete: {
    title: "Crewgrain",
    body: "A line's check is complete for today.",
    view: "overview",
  },
  // Scheduled kinds (sent by the cron job, never requested by a client).
  morning_plan: {
    title: "Crewgrain",
    body: "Set up today's line: choose styles and assign work.",
    view: "today",
  },
  evening_check: {
    title: "Crewgrain",
    body: "Time to check today's counts for your line.",
    view: "approvals",
  },
};

/** Events a signed-in caller may request through "notify". */
export const clientEvents = new Set([
  "request_submitted",
  "report_submitted",
  "day_approved",
  "count_change_pending",
  "admin_day_checked",
  "line_check_complete",
]);
export const scheduledKinds = new Set(["morning_plan", "evening_check"]);

/** Constant-time string comparison (hashes first so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const h = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export function pushMessages(event: string, tokens: string[]) {
  const c = copy[event];
  return tokens.map((to) => ({
    to,
    title: c.title,
    body: c.body,
    data: { view: c.view },
    channelId: "default",
    sound: null,
  }));
}
