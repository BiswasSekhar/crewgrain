export const pushTokenPattern = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;
/** Screens a tap may open. Anything else is ignored. */
export const pushViews = [
  "approvals",
  "overview",
  "requests",
  "today",
  "people",
] as const;

/** Safe route for a tapped notification, or null. */
export function pushTarget(data: unknown): { view: string } | null {
  const view = (data as { view?: unknown } | null)?.view;
  return typeof view === "string" &&
    (pushViews as readonly string[]).includes(view)
    ? { view }
    : null;
}

/** Removes names, phone numbers, emails and staff ids from free text. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .replace(/\b[A-Z]{1,4}-?\d{1,6}\b/g, "[id]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[uuid]",
    );
}
