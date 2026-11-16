import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "../ui/Typography";
import "../../global.css";
import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { Platform, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { DailyProvider, useDailyStore } from "../lib/daily-store";
import { LaunchScreen } from "../ui/LaunchScreen";
import { ServicePaused } from "../ui/ServicePaused";
import { Brand } from "../ui/Brand";
import { LanguageProvider } from "../ui/LanguageProvider";
import { ActionButton, c } from "../ui/kit";
import { PushRegistration } from "../ui/PushPrompt";
import { captureError, initMonitoring, wrapRoot } from "../lib/monitoring";
import { configureNotifications } from "../lib/push";
initMonitoring();
configureNotifications();
if (Platform.OS !== "web")
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
function Startup({ children }: { children: React.ReactNode }) {
  useTranslation();
  const { loading, paused } = useDailyStore();
  const [started, setStarted] = useState(!loading);
  // Latch initial readiness; later refreshes must not remount the navigator.
  if (!loading && !started) setStarted(true);
  return (
    <View
      style={{ flex: 1, backgroundColor: c.paper }}
      onLayout={() => {
        // A branded frame is mounted before releasing the operating system's splash.
        if (Platform.OS !== "web") SplashScreen.hide();
      }}
    >
      {paused ? <ServicePaused /> : started ? children : <LaunchScreen />}
    </View>
  );
}
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useTranslation();
  useEffect(() => captureError(error), [error]);
  return (
    <View
      onLayout={() => {
        if (Platform.OS !== "web") SplashScreen.hide();
      }}
      style={{
        flex: 1,
        backgroundColor: c.paper,
        justifyContent: "center",
        padding: 32,
        gap: 24,
      }}
    >
      <Brand />
      <Text style={{ fontSize: 24, fontWeight: "600", color: c.ink }}>
        {tr("Couldn\u2019t open Crewgrain")}
      </Text>
      <ActionButton label={tr("Try again")} onPress={() => void retry()} />
    </View>
  );
}
function Layout() {
  useTranslation();
  const [fontsLoaded, fontError] = useFonts({
    ManropeRegular: require("@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf"),
    ManropeMedium: require("@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf"),
    ManropeSemiBold: require("@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf"),
    ManropeBold: require("@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf"),
  });
  if (!fontsLoaded && !fontError) return <LaunchScreen />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <LanguageProvider>
        <DailyProvider>
          <Startup>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.paper },
              }}
            />
            <PortalHost />
            <PushRegistration />
          </Startup>
        </DailyProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
export default wrapRoot(Layout);
