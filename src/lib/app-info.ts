import Constants from "expo-constants";
import { Platform } from "react-native";
import config from "../../app.json";

export const appVersion =
  Platform.OS === "web"
    ? config.expo.version
    : (Constants.expoConfig?.version ?? config.expo.version);
export const appBuild =
  Platform.OS === "web"
    ? config.expo.android.versionCode
    : (Constants.expoConfig?.android?.versionCode ??
      config.expo.android.versionCode);
