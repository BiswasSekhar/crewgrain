// The service provider can pause the whole service. The database then refuses
// every call with the text "SERVICE_PAUSED|<message>". This reads that text out
// of whatever shape an error arrives in.
const MARK = "SERVICE_PAUSED|";

/** Shown when the provider left no message. */
export const PAUSED_FALLBACK =
  "This service is paused. Please contact your service provider.";

function textOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message ?? "");
  return "";
}

/** The pause message when the error is a service pause, otherwise null. */
export function parsePause(err: unknown): { message: string } | null {
  const text = textOf(err);
  const at = text.indexOf(MARK);
  if (at < 0) return null;
  return { message: text.slice(at + MARK.length).trim() };
}

/** Banner text when the provider shows a notice without a message. */
export const PAUSED_WARNING =
  "This service may be paused soon. Please contact your service provider.";
