import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREWGRAIN_ADMIN_EMAIL",
  "CREWGRAIN_ADMIN_EMPLOYEE_ID",
  "CREWGRAIN_ADMIN_NAME",
  "CREWGRAIN_ADMIN_PASSWORD",
  "CREWGRAIN_FIRST_UNIT_NAME",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing environment variables: " + missing.join(", "));
  process.exit(1);
}
const env = process.env,
  id = randomUUID(),
  employeeId = env.CREWGRAIN_ADMIN_EMPLOYEE_ID.trim().toUpperCase();
if (
  env.CREWGRAIN_ADMIN_PASSWORD.length < 12 ||
  !/^[A-Z0-9-]{2,24}$/.test(employeeId) ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CREWGRAIN_ADMIN_EMAIL)
)
  throw new Error(
    "Use a valid admin email, employee ID and a password of at least 12 characters.",
  );
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existing, error: lookup } = await db
  .from("profiles")
  .select("id")
  .eq("role", "admin")
  .limit(1);
if (lookup)
  throw new Error("Apply the database migration before bootstrapping.");
if (existing?.length)
  throw new Error(
    "An admin already exists. This command never replaces an admin.",
  );
const { data, error } = await db.auth.admin.createUser({
  email: env.CREWGRAIN_ADMIN_EMAIL,
  password: env.CREWGRAIN_ADMIN_PASSWORD,
  email_confirm: true,
});
if (error || !data.user)
  throw new Error(
    "Could not create admin authentication. Check operator credentials.",
  );
const { error: bootstrapError } = await db.rpc("bootstrap_admin", {
  p_id: id,
  p_auth_user: data.user.id,
  p_employee_id: employeeId,
  p_name: env.CREWGRAIN_ADMIN_NAME,
  p_unit_name: env.CREWGRAIN_FIRST_UNIT_NAME,
});
if (bootstrapError) {
  await db.auth.admin.deleteUser(data.user.id);
  throw new Error(
    "Admin setup failed and the temporary auth account was removed: " +
      bootstrapError.message,
  );
}
console.log(
  "First admin created. Sign in with the configured admin email and password. No credentials were printed.",
);
