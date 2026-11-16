import { useTranslation } from "react-i18next";
import { tr, errorText } from "../lib/i18n";
import React from "react";
import { View } from "react-native";
import { Text } from "./Typography";
import { useDailyStore } from "../lib/daily-store";
import type { LedgerRow } from "../domain/workspace";
import { Card, Pill, SectionTitle, TextButton, Tools, c, styles } from "./kit";
export function ProductionExtras({
  rows,
  unit,
  open,
  notify,
}: Tools & {
  rows: LedgerRow[];
  unit: string;
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!;
  return (
    <>
      {d.lots
        .filter(
          (l) =>
            !l.code.startsWith("AUTO-") &&
            (unit === "all" || l.unitId === unit),
        )
        .map((l) => (
          <Card key={l.id}>
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: "700" }]}>
                  {l.code}
                </Text>
                <Text style={styles.muted}>
                  {d.styles.find((st) => st.id === l.styleId)?.name} ·{" "}
                  {l.totalPieces}
                  {tr("planned")}
                </Text>
              </View>
              <Pill label={tr(l.status)} />
            </View>
            {d.operations
              .filter((o) => o.styleId === l.styleId)
              .sort((a, b) => a.sequence - b.sequence)
              .map((o) => {
                const pieces = rows
                  .filter(
                    (r) =>
                      r.lotId === l.id &&
                      r.operationId === o.id &&
                      !["void", "rejected"].includes(r.status),
                  )
                  .reduce(
                    (n, r) =>
                      n + (r.status === "approved" ? r.payable : r.entered),
                    0,
                  );
                return (
                  <View key={o.id} style={{ gap: 6 }}>
                    <View style={styles.between}>
                      <Text style={styles.muted}>{o.name}</Text>
                      <Text
                        style={[
                          styles.muted,
                          { fontWeight: "600", color: c.ink },
                        ]}
                      >
                        {pieces} / {l.totalPieces}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 6,
                        backgroundColor: c.soft,
                        borderRadius: 6,
                      }}
                    >
                      <View
                        style={{
                          height: 6,
                          width: `${Math.min(100, (pieces / l.totalPieces) * 100)}%`,
                          backgroundColor: c.primary,
                          borderRadius: 6,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
          </Card>
        ))}
      <SectionTitle title={tr("Flow alerts")} />
      {!d.flags.some((f) => f.status === "open") ? (
        <Text style={styles.muted}>{tr("No open flow alerts.")}</Text>
      ) : (
        d.flags
          .filter((f) => f.status === "open")
          .map((f) => (
            <Card key={f.id}>
              <Pill label={tr("Needs attention")} tone="warning" />
              <Text style={styles.body}>{errorText(f.message)}</Text>
              <TextButton
                label={tr("Resolve alert")}
                onPress={() =>
                  open({
                    title: tr("Resolve alert"),
                    fields: [
                      {
                        key: "reason",
                        label: tr("Resolution"),
                        required: true,
                        multiline: true,
                      },
                    ],
                    submitLabel: tr("Resolve"),
                    onSubmit: async (v) => {
                      await s.act({
                        type: "resolve_flag",
                        id: f.id,
                        reason: v.reason,
                      });
                      notify(tr("Alert resolved."));
                    },
                  })
                }
              />
            </Card>
          ))
      )}
    </>
  );
}
