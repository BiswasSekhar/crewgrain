// Adds another admin after the first one exists (bootstrap-admin.mjs refuses to
// run twice). Run from your own terminal with the Supabase secret key in the
// environment; nothing is printed or saved.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREWGRAIN_ADMIN_EMAIL",
  "CREWGRAIN_ADMIN_EMPLOYEE_ID",
  "CREWGRAIN_ADMIN_NAME",
  "CREWGRAIN_ADMIN_PASSWORD",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing environment variables: " + missing.join(", "));
  process.exit(1);
}
const env = process.env,
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
const { data, error } = await db.auth.admin.createUser({
  email: env.CREWGRAIN_ADMIN_EMAIL,
  password: env.CREWGRAIN_ADMIN_PASSWORD,
  email_confirm: true,
});
if (error || !data.user)
  throw new Error(
    "Could not create the sign-in account: " +
      (error?.message ?? "unknown error"),
  );
const { error: addError } = await db.rpc("add_admin", {
  p_id: randomUUID(),
  p_auth_user: data.user.id,
  p_employee_id: employeeId,
  p_name: env.CREWGRAIN_ADMIN_NAME,
});
if (addError) {
  await db.auth.admin.deleteUser(data.user.id);
  throw new Error(
    "Admin setup failed and the new sign-in account was removed: " +
      addError.message,
  );
}
console.log(
  "Admin added. Sign in with the email and password you set. No credentials were printed.",
);
