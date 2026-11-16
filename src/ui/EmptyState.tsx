import React from "react";
import { View } from "react-native";
import { Text } from "./Typography";
import { ActionButton, Card, Icon, c, type IconName } from "./kit";

/** A friendly "nothing here yet" card: icon, headline, one reason, up to two actions. */
export function EmptyState({
  icon = "calendar-outline",
  title,
  detail,
  actions = [],
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  actions?: { label: string; onPress: () => void; secondary?: boolean }[];
}) {
  return (
    <Card style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.infoLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={26} color={c.primary} />
      </View>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 17,
          fontWeight: "700",
          color: c.ink,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {!!detail && (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: c.muted,
            textAlign: "center",
          }}
        >
          {detail}
        </Text>
      )}
      <View style={{ alignSelf: "stretch", gap: 8, marginTop: 4 }}>
        {actions.map((a) => (
          <ActionButton
            key={a.label}
            label={a.label}
            secondary={a.secondary}
            onPress={a.onPress}
          />
        ))}
      </View>
    </Card>
  );
}
