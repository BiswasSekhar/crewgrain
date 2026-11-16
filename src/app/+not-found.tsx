import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "../ui/Typography";
import { router } from "expo-router";
import { View } from "react-native";
import { Brand } from "../ui/Brand";
import { ActionButton, c } from "../ui/kit";
export default function NotFound() {
  useTranslation();
  return (
    <View
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
        {tr("This page isn\u2019t available")}
      </Text>
      <ActionButton
        label={tr("Open Crewgrain")}
        onPress={() => router.replace("/")}
      />
    </View>
  );
}
