import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import { Icon, Tap, c, type IconName } from "./kit";

export type ToolbarAction = {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** The one main action of the screen; the others are outlined. */
  primary?: boolean;
};
/** A wrapping row of equal-height buttons. Two fit side by side on a phone. */
export function Toolbar({ actions }: { actions: ToolbarAction[] }) {
  useTranslation();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {actions.map((a) => (
        <Tap
          key={a.label}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={a.onPress}
          style={({ pressed }) => ({
            flexGrow: 1,
            flexBasis: 150,
            minWidth: 0,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: a.primary ? c.primary : c.line,
            backgroundColor: a.primary
              ? pressed
                ? "#1B47A6"
                : c.primary
              : pressed
                ? c.soft
                : c.paper,
          })}
        >
          <Icon
            name={a.icon}
            size={18}
            color={a.primary ? c.paper : c.primary}
          />
          <Text
            numberOfLines={2}
            style={{
              flexShrink: 1,
              fontSize: 14,
              fontWeight: "600",
              textAlign: "center",
              color: a.primary ? c.paper : c.ink,
            }}
          >
            {a.label}
          </Text>
        </Tap>
      ))}
    </View>
  );
}
