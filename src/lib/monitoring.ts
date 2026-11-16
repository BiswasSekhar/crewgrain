import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { scrub } from "./push-core";
import { isExpectedFailure } from "./request-limits";

let started = false;

function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.message) event.message = scrub(event.message);
  for (const exception of event.exception?.values ?? [])
    if (exception.value) exception.value = scrub(exception.value);
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrub(crumb.message);
    // Request bodies and form data can carry people's details; keep none.
    if (crumb.data) crumb.data = { category: crumb.category };
  }
  delete event.user;
  delete event.request;
  delete event.extra;
  return event;
}

/** Starts Sentry only in real builds that have a DSN. Safe to call twice. */
export function initMonitoring() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (started || !dsn) return;
  if (typeof __DEV__ !== "undefined" && __DEV__) return;
  if (process.env.EXPO_PUBLIC_ALLOW_DEMO === "true") return;
  started = true;
  const version = Constants.expoConfig?.version ?? "unknown";
  const updateId = Updates.updateId ?? undefined;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV || "production",
    release: version,
    dist: updateId,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
    beforeBreadcrumb(crumb) {
      if (crumb.message) crumb.message = scrub(crumb.message);
      if (crumb.category === "console") return null;
      if (crumb.data) crumb.data = { category: crumb.category };
      return crumb;
    },
  });
  Sentry.setTag("update_id", updateId ?? "embedded");
  Sentry.setTag("channel", Updates.channel ?? "none");
}

/** Reports a handled error. Does nothing when monitoring is off. */
export function captureError(error: unknown) {
  if (!started) return;
  Sentry.captureException(error);
}

/** Reports a failed save that was NOT an ordinary rule message: a stalled or
 *  failed request, a server error, or something unexpected. Does nothing when
 *  monitoring is off. Only the action name is attached, never the data. */
export function reportFailure(error: unknown, action: string, always = false) {
  if (!started || (!always && isExpectedFailure(error))) return;
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : String(error);
  Sentry.withScope((scope) => {
    scope.setTag("action", action);
    scope.setTag(
      "failure",
      code === "TIMEOUT" ? "timeout" : code || "unexpected",
    );
    Sentry.captureException(
      error instanceof Error ? error : new Error(message),
    );
  });
}

export const wrapRoot = <T extends React.ComponentType<any>>(
  component: T,
): T => (started ? (Sentry.wrap(component) as unknown as T) : component);
