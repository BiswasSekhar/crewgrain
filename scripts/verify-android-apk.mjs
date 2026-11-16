import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apk = path.resolve(
  process.argv[2] ?? path.join(root, "outputs/android/crewgrain-preview.apk"),
);
const windows = process.platform === "win32";
const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (windows ? path.join(process.env.LOCALAPPDATA, "Android/Sdk") : "");
if (!existsSync(apk)) throw new Error(`APK not found: ${apk}`);
const tools = readdirSync(path.join(sdk, "build-tools"))
  .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
if (!tools)
  throw new Error("Install Android SDK build-tools to verify the APK.");
const toolsDir = path.join(sdk, "build-tools", tools);
function output(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `${command} failed (${result.status}).`);
  return result.stdout;
}
// Invoke the signer's JAR directly, avoiding shell quoting around file paths.
const signature = output("java", [
  "-jar",
  path.join(toolsDir, "lib/apksigner.jar"),
  "verify",
  "--verbose",
  apk,
]);
const badging = output(path.join(toolsDir, windows ? "aapt.exe" : "aapt"), [
  "dump",
  "badging",
  apk,
]);
const config = JSON.parse(
  readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
if (!badging.includes(`package: name='${config.android.package}'`))
  throw new Error("APK has an unexpected application ID.");
if (!badging.includes("launchable-activity:"))
  throw new Error("APK has no launcher activity.");
const contents = output("jar", ["tf", apk]);
if (!contents.split(/\r?\n/).includes("assets/index.android.bundle"))
  throw new Error("APK has no embedded JavaScript bundle.");
const forbidden = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.SYSTEM_ALERT_WINDOW",
];
for (const permission of forbidden) {
  if (badging.includes(`name='${permission}'`))
    throw new Error(`APK unexpectedly requests ${permission}.`);
}
const report =
  [
    signature.trim(),
    ...badging
      .split(/\r?\n/)
      .filter((line) =>
        /^(package:|sdkVersion:|targetSdkVersion:|launchable-activity:|native-code:|uses-permission:)/.test(
          line,
        ),
      ),
    "Embedded JavaScript bundle: present",
  ].join("\n") + "\n";
const reportName = path.basename(apk).includes("-arm64")
  ? "verification-arm64.txt"
  : "verification.txt";
writeFileSync(path.join(path.dirname(apk), reportName), report);
console.log(report);
