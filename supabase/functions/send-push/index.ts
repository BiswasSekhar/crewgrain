import {
  service,
  json,
  headers,
  invalidOrigin,
  parse,
} from "../_shared/security.ts";
import {
  chunk,
  clientEvents,
  copy,
  pushMessages,
  safeEqual,
  scheduledKinds,
  tokenPattern,
} from "../_shared/push.ts";

const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sends one generic message per token and removes tokens Expo says are dead.
async function deliver(
  db: ReturnType<typeof service>,
  event: string,
  tokens: string[],
) {
  const invalid: string[] = [];
  let sent = 0;
  for (const batch of chunk(tokens, 100)) {
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(pushMessages(event, batch)),
    });
    if (!response.ok) continue;
    const result = await response.json().catch(() => null);
    (result?.data ?? []).forEach(
      (ticket: { status: string; details?: { error?: string } }, i: number) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered")
          invalid.push(batch[i]);
      },
    );
  }
  if (invalid.length) await db.rpc("remove_push_tokens", { p_tokens: invalid });
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, {
      headers: {
        ...headers(req),
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-device-token",
      },
    });
  if (req.method !== "POST" || invalidOrigin(req))
    return json(req, { error: "Request not allowed" }, 405);
  try {
    const body = await parse(req, 4096),
      db = service();

    // A paused service sends no notifications. If the gate cannot be read,
    // work continues (the database refuses calls on its own).
    const gate = await db.rpc("service_gate");
    if ((gate.data as { state?: string } | null)?.state === "suspended")
      return body.operation === "scheduled"
        ? json(req, { ok: true, sent: 0, paused: true })
        : json(req, { error: "SERVICE_PAUSED|" }, 403);

    // 0. Scheduled reminders: no signed-in caller, a shared secret instead.
    if (body.operation === "scheduled") {
      const secret = Deno.env.get("SCHEDULED_PUSH_SECRET") ?? "";
      const given = req.headers.get("x-cron-secret") ?? "";
      if (secret.length < 32 || !(await safeEqual(given, secret)))
        return json(req, { error: "Not allowed" }, 401);
      const kind = String(body.kind ?? "");
      if (!scheduledKinds.has(kind))
        return json(req, { error: "Unknown reminder" }, 400);
      // The database claims recipients, so a repeated call sends nothing.
      const claimed = await db.rpc("scheduled_push_recipients", {
        p_kind: kind,
      });
      const tokens: string[] = (claimed.data ?? []).filter((t: string) =>
        tokenPattern.test(t),
      );
      return json(req, { ok: true, sent: await deliver(db, kind, tokens) });
    }

    // 1. Verify the caller: a linked staff phone, or a signed-in admin.
    let caller: string | null = null;
    const deviceToken = req.headers.get("x-device-token") ?? "";
    if (deviceToken) {
      if (!/^[a-f0-9]{64}$/.test(deviceToken))
        return json(req, { error: "This phone is not linked" }, 401);
      const found = await db.rpc("push_device_profile", {
        p_hash: await hash(deviceToken),
      });
      caller = found.data ?? null;
      if (!caller) return json(req, { error: "This phone is not linked" }, 401);
    } else {
      const bearer = req.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");
      if (!bearer) return json(req, { error: "Sign in required" }, 401);
      const {
        data: { user },
        error,
      } = await db.auth.getUser(bearer);
      if (error || !user) return json(req, { error: "Sign in required" }, 401);
      const { data: admin } = await db
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("role", "admin")
        .eq("active", true)
        .maybeSingle();
      if (!admin) return json(req, { error: "Admin access required" }, 403);
      caller = admin.id;
    }

    // 2. Register this phone's push token for the verified caller only.
    if (body.operation === "register") {
      if (typeof body.token !== "string" || !tokenPattern.test(body.token))
        return json(req, { error: "Invalid push token" }, 400);
      const stored = await db.rpc("service_register_push_token", {
        p_profile: caller,
        p_token: body.token,
        p_platform: ["android", "ios", "web"].includes(body.platform)
          ? body.platform
          : "android",
      });
      if (stored.error) return json(req, { error: "Could not save" }, 400);
      return json(req, { ok: true });
    }

    // 3. Notify. Recipients come from the database, never from the request.
    if (body.operation === "notify") {
      const event = String(body.event ?? "");
      if (!copy[event] || !clientEvents.has(event))
        return json(req, { error: "Unknown event" }, 400);
      const ref =
        typeof body.employeeId === "string" && uuid.test(body.employeeId)
          ? body.employeeId
          : null;
      const allowed = await db.rpc("push_rate_ok", {
        p_caller: caller,
        p_limit: 120,
      });
      if (allowed.error || !allowed.data)
        return json(req, { error: "Too many notifications. Slow down." }, 429);
      const recipients = await db.rpc("push_recipients", {
        p_event: event,
        p_caller: caller,
        p_ref: ref,
      });
      const tokens: string[] = (recipients.data ?? []).filter((t: string) =>
        tokenPattern.test(t),
      );
      const sent = await deliver(db, event, tokens);
      return json(req, { ok: true, sent });
    }
    return json(req, { error: "Unknown operation" }, 400);
  } catch {
    return json(req, { error: "Could not send. Try again." }, 503);
  }
});
