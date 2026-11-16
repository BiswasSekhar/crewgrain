import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "./Typography";
import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import symbol from "../../assets/brand/symbol.json";
export function BrandMark({
  size = 48,
  color = symbol.ink,
}: {
  size?: number;
  color?: string;
}) {
  useTranslation();
  return (
    <Svg width={size} height={size} viewBox={symbol.viewBox} aria-hidden={true}>
      {symbol.paths.map((path) => (
        <Path key={path} d={path} fill={color} />
      ))}
    </Svg>
  );
}
export function Brand({
  size = 40,
  light = false,
  subtitle = true,
}: {
  size?: number;
  light?: boolean;
  subtitle?: boolean;
}) {
  useTranslation();
  const color = light ? symbol.paper : symbol.ink;
  return (
    <View accessibilityLabel={tr("Crewgrain")} style={brand.row}>
      <BrandMark size={size} color={color} />
      <View style={{ gap: 2 }}>
        <Text style={[brand.wordmark, { color, fontSize: size * 0.68 }]}>
          Crewgrain
        </Text>
        {subtitle && (
          <Text style={{ color: light ? "#B9C0CA" : "#667080", fontSize: 12 }}>
            {tr("Work & production")}
          </Text>
        )}
      </View>
    </View>
  );
}
const brand = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  wordmark: { fontWeight: "700", letterSpacing: -1.2 },
});
