// Extends app.json. Firebase's google-services.json is needed for push
// notifications on Android, but it is not committed: the release workflow decodes
// it from a GitHub secret, and on your own machine you can drop it in the project
// root. Without the file the app still builds, it just cannot receive push.
const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const file = path.join(__dirname, "google-services.json");
  if (!fs.existsSync(file)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: "./google-services.json" },
  };
};
