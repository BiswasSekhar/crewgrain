import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  lstatSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Standalone Android APK. Expo owns android/; no generated native files are edited.
// Default: local test build signed with Expo's debug key (internal testing only).
// Release mode (all four CREWGRAIN_KEYSTORE_PATH / CREWGRAIN_KEYSTORE_PASSWORD / CREWGRAIN_KEY_ALIAS /
// CREWGRAIN_KEY_PASSWORD variables set): signed with the owner's key via
// plugins/withReleaseSigning.cjs, verified with apksigner. See docs/RELEASES.md.
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const windows = process.platform === "win32";
const env = { ...process.env, CI: "1", NODE_ENV: "production" };
// Source-map upload to Sentry needs an org/auth token; skip it unless configured.
if (!env.SENTRY_AUTH_TOKEN) env.SENTRY_DISABLE_AUTO_UPLOAD ??= "true";
const javaBinary = windows ? "java.exe" : "java";
if (
  !env.JAVA_HOME ||
  !existsSync(path.join(env.JAVA_HOME, "bin", javaBinary))
) {
  const found = spawnSync(windows ? "where.exe" : "which", [javaBinary], {
    encoding: "utf8",
  });
  const java = found.stdout
    ?.trim()
    .split(/\r?\n/)
    .find((candidate) => existsSync(candidate));
  if (!java)
    throw new Error("Install a JDK and set JAVA_HOME before building Android.");
  env.JAVA_HOME = path.dirname(path.dirname(realpathSync(java)));
}
if (!env.ANDROID_HOME || !existsSync(env.ANDROID_HOME)) {
  const sdk =
    env.ANDROID_SDK_ROOT ??
    (windows && env.LOCALAPPDATA
      ? path.join(env.LOCALAPPDATA, "Android/Sdk")
      : "");
  if (!sdk || !existsSync(sdk))
    throw new Error("Set ANDROID_HOME to your installed Android SDK.");
  env.ANDROID_HOME = sdk;
}
const signingVars = [
  "CREWGRAIN_KEYSTORE_PATH",
  "CREWGRAIN_KEYSTORE_PASSWORD",
  "CREWGRAIN_KEY_ALIAS",
  "CREWGRAIN_KEY_PASSWORD",
];
const signingSet = signingVars.filter((name) => (env[name] ?? "") !== "");
if (signingSet.length > 0 && signingSet.length < signingVars.length) {
  throw new Error(
    `Release signing is half configured. Missing: ${signingVars
      .filter((name) => !signingSet.includes(name))
      .join(", ")}. Set all four, or none for a debug-key test build.`,
  );
}
const releaseMode = signingSet.length === signingVars.length;
if (releaseMode) {
  env.CREWGRAIN_KEYSTORE_PATH = path.resolve(env.CREWGRAIN_KEYSTORE_PATH);
  if (!existsSync(env.CREWGRAIN_KEYSTORE_PATH))
    throw new Error(`Keystore not found: ${env.CREWGRAIN_KEYSTORE_PATH}`);
  // A release build must never ship as an unconnected demo build.
  if (env.CREWGRAIN_ALLOW_DEMO_RELEASE !== "1") {
    const fileValues = {};
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ]) {
      const file = path.join(projectRoot, name);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(
          line,
        );
        if (match) fileValues[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
    const missing = [
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ].filter((name) => !(env[name] || fileValues[name]));
    if (missing.length)
      throw new Error(
        `Release build refused: ${missing.join(", ")} not set. A release APK must be connected to Supabase (set CREWGRAIN_ALLOW_DEMO_RELEASE=1 to override).`,
      );
  }
}
const supported = new Set(["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]);
const architectures =
  process.argv
    .find((arg) => arg.startsWith("--architectures="))
    ?.split("=")[1] ??
  (releaseMode ? "arm64-v8a,armeabi-v7a" : "armeabi-v7a,arm64-v8a,x86,x86_64");
if (
  !architectures ||
  architectures.split(",").some((abi) => !supported.has(abi))
) {
  throw new Error(
    "Use --architectures= with Android ABI names: " + [...supported].join(", "),
  );
}
if (process.argv.slice(2).some((arg) => !arg.startsWith("--architectures="))) {
  throw new Error(
    "Unknown build option. Supported option: --architectures=arm64-v8a,x86_64",
  );
}

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed (${result.status ?? result.signal}).`,
    );
}

function windowsWorkspace() {
  // Native tools canonicalize junctions and may fail on long source paths.
  // Keep a real, owned short checkout with its own node_modules and native caches.
  const workspace = path.join(
    path.parse(projectRoot).root,
    "crewgrain-native",
    "app",
  );
  const markerFile = path.join(workspace, ".crewgrain-build.json");
  let marker;
  if (existsSync(workspace)) {
    if (!existsSync(markerFile))
      throw new Error(`Build path is not owned by Crewgrain: ${workspace}`);
    marker = JSON.parse(readFileSync(markerFile, "utf8"));
    if (marker.source !== realpathSync(projectRoot))
      throw new Error(`Build path belongs to another checkout: ${workspace}`);
    if (lstatSync(workspace).isSymbolicLink())
      throw new Error("The build workspace must be a real directory.");
  } else {
    mkdirSync(workspace, { recursive: true });
    marker = { source: realpathSync(projectRoot), files: [] };
    writeFileSync(markerFile, JSON.stringify(marker));
  }
  const folders = new Set([
    "src",
    "components",
    "lib",
    "assets",
    "public",
    "scripts",
    "plugins",
  ]);
  const files = new Set([
    "package.json",
    "package-lock.json",
    "app.json",
    "app.config.js",
    "babel.config.js",
    "metro.config.js",
    "tailwind.config.js",
    "tsconfig.json",
    "components.json",
    "global.css",
    "global.d.ts",
    "nativewind-env.d.ts",
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]);
  const inputs = [];
  function collect(folder) {
    for (const entry of readdirSync(path.join(projectRoot, folder), {
      withFileTypes: true,
    })) {
      const relative = path.join(folder, entry.name);
      if (entry.isDirectory()) collect(relative);
      else if (entry.isFile()) inputs.push(relative);
      else throw new Error(`Unsupported source link: ${relative}`);
    }
  }
  for (const folder of folders)
    if (existsSync(path.join(projectRoot, folder))) collect(folder);
  for (const file of files)
    if (existsSync(path.join(projectRoot, file))) inputs.push(file);
  function destination(relative) {
    const target = path.resolve(workspace, relative);
    if (!target.startsWith(workspace + path.sep))
      throw new Error("Unexpected build source path.");
    return target;
  }
  const current = new Set(inputs);
  for (const old of marker.files ?? []) {
    if (!current.has(old)) {
      const target = destination(old);
      if (existsSync(target)) {
        if (!lstatSync(target).isFile())
          throw new Error(`Unexpected old build input: ${target}`);
        unlinkSync(target);
      }
    }
  }
  for (const relative of inputs) {
    const target = destination(relative);
    const content = readFileSync(path.join(projectRoot, relative));
    if (existsSync(target)) {
      if (!lstatSync(target).isFile())
        throw new Error(`Unexpected build input: ${target}`);
      if (readFileSync(target).equals(content)) continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const dependencyHash = createHash("sha256")
    .update(readFileSync(path.join(projectRoot, "package-lock.json")))
    .digest("hex");
  console.log(`Owned Android build workspace: ${workspace}`);
  const modules = path.join(workspace, "node_modules");
  if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) {
    throw new Error(
      "The build workspace must use its own node_modules directory.",
    );
  }
  if (
    marker.dependencyHash !== dependencyHash ||
    !existsSync(path.join(workspace, "node_modules/expo/bin/cli")) ||
    !existsSync(path.join(workspace, "node_modules/tailwindcss/package.json"))
  ) {
    run(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/c", "npm", "ci", "--include=dev", "--no-audit", "--no-fund"],
      workspace,
    );
  }
  writeFileSync(
    markerFile,
    JSON.stringify(
      { source: marker.source, files: inputs, dependencyHash },
      null,
      2,
    ),
  );
  return workspace;
}

const buildRoot = windows ? windowsWorkspace() : projectRoot;
run(
  process.execPath,
  [
    path.join(buildRoot, "node_modules/expo/bin/cli"),
    "prebuild",
    "--platform",
    "android",
    "--no-install",
    "--no-clean",
  ],
  buildRoot,
);

const gradleArgs = [
  ":app:assembleRelease",
  "--no-daemon",
  "--max-workers=2",
  "--console=plain",
  `-PreactNativeArchitectures=${architectures}`,
];
console.log(
  `Building standalone ${releaseMode ? "RELEASE-signed" : "test"} APK for ${architectures}.`,
);
if (windows) {
  run(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/c", path.join(buildRoot, "android", "gradlew.bat"), ...gradleArgs],
    path.join(buildRoot, "android"),
  );
} else {
  run("./gradlew", gradleArgs, path.join(buildRoot, "android"));
}

const source = path.join(
  buildRoot,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const outputDir = path.join(projectRoot, "outputs/android");
const config = JSON.parse(
  readFileSync(path.join(projectRoot, "app.json"), "utf8"),
).expo;

function apksignerVerify(apk) {
  const tools = path.join(env.ANDROID_HOME, "build-tools");
  const versions = existsSync(tools)
    ? readdirSync(tools)
        .filter((v) => existsSync(path.join(tools, v, "lib", "apksigner.jar")))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  if (!versions.length)
    throw new Error(
      "apksigner not found under ANDROID_HOME/build-tools/*/lib.",
    );
  const jar = path.join(
    tools,
    versions[versions.length - 1],
    "lib",
    "apksigner.jar",
  );
  const result = spawnSync(
    path.join(env.JAVA_HOME, "bin", javaBinary),
    ["-jar", jar, "verify", "--print-certs", apk],
    { env, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `apksigner verify FAILED:\n${result.stdout}${result.stderr}`,
    );
  const subject = /certificate DN: (.+)/.exec(result.stdout)?.[1]?.trim();
  const fingerprint = /certificate SHA-256 digest: ([0-9a-f]+)/i
    .exec(result.stdout)?.[1]
    ?.toLowerCase();
  if (!subject || !fingerprint)
    throw new Error(
      `Could not read the signing certificate:\n${result.stdout}`,
    );
  if (/Android Debug/i.test(subject))
    throw new Error(
      "The APK is signed with the Android Debug certificate, not the release key.",
    );
  return { subject, fingerprint };
}

mkdirSync(outputDir, { recursive: true });
if (releaseMode) {
  const artifactName = `crewgrain-${config.version}.apk`;
  const output = path.join(outputDir, artifactName);
  copyFileSync(source, output);
  const certificate = apksignerVerify(output);
  const sha256 = createHash("sha256")
    .update(readFileSync(output))
    .digest("hex");
  writeFileSync(
    path.join(outputDir, `${artifactName}.sha256`),
    `${sha256}  ${artifactName}\n`,
  );
  writeFileSync(
    path.join(outputDir, "build-info.json"),
    JSON.stringify(
      {
        name: config.name,
        package: config.android.package,
        version: config.version,
        versionCode: config.android.versionCode,
        architectures: architectures.split(","),
        builtAt: new Date().toISOString(),
        variant: "release",
        signing: "release key",
        signingCertificateSha256: certificate.fingerprint,
        signingCertificateSubject: certificate.subject,
        sha256,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `APK: ${output}\nSHA-256: ${sha256}\nSigned by: ${certificate.subject}\nCertificate SHA-256: ${certificate.fingerprint}`,
  );
} else {
  const artifactSuffix = architectures === "arm64-v8a" ? "-arm64" : "";
  const artifactName = `crewgrain-preview${artifactSuffix}.apk`;
  const output = path.join(outputDir, artifactName);
  copyFileSync(source, output);
  const sha256 = createHash("sha256")
    .update(readFileSync(output))
    .digest("hex");
  writeFileSync(
    path.join(outputDir, `${artifactName}.sha256`),
    `${sha256}  ${artifactName}\n`,
  );
  writeFileSync(
    path.join(outputDir, `build-info${artifactSuffix}.json`),
    JSON.stringify(
      {
        name: config.name,
        package: config.android.package,
        version: config.version,
        versionCode: config.android.versionCode,
        architectures: architectures.split(","),
        builtAt: new Date().toISOString(),
        variant: "release",
        signing: "Expo template Android debug key; internal testing only",
        sha256,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`APK: ${output}\nSHA-256: ${sha256}`);
}
