import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { makeTimedFetch } from "./request-limits";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
/**
 * Sample data is only offered while developing, or when a demo build is made on
 * purpose with EXPO_PUBLIC_ALLOW_DEMO=true. A real build that is missing its
 * backend settings must show a clear message, never sample data.
 */
export const demoAllowed =
  !configured &&
  ((typeof __DEV__ !== "undefined" && __DEV__) ||
    process.env.EXPO_PUBLIC_ALLOW_DEMO === "true");
// Native sessions are split to stay below platform SecureStore value limits.
const secureStorage = {
  async getItem(name: string) {
    if (Platform.OS === "web")
      return typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem(name);
    const count = Number(
      (await SecureStore.getItemAsync(name + ".count")) ?? 0,
    );
    if (!count) return null;
    let value = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${name}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(name: string, value: string) {
    if (Platform.OS === "web") {
      sessionStorage.setItem(name, value);
      return;
    }
    await secureStorage.removeItem(name);
    const parts = value.match(/[\s\S]{1,1500}/g) ?? [];
    for (let i = 0; i < parts.length; i++)
      await SecureStore.setItemAsync(`${name}.${i}`, parts[i]);
    await SecureStore.setItemAsync(name + ".count", String(parts.length));
  },
  async removeItem(name: string) {
    if (Platform.OS === "web") {
      sessionStorage.removeItem(name);
      return;
    }
    const count = Number(
      (await SecureStore.getItemAsync(name + ".count")) ?? 0,
    );
    for (let i = 0; i < count; i++)
      await SecureStore.deleteItemAsync(`${name}.${i}`);
    await SecureStore.deleteItemAsync(name + ".count");
  },
};
// Every call gets a time limit (see request-limits.ts), so a weak connection
// shows a clear message instead of an endless "Saving...".
const timedFetch = makeTimedFetch();
export const supabase = configured
  ? createClient(url!, key!, {
      global: { fetch: timedFetch },
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
