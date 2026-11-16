import React, { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import { formatDateTime, formatTime, tr } from "../lib/i18n";
import { useDailyStore } from "../lib/daily-store";
import {
  minutesAgo,
  staffPresence,
  type PresenceRow,
} from "../domain/presence";
import { Card, Icon, Pill, Sheet, Tap as Pressable, c, styles } from "./kit";

const zone = "Asia/Kolkata";
function seenText(row: PresenceRow) {
  if (row.state === "online") return tr("Online now");
  if (!row.lastSeenAt) return tr("Not seen yet");
  const at = new Date(row.lastSeenAt),
    minutes = minutesAgo(row.lastSeenAt);
  if (minutes < 60) return tr("{{value0}} min ago", { value0: minutes });
  return row.state === "earlier"
    ? formatTime(at, { hour: "numeric", minute: "2-digit", timeZone: zone })
    : formatDateTime(at, { day: "numeric", month: "short", timeZone: zone });
}
const roleText = (role: string) =>
  role === "admin"
    ? tr("Admin")
    : role === "captain"
      ? tr("Captain")
      : tr("Employee");
/** Admin: who has had the app open recently. Costs the phones nothing extra:
 *  it only reads the last-seen times their normal syncing already leaves. */
export function ActiveUsers() {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    [open, setOpen] = useState(false);
  // Sample data and older servers have no presence information.
  if (s.actor?.role !== "admin" || !d.presence) return null;
  const rows = staffPresence(d),
    online = rows.filter((r) => r.state === "online"),
    group = (title: string, list: PresenceRow[]) =>
      list.length ? (
        <View key={title} style={{ gap: 4 }}>
          <Text style={[styles.muted, { fontWeight: "700", marginTop: 8 }]}>
            {title} · {list.length}
          </Text>
          {list.map((r) => (
            <View
              key={r.employee.id}
              style={[
                styles.between,
                {
                  gap: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderColor: c.line,
                },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: "600", color: c.ink }}
                >
                  {r.employee.name}
                  {r.employee.id === s.actor?.id ? ` (${tr("You")})` : ""}
                </Text>
                <Text numberOfLines={1} style={styles.muted}>
                  {roleText(r.employee.role)} ·{" "}
                  {d.units.find((u) => u.id === r.employee.unitId)?.name ?? ""}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                {r.state === "online" && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: c.success,
                    }}
                  />
                )}
                <Text style={{ fontSize: 13, color: c.muted }}>
                  {seenText(r)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null;
  return (
    <>
      <Card style={{ padding: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Active users, {{value0}} online", {
            value0: online.length,
          })}
          onPress={() => setOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 14,
            minHeight: 56,
          }}
        >
          <Icon name="people-outline" size={19} color={c.primary} />
          <Text
            style={{ fontSize: 16, fontWeight: "600", color: c.ink, flex: 1 }}
          >
            {tr("Active now")}
          </Text>
          <Pill
            label={tr("{{value0}} online", { value0: online.length })}
            tone={online.length ? "success" : "neutral"}
          />
          <Icon name="chevron-forward" size={17} color={c.muted} />
        </Pressable>
      </Card>
      {open && (
        <Sheet
          title={tr("Active users")}
          onClose={() => setOpen(false)}
          info={tr(
            "Shows who had the app open in the last 5 minutes. It updates when the app syncs, so it can be a few minutes behind.",
          )}
        >
          {group(tr("Online now"), online)}
          {group(
            tr("Earlier today"),
            rows.filter((r) => r.state === "earlier"),
          )}
          {group(
            tr("Not seen recently"),
            rows.filter((r) => r.state === "away"),
          )}
        </Sheet>
      )}
    </>
  );
}
