import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { supabase } from "./supabase";
import { getPhone } from "./phone";

import { pushTokenPattern } from "./push-core";
export { pushTarget, pushTokenPattern, pushViews } from "./push-core";
export type PushEvent =
  | "request_submitted"
  | "report_submitted"
  | "day_approved"
  | "count_change_pending"
  | "admin_day_checked"
  | "line_check_complete";

let warned = false;
const warnOnce = (message: string) => {
  if (warned) return;
  warned = true;
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(message);
};

export const pushSupported = () => Platform.OS !== "web";

/** Call once at startup, before any notification can arrive. */
export function configureNotifications() {
  if (!pushSupported()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Approvals and requests",
    importance: AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync("updates", {
    name: "Quiet updates",
    importance: AndroidImportance.LOW,
  });
}

/**
 * Asks for permission once (never again after a refusal) and returns this
 * phone's Expo push token, or null when push is not possible. Never throws.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    if (!pushSupported() || !Device.isDevice) return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      warnOnce(
        "Push is off: run `eas init` so extra.eas.projectId exists (see docs/OPERATIONS.md).",
      );
      return null;
    }
    await ensureChannels();
    let permission = await Notifications.getPermissionsAsync();
    // canAskAgain is false after a refusal: respect it and stay quiet.
    if (permission.status !== "granted" && permission.canAskAgain)
      permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== "granted") return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return pushTokenPattern.test(data) ? data : null;
  } catch {
    return null;
  }
}

async function callFunction(
  body: Record<string, unknown>,
  phoneToken?: string,
) {
  if (!supabase) return null;
  const response = await supabase.functions.invoke("send-push", {
    body,
    headers: phoneToken ? { "x-device-token": phoneToken } : {},
  });
  return response.error ? null : response.data;
}

/**
 * Uploads the token. Admins use the database function directly; staff phones
 * go through the send-push gateway with their device token.
 */
export async function uploadPushToken(token: string, staff: boolean) {
  try {
    if (!supabase) return false;
    if (staff) {
      const phone = await getPhone();
      if (!phone) return false;
      const result = await callFunction(
        { operation: "register", token, platform: Platform.OS },
        phone.token,
      );
      return Boolean(result?.ok);
    }
    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Registers this phone for the signed-in profile. Returns true when stored. */
export async function registerForPush(staff: boolean) {
  const token = await getPushToken();
  return token ? uploadPushToken(token, staff) : false;
}

/**
 * Tells the server something happened. The server decides who to notify and
 * writes the text; nothing personal is sent. Failures are ignored on purpose.
 * Call it after the action succeeds (see docs/OPERATIONS.md).
 */
export async function notifyEvent(
  event: PushEvent,
  payload: Record<string, string> = {},
) {
  try {
    const phone = await getPhone();
    await callFunction(
      { operation: "notify", event, ...payload },
      phone?.token,
    );
  } catch {
    /* a missed notification must never block work */
  }
}
