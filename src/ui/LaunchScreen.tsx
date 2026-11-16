import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "./Typography";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { BrandMark } from "./Brand";
export function LaunchScreen() {
  useTranslation();
  return (
    <View style={launch.screen}>
      <View style={launch.identity}>
        <BrandMark size={144} />
        <Text style={launch.name}>Crewgrain</Text>
        <Text style={launch.subtitle}>{tr("Production Tracker")}</Text>
      </View>
      <ActivityIndicator
        color="#202731"
        accessibilityLabel={tr("Opening Crewgrain")}
        style={launch.progress}
      />
    </View>
  );
}
const launch = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    position: "absolute",
    top: "50%",
    marginTop: -72,
    alignItems: "center",
    gap: 8,
  },
  name: {
    color: "#202731",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.6,
  },
  subtitle: { color: "#667080", fontSize: 14 },
  progress: { position: "absolute", bottom: "16%" },
});
