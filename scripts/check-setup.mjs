import fs from "node:fs";
import path from "node:path";
const files = [
  "src/app/index.tsx",
  "supabase/config.toml",
  "supabase/migrations/202611070001_foundation.sql",
  "supabase/migrations/202611070002_daily_workflow.sql",
  "supabase/migrations/202611080003_app_workspace.sql",
  "supabase/migrations/202611100009_worker_owned_counts.sql",
  "supabase/migrations/202611100010_staff_id_login.sql",
  "supabase/migrations/202611100011_operations_and_staff.sql",
  "supabase/migrations/202611100012_count_capture.sql",
  "supabase/functions/device-access/index.ts",
  "package-lock.json",
];
let missing = false;
for (const f of files) {
  const ok = fs.existsSync(path.resolve(f));
  console.log(`${ok ? "OK" : "MISSING"} ${f}`);
  if (!ok) missing = true;
}
const envFile = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const configured = Boolean(
  (process.env.EXPO_PUBLIC_SUPABASE_URL ||
    envFile.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]) &&
  (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    envFile.match(/^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)$/m)?.[1]),
);
console.log(
  configured
    ? "Public backend values found. Still verify migrations, functions and first-admin provisioning against staging."
    : "No backend configured. Development offers a labelled demo; release builds require backend settings or explicit demo opt-in.",
);
process.exitCode = missing ? 1 : 0;
