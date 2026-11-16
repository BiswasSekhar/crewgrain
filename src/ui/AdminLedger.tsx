import { formatDate, tr } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import React, { useMemo, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import type { Snapshot } from "../domain/types";
import { LedgerRow, totals } from "../domain/workspace";
import { money } from "../domain/rules";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
} from "../../components/ui/table";
import {
  ADMIN_DESKTOP_BREAKPOINT,
  Card,
  Icon,
  Pill,
  c,
  styles,
  Tap as Pressable,
} from "./kit";
const tabular = { fontVariant: ["tabular-nums" as const] };
export function AdminLedger({
  rows,
  data,
  onOpen,
}: {
  rows: LedgerRow[];
  data: Snapshot;
  onOpen: (row: LedgerRow) => void;
}) {
  useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= ADMIN_DESKTOP_BREAKPOINT;
  const ids = useMemo(
    () =>
      [...new Set(rows.map((row) => row.employeeId))].sort((a, b) =>
        (data.employees.find((e) => e.id === a)?.name ?? "").localeCompare(
          data.employees.find((e) => e.id === b)?.name ?? "",
        ),
      ),
    [rows, data.employees],
  );
  const details = (employeeId: string) => (
    <View
      style={{
        backgroundColor: "#FAFBFC",
        borderTopWidth: 1,
        borderColor: c.line,
        paddingHorizontal: wide ? 24 : 16,
      }}
    >
      {rows
        .filter((row) => row.employeeId === employeeId)
        .map((row, index) => {
          const approved = row.status === "approved";
          const status = approved
            ? tr("Approved")
            : row.status === "needs_admin"
              ? tr("Admin review")
              : row.status === "pending"
                ? tr("Pending")
                : row.status === "void"
                  ? tr("Removed")
                  : tr("Rejected");
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={tr(
                "Open {{value0}}, {{value1}}, {{value2}}",
                {
                  value0:
                    data.operations.find((op) => op.id === row.operationId)
                      ?.name ?? tr("Operation"),
                  value1: row.workDate,
                  value2: money(approved ? row.amountPaise : row.estimatePaise),
                },
              )}
              onPress={() => onOpen(row)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 15,
                borderTopWidth: index ? 1 : 0,
                borderColor: c.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: c.ink, fontSize: 14, fontWeight: "500" }}>
                  {data.operations.find((op) => op.id === row.operationId)
                    ?.name ?? tr("Operation")}
                </Text>
                <Text style={styles.muted}>
                  {formatDate(new Date(row.workDate + "T12:00:00Z"), {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {approved ? row.payable : row.entered}
                  {tr("pieces")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 5 }}>
                <Text
                  style={{
                    color: c.ink,
                    fontSize: 15,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {money(approved ? row.amountPaise : row.estimatePaise)}
                </Text>
                <Pill label={status} tone={approved ? "neutral" : "warning"} />
              </View>
              <Icon name="chevron-forward" size={16} color={c.muted} />
            </Pressable>
          );
        })}
    </View>
  );
  if (wide)
    return (
      <Table>
        <TableHeader style={{ paddingHorizontal: 12 }}>
          <TableHead style={{ flex: 2 }}>{tr("Employee")}</TableHead>
          <TableHead style={{ flex: 1, textAlign: "right" }}>
            {tr("Pieces")}
          </TableHead>
          <TableHead style={{ flex: 1.2, textAlign: "right" }}>
            {tr("Approved")}
          </TableHead>
          <TableHead style={{ flex: 1.2, textAlign: "right" }}>
            {tr("Pending")}
          </TableHead>
          <TableHead style={{ width: 56 }} />
        </TableHeader>
        {ids.map((id) => {
          const employee = data.employees.find((e) => e.id === id);
          const sum = totals(rows.filter((row) => row.employeeId === id));
          const isOpen = expanded === id;
          return (
            <View key={id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("Operations for {{value0}}", {
                  value0: employee?.name ?? "employee",
                })}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setExpanded(isOpen ? null : id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 60,
                  paddingHorizontal: 12,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  backgroundColor: pressed ? c.soft : c.paper,
                })}
              >
                <TableCell style={{ flex: 2, gap: 2 }}>
                  <Text
                    style={{ color: c.ink, fontSize: 14, fontWeight: "600" }}
                  >
                    {employee?.name ?? tr("Employee")}
                  </Text>
                  <Text style={styles.muted}>{employee?.employeeId}</Text>
                </TableCell>
                <TableCell style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.body, tabular]}>{sum.pieces}</Text>
                </TableCell>
                <TableCell style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text
                    style={[
                      { color: c.ink, fontSize: 15, fontWeight: "600" },
                      tabular,
                    ]}
                  >
                    {money(sum.approved)}
                  </Text>
                </TableCell>
                <TableCell style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text
                    style={[
                      {
                        color: sum.pending ? c.warning : c.muted,
                        fontSize: 15,
                      },
                      tabular,
                    ]}
                  >
                    {money(sum.pending)}
                  </Text>
                </TableCell>
                <TableCell style={{ width: 56, alignItems: "center" }}>
                  <Icon
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={c.muted}
                  />
                </TableCell>
              </Pressable>
              {isOpen && details(id)}
            </View>
          );
        })}
      </Table>
    );
  return (
    <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      {ids.map((id, index) => {
        const employee = data.employees.find((e) => e.id === id);
        const sum = totals(rows.filter((row) => row.employeeId === id));
        const isOpen = expanded === id;
        return (
          <View key={id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Operations for {{value0}}", {
                value0: employee?.name ?? "employee",
              })}
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setExpanded(isOpen ? null : id)}
              style={({ pressed }) => ({
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderTopWidth: index ? 1 : 0,
                borderColor: c.line,
                backgroundColor: pressed ? c.soft : c.paper,
              })}
            >
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: c.ink, fontSize: 16, fontWeight: "600" }}>
                  {employee?.name ?? tr("Employee")}
                </Text>
                <Text style={styles.muted}>
                  {sum.pieces}
                  {tr("pieces \u00B7")}
                  {employee?.employeeId}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 5 }}>
                <Text style={{ color: c.ink, fontSize: 16, fontWeight: "600" }}>
                  {money(sum.approved)}
                </Text>
                <Text
                  style={{
                    color: sum.pending ? c.warning : c.muted,
                    fontSize: 12,
                  }}
                >
                  {sum.pending
                    ? tr("{{value0}} pending", { value0: money(sum.pending) })
                    : tr("Approved")}
                </Text>
              </View>
              <Icon
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={c.muted}
              />
            </Pressable>
            {isOpen && details(id)}
          </View>
        );
      })}
    </Card>
  );
}
