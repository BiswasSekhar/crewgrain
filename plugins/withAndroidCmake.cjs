const { withAppBuildGradle } = require("expo/config-plugins");

// Keep generated Fabric object names below Ninja's Windows path limit.
// Persist the setting through Expo prebuild instead of editing generated Android code.
module.exports = function withAndroidCmake(config) {
  return withAppBuildGradle(config, (mod) => {
    const marker = "// Crewgrain: short CMake object paths for Windows builds";
    if (mod.modResults.language !== "groovy") {
      throw new Error(
        "The Crewgrain CMake plugin expects Expo's Groovy Android template.",
      );
    }
    if (mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /-DCMAKE_OBJECT_PATH_MAX=\d+/g,
        "-DCMAKE_OBJECT_PATH_MAX=250",
      );
    } else {
      const anchor = "defaultConfig {";
      if (!mod.modResults.contents.includes(anchor)) {
        throw new Error(
          "Could not find Android defaultConfig for CMake options.",
        );
      }
      mod.modResults.contents = mod.modResults.contents.replace(
        anchor,
        `${anchor}
        ${marker}
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=250"
            }
        }`,
      );
    }
    return mod;
  });
};
