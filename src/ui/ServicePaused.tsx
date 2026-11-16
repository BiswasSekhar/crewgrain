import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "./Typography";
import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDailyStore } from "../lib/daily-store";
import { PAUSED_FALLBACK } from "../lib/service-pause";
import { Brand } from "./Brand";
import { ActionButton, Icon, Tap, c } from "./kit";

/** Shown in place of the whole app while the service provider has paused it. */
export function ServicePaused() {
  useTranslation();
  const { paused, recheckService, logout, phoneLinked } = useDailyStore();
  const [checking, setChecking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!paused) return null;
  const check = async () => {
    setChecking(true);
    try {
      await recheckService();
    } finally {
      setChecking(false);
    }
  };
  const leave = async () => {
    setLeaving(true);
    try {
      await logout();
    } catch {
      // Nothing to explain here: the account stays signed in.
    } finally {
      setLeaving(false);
    }
  };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.paper }}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
        }}
      >
        <View style={{ width: "100%", maxWidth: 420, gap: 24 }}>
          <Brand />
          <View style={{ gap: 14, alignItems: "flex-start" }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: c.soft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="lock-closed-outline" size={26} color={c.primary} />
            </View>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 26,
                fontWeight: "600",
                color: c.ink,
                letterSpacing: -0.6,
              }}
            >
              {tr("Service paused")}
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: c.muted }}>
              {paused.message || tr(PAUSED_FALLBACK)}
            </Text>
          </View>
          <View style={{ gap: 12 }}>
            <ActionButton
              label={checking ? tr("Checking...") : tr("Check again")}
              onPress={() => void check()}
              disabled={checking}
            />
            {checking && (
              <ActivityIndicator
                color={c.muted}
                accessibilityLabel={tr("Checking...")}
              />
            )}
            {!phoneLinked && (
              <Tap
                accessibilityRole="button"
                accessibilityLabel={tr("Sign out")}
                disabled={leaving}
                onPress={() => void leave()}
                style={({ pressed }) => ({
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: leaving ? 0.42 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, color: c.muted }}>
                  {tr("Sign out")}
                </Text>
              </Tap>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
