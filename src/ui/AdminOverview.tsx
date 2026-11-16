import { numberLocale, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { Text } from "./Typography";
import { cachedLedger, useDailyStore } from "../lib/daily-store";
import { factoryDate, compactMoney, money } from "../domain/rules";
import { ledgerTrend, totals } from "../domain/workspace";
import { ALL_PRODUCTION, filterProduction } from "../domain/production";
import { LineFilterBar, ProductionTotals } from "./ProductionView";
import { ActiveUsers } from "./ActiveUsers";
import { Toolbar } from "./Toolbar";
import {
  ADMIN_DESKTOP_BREAKPOINT,
  Card,
  Icon,
  Pill,
  TextButton,
  TrendChart,
  Tap,
  c,
  styles,
  type Tools,
} from "./kit";
export function AdminOverview({ go }: Tools) {
  useTranslation();
  const { data } = useDailyStore(),
    d = data!,
    { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= ADMIN_DESKTOP_BREAKPOINT;
  const [filters, setFilters] = useState(ALL_PRODUCTION);
  const date = factoryDate(),
    rows = filterProduction(d, cachedLedger(d), filters),
    todayRows = rows.filter((r) => r.workDate === date);
  const staff = d.employees.filter(
    (e) =>
      e.role === "worker" &&
      e.active &&
      (filters.line === "all" || e.unitId === filters.line) &&
      (filters.employee === "all" || e.id === filters.employee),
  );
  const days = (d.days ?? []).filter((day) => day.workDate === date);
  const approvals =
    (d.days ?? []).filter((day) => day.status === "needs_admin").length +
    (d.corrections ?? []).filter((r) => r.status === "pending").length +
    d.requests.filter((r) => r.status === "pending").length;
  const units = d.units.filter(
    (unit) =>
      unit.active && (filters.line === "all" || unit.id === filters.line),
  );
  const trend = ledgerTrend(rows, date);
  return (
    <>
      <ProductionTotals
        summary={totals(todayRows)}
        onMoney={() => go?.("production", { ...filters, period: "1" })}
        onPieces={() => go?.("production", { ...filters, period: "1" })}
      />
      {approvals > 0 && (
        <Card
          style={{
            padding: 0,
            backgroundColor: c.warningLight,
            borderColor: "#EFDFB5",
          }}
        >
          <Tap
            accessibilityRole="button"
            accessibilityLabel={tr("{{value0}} approvals waiting", {
              value0: approvals,
            })}
            onPress={() => go?.("approvals")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 14,
              minHeight: 56,
            }}
          >
            <Icon name="shield-checkmark-outline" size={19} color={c.warning} />
            <Text
              style={{ fontSize: 16, fontWeight: "600", color: c.ink, flex: 1 }}
            >
              {tr("Approvals")}
            </Text>
            <Pill
              label={tr("{{value0}} pending", { value0: approvals })}
              tone="warning"
            />
            <Icon name="chevron-forward" size={17} color={c.warning} />
          </Tap>
        </Card>
      )}
      <ActiveUsers />
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: "stretch",
          gap: 24,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: c.ink }}>
            {tr("Lines")}
          </Text>
          <Toolbar
            actions={[
              {
                label: tr("Assign operations"),
                icon: "person-add-outline",
                primary: true,
                onPress: () => go?.("tasks"),
              },
            ]}
          />
          <LineFilterBar value={filters} onChange={setFilters} />
          {units.map((unit) => {
            const workers = staff.filter((e) => e.unitId === unit.id),
              checked = workers.filter((e) =>
                days.some((day) => day.employeeId === e.id),
              ).length;
            const captain = d.employees.find(
                (e) => e.role === "captain" && e.active && e.unitId === unit.id,
              ),
              summary = totals(todayRows.filter((r) => r.unitId === unit.id));
            return (
              <Card key={unit.id} style={{ padding: 0, gap: 0 }}>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={tr(
                    "{{value0}}, {{value1}} pieces done, {{value2}} labour cost, {{value3}} of {{value4}} checked. Open line.",
                    {
                      value0: unit.name,
                      value1: summary.pieces,
                      value2: money(summary.approved + summary.pending),
                      value3: checked,
                      value4: workers.length,
                    },
                  )}
                  onPress={() => go?.("line", { line: unit.id })}
                  style={{ padding: 14, gap: 14 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        backgroundColor: c.infoLight,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="business-outline" size={19} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: "700",
                          color: c.ink,
                        }}
                      >
                        {unit.name}
                      </Text>
                      <Text style={{ fontSize: 13, color: c.muted }}>
                        {captain?.name ?? tr("No captain")}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={c.muted} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={{ fontSize: 12, color: c.muted }}>
                        {tr("Pieces done")}
                      </Text>
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: "700",
                          color: c.ink,
                        }}
                      >
                        {summary.pieces.toLocaleString(numberLocale())}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={{ fontSize: 12, color: c.muted }}>
                        {tr("Labour cost")}
                      </Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{
                          fontSize: 20,
                          fontWeight: "700",
                          color: c.ink,
                        }}
                      >
                        {money(summary.approved + summary.pending)}
                      </Text>
                    </View>
                  </View>
                  <Pill
                    label={tr("{{value0}}/{{value1}} checked", {
                      value0: checked,
                      value1: workers.length,
                    })}
                    tone={
                      workers.length > 0 && checked === workers.length
                        ? "success"
                        : "warning"
                    }
                    icon="checkmark-circle-outline"
                  />
                </Tap>
              </Card>
            );
          })}
          {!units.length && (
            <Card>
              <Text style={styles.muted}>
                {tr("No lines for these filters.")}
              </Text>
              <TextButton
                label={tr("Add line")}
                onPress={() => go?.("units")}
              />
            </Card>
          )}
        </View>
        <View style={{ width: wide ? 340 : undefined, minWidth: 0 }}>
          <TrendChart
            title={tr("Last 7 days")}
            pieces={{
              label: tr("Pieces done"),
              points: trend.pieces,
              format: (v) => Math.round(v).toLocaleString(numberLocale()),
            }}
            money={{
              label: tr("Labour cost"),
              points: trend.money,
              format: compactMoney,
            }}
          />
        </View>
      </View>
    </>
  );
}
