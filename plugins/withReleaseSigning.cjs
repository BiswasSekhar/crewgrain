const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle } = require("expo/config-plugins");

// Release signing for the sideloaded (non-Play) Android APK.
// Purpose: when the four CREWGRAIN_* environment variables are set, sign the release
// build with the owner's own keystore. Gradle reads them from System.getenv, so
// no secret is ever written into a file. When none are set, Expo's default
// (debug key) is kept so the local test build still works.
// Called from app.json "plugins"; mirrors withAndroidCmake.cjs.
const VARS = [
  "CREWGRAIN_KEYSTORE_PATH",
  "CREWGRAIN_KEYSTORE_PASSWORD",
  "CREWGRAIN_KEY_ALIAS",
  "CREWGRAIN_KEY_PASSWORD",
];
const BEGIN = "// Crewgrain release signing begin";
const END = "// Crewgrain release signing end";
const LINE_MARK = "// Crewgrain release signing";

function signingBlock() {
  return `${BEGIN}
        release {
            storeFile new File(System.getenv('CREWGRAIN_KEYSTORE_PATH'))
            storePassword System.getenv('CREWGRAIN_KEYSTORE_PASSWORD')
            keyAlias System.getenv('CREWGRAIN_KEY_ALIAS')
            keyPassword System.getenv('CREWGRAIN_KEY_PASSWORD')
        }
        ${END}`;
}

function strip(contents) {
  return contents
    .replace(new RegExp(`\\n[ \\t]*${BEGIN}[\\s\\S]*?${END}`, "g"), "")
    .replace(
      new RegExp(
        `signingConfig signingConfigs\\.release[ \\t]*${LINE_MARK}`,
        "g",
      ),
      "signingConfig signingConfigs.debug",
    );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error(
        "The Crewgrain release signing plugin expects Expo's Groovy Android template.",
      );
    }
    const set = VARS.filter((name) => (process.env[name] ?? "") !== "");
    let contents = strip(mod.modResults.contents);

    if (set.length === 0) {
      mod.modResults.contents = contents; // debug key (internal test build)
      return mod;
    }
    if (set.length !== VARS.length) {
      const missing = VARS.filter((name) => !set.includes(name));
      throw new Error(
        `Release signing is half configured. Missing: ${missing.join(", ")}. ` +
          "Set all four CREWGRAIN_KEYSTORE_* / CREWGRAIN_KEY_* variables, or none.",
      );
    }
    const keystore = path.resolve(process.env.CREWGRAIN_KEYSTORE_PATH);
    if (!fs.existsSync(keystore) || !fs.statSync(keystore).isFile()) {
      throw new Error(
        `CREWGRAIN_KEYSTORE_PATH does not point to a file: ${keystore}`,
      );
    }

    const signingAnchor = /signingConfigs\s*\{/;
    const releaseLine =
      /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!signingAnchor.test(contents) || !releaseLine.test(contents)) {
      throw new Error(
        "Could not find signingConfigs / buildTypes.release in the Android build.gradle.",
      );
    }
    contents = contents.replace(
      signingAnchor,
      (anchor) => `${anchor}\n        ${signingBlock()}`,
    );
    contents = contents.replace(
      releaseLine,
      `$1signingConfig signingConfigs.release ${LINE_MARK}`,
    );
    mod.modResults.contents = contents;
    return mod;
  });
};
