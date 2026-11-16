import {
  service,
  json,
  headers,
  invalidOrigin,
  parse,
} from "../_shared/security.ts";
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
// Database errors raised on purpose for people (access denied, business rules,
// validation, the tap-rate guard) are safe to show. Anything else (syntax,
// constraint, connection, internal errors) could reveal schema details, so it
// is replaced by a generic message. The code is still returned: the app uses it
// to decide whether a failed change can be retried.
const SAFE_CODES = new Set(["42501", "P0001", "22023", "54000"]);
const safeMessage = (error: { message?: string; code?: string }) =>
  SAFE_CODES.has(error.code ?? "") && error.message
    ? error.message
    : "Could not complete this. Try again.";
const cleanBatch = (data: unknown) =>
  Array.isArray(data)
    ? data.map((item) =>
        item && typeof item === "object" && "error" in item
          ? {
              ...item,
              error: safeMessage({
                message: String((item as { error: unknown }).error),
                code: String((item as { code?: unknown }).code ?? ""),
              }),
            }
          : item,
      )
    : data;
// The vendor can pause the whole service from the database. The gate says
// whether it is active, warning (still works) or suspended (nothing works). If
// the gate itself cannot be read, work continues: the database refuses calls
// on its own when the service is suspended.
const readGate = async (db: ReturnType<typeof service>) => {
  const result = await db.rpc("service_gate");
  const data = result.data as { state?: unknown; message?: unknown } | null;
  if (result.error || !data || typeof data !== "object")
    return { state: "active", message: "" };
  return {
    state: String(data.state ?? "active"),
    message: String(data.message ?? "").slice(0, 300),
  };
};
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
    const body = await parse(req, 512000),
      db = service();
    // Only the sign-in style operations read the gate here. Every other request
    // goes through phone_request, which refuses on its own when the service is
    // suspended, so checking again would just add a database round trip to each
    // tap upload on a phone.
    if (["gate", "sign-in", "issue", "redeem"].includes(body.operation)) {
      // "gate" needs no token: lets a phone ask whether the service is paused.
      const gate = await readGate(db);
      if (body.operation === "gate")
        return json(req, { state: gate.state, message: gate.message });
      if (gate.state === "suspended")
        return json(req, { error: "SERVICE_PAUSED|" + gate.message }, 403);
    }
    if (body.operation === "sign-in") {
      if (
        typeof body.identifier !== "string" ||
        !body.identifier.trim() ||
        body.identifier.length > 40
      )
        return json(req, { error: "Enter your ID or phone number." }, 400);
      // The first x-forwarded-for value is supplied by the client and can be
      // faked to dodge the limit. Trust the platform header, or the last entry
      // that the platform's own proxy appended.
      const forwarded = req.headers
        .get("x-forwarded-for")
        ?.split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const source =
        req.headers.get("cf-connecting-ip") ??
        forwarded?.[forwarded.length - 1] ??
        "unknown";
      const attempt = await db.rpc("reserve_staff_login", {
        p_key: "STAFF-" + (await hash(source)),
      });
      if (attempt.error)
        return json(req, { error: "Login is unavailable. Try again." }, 503);
      if (!attempt.data)
        return json(
          req,
          { error: "Too many attempts. Try again in 15 minutes." },
          429,
        );
      const deviceToken = random();
      const result = await db.rpc("staff_sign_in", {
        p_identifier: body.identifier,
        p_device_hash: await hash(deviceToken),
      });
      if (result.error)
        return json(req, { error: "Login is unavailable. Try again." }, 503);
      if (!result.data)
        return json(req, { error: "Check your ID or phone number." }, 401);
      return json(req, { deviceToken });
    }
    if (body.operation === "issue") {
      const bearer = req.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");
      if (!bearer) return json(req, { error: "Admin sign-in required" }, 401);
      const {
        data: { user },
        error,
      } = await db.auth.getUser(bearer);
      if (error || !user)
        return json(req, { error: "Admin sign-in required" }, 401);
      const { data: admin } = await db
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("role", "admin")
        .eq("active", true)
        .maybeSingle();
      if (!admin) return json(req, { error: "Admin access required" }, 403);
      const setupToken = random();
      const result = await db.rpc("create_phone_setup", {
        p_actor: admin.id,
        p_profile: body.profileId,
        p_hash: await hash(setupToken),
      });
      if (result.error)
        return json(req, { error: safeMessage(result.error) }, 400);
      return json(req, { setupToken });
    }
    if (body.operation === "redeem") {
      if (!/^[a-f0-9]{64}$/.test(body.setupToken ?? ""))
        return json(req, { error: "Invalid setup link" }, 400);
      const deviceToken = random();
      const result = await db.rpc("redeem_phone_setup", {
        p_hash: await hash(body.setupToken),
        p_device_hash: await hash(deviceToken),
      });
      if (result.error)
        return json(req, { error: safeMessage(result.error) }, 400);
      return json(req, { deviceToken });
    }
    const token = req.headers.get("x-device-token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token))
      return json(req, { error: "This phone is not linked" }, 401);
    const result = await db.rpc("phone_request", {
      p_hash: await hash(token),
      p_operation: body.operation,
      p_payload: body.payload ?? {},
    });
    if (result.error)
      return json(
        req,
        { error: safeMessage(result.error), code: result.error.code },
        result.error.code === "42501" ? 403 : 400,
      );
    return json(req, {
      data:
        body.operation === "count_batch"
          ? cleanBatch(result.data)
          : result.data,
    });
  } catch {
    return json(
      req,
      { error: "Could not reach the workshop. Try again." },
      503,
    );
  }
});
