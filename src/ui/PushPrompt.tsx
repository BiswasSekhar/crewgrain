import { useEffect, useRef } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useDailyStore } from "../lib/daily-store";
import { pushSupported, pushTarget, registerForPush } from "../lib/push";

let openedFromTap = false;
/** Registers this phone for push once per signed-in profile. Renders nothing. */
export function PushRegistration() {
  const { actor, demo } = useDailyStore();
  const done = useRef<string | null>(null);
  const profile = actor?.id ?? null;
  const role = actor?.role ?? null;
  useEffect(() => {
    if (!pushSupported() || demo || !profile || done.current === profile)
      return;
    done.current = profile;
    void registerForPush(role !== "admin");
  }, [profile, role, demo]);
  useEffect(() => {
    if (!pushSupported() || !profile) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const target = pushTarget(response?.notification.request.content.data);
      if (target) router.push({ pathname: "/", params: target });
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(open);
    // App opened from a tap while it was closed.
    if (!openedFromTap) {
      openedFromTap = true;
      open(Notifications.getLastNotificationResponse());
    }
    return () => subscription.remove();
  }, [profile]);
  return null;
}
