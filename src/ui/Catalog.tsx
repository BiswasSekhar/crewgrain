import { operationCode } from "../domain/operations";
import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import { Text } from "./Typography";
import React, { useState } from "react";
import { View } from "react-native";
import { useDailyStore } from "../lib/daily-store";
import { DEFAULT_PER_MINUTE_PAISE, money, perMinuteFor } from "../domain/rules";
import {
  c,
  styles,
  Card,
  Pill,
  TextButton,
  ActionButton,
  Tools,
  Icon,
  IconButton,
  Search,
  ChoiceField,
  TitleRow,
  Sheet,
  MenuRow,
  Tap as Pressable,
} from "./kit";
import type { Style, Unit, Lot, Operation } from "../domain/types";
export function Catalog({
  kind,
  open,
  notify,
  go,
}: Tools & {
  kind: "units" | "styles" | "lots";
}) {
  useTranslation();
  const s = useDailyStore(),
    d = s.data!,
    isAdmin = s.actor?.role === "admin",
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [selectedLine, setSelectedLine] = useState<Unit | null>(null),
    [openStyle, setOpenStyle] = useState<string | null>(null),
    [menuStyle, setMenuStyle] = useState<Style | null>(null),
    [menuOperation, setMenuOperation] = useState<Operation | null>(null),
    scopedUnits = isAdmin
      ? d.units
      : d.units.filter((u) => u.id === s.actor?.unitId);
  const units = d.units
    .filter((u) => u.active)
    .map((u) => ({ value: u.id, label: u.name }));
  function operationDetails(o: Operation) {
    open({
      title: tr("Operation details"),
      fields: [
        {
          key: "code",
          label: tr("OP code"),
          value: operationCode(o),
          required: true,
        },
        {
          key: "steps",
          label: tr("Actions in this operation"),
          value: (o.steps || []).join("\n"),
          multiline: true,
        },
      ],
      description: tr(
        "One action per row. All actions share this operation’s seconds and rate.",
      ),
      submitLabel: tr("Save changes"),
      onSubmit: async (v) => {
        await s.workspaceAct({
          type: "save_operation_details",
          id: o.id,
          code: v.code,
          steps: v.steps.split("\n"),
        });
        notify(tr("Operation updated."));
      },
    });
  }
  function materialForm(st: Style) {
    open({
      title: tr("Material"),
      fields: [
        { key: "material", label: tr("Cloth / material"), value: st.material },
      ],
      submitLabel: tr("Save changes"),
      onSubmit: async (v) => {
        await s.workspaceAct({
          type: "save_material",
          styleId: st.id,
          material: v.material,
        });
        notify(tr("Material saved."));
      },
    });
  }
  function unitForm(u?: Unit) {
    if (u && !isAdmin) {
      open({
        title: tr("Rename line"),
        fields: [
          {
            key: "name",
            label: tr("Line name"),
            value: u.name,
            required: true,
          },
        ],
        submitLabel: tr("Save"),
        onSubmit: async (v) => {
          await s.workspaceAct({ type: "rename_unit", id: u.id, name: v.name });
          notify(tr("Line saved."));
        },
      });
      return;
    }
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(
      (n) => !d.units.some((x) => x.code === `U0${n}`),
    );
    if (!u && !free) {
      notify(tr("A factory can have up to 9 lines."));
      return;
    }
    open({
      title: u ? tr("Edit line") : tr("Add line"),
      description: u
        ? undefined
        : tr("Employees on this line get IDs starting with {{value0}}.", {
            value0: free,
          }),
      fields: [
        {
          key: "name",
          label: tr("Line name"),
          value:
            u?.name ?? (free ? tr("Line {{value0}}", { value0: free }) : ""),
          required: true,
        },
        ...(u
          ? [
              {
                key: "active",
                label: tr("Status"),
                value: String(u.active),
                options: [
                  { value: "true", label: tr("In use") },
                  { value: "false", label: tr("Not in use") },
                ],
              },
            ]
          : []),
      ],
      submitLabel: tr("Save line"),
      onSubmit: async (v) => {
        if (u)
          await s.workspaceAct({
            type: "update_unit",
            id: u.id,
            name: v.name,
            code: u.code,
            active: v.active === "true",
          });
        else
          await s.act({ type: "create_unit", name: v.name, code: `U0${free}` });
        notify(tr("Line saved."));
      },
    });
  }
  const categories = [
    ...new Set(d.styles.map((x) => x.category?.trim()).filter(Boolean)),
  ].sort() as string[];
  function styleForm(st?: Style) {
    open({
      title: st ? tr("Edit style") : tr("Add style"),
      fields: [
        {
          key: "code",
          label: tr("Style code (e.g. Z3006)"),
          value: st?.code,
          required: true,
        },
        {
          key: "name",
          label: tr("Style name"),
          value: st?.name,
          required: true,
        },
        {
          key: "category",
          label: tr("Category"),
          value: st?.category ?? "",
          options: [
            { value: "", label: tr("No category") },
            ...categories.map((x) => ({ value: x, label: x })),
          ],
        },
        { key: "newCategory", label: tr("Or add a new category") },
      ],
      submitLabel: tr("Save style"),
      onSubmit: async (v) => {
        await s.workspaceAct({
          type: "save_style",
          id: st?.id,
          name: v.name,
          code: v.code,
          category: (v.newCategory?.trim() || v.category || "").trim(),
          notes: st?.notes ?? "",
        });
        notify(tr("Style saved."));
      },
    });
  }
  const factoryRate =
    d.rateSettings?.perMinutePaise ?? DEFAULT_PER_MINUTE_PAISE;
  const rupees = (paise: number) => String(paise / 100);
  function rateForm() {
    const auto = d.operations.filter((o) => o.seconds && !o.manual).length;
    open({
      title: tr("Pay rate per minute"),
      description: tr(
        "Operation rate = seconds per piece ÷ 60 × this rate. {{value0}} automatic {{value1}} will use the new rate. Logged pieces keep their saved rate.",
        {
          value0: auto,
          value1: auto === 1 ? tr("operation") : tr("operations"),
        },
      ),
      fields: [
        {
          key: "rate",
          label: tr("Rate per minute (INR)"),
          value: rupees(factoryRate),
          numeric: true,
          required: true,
        },
      ],
      submitLabel: tr("Save pay rate"),
      onSubmit: async (v) => {
        await s.workspaceAct({
          type: "set_rate_settings",
          perMinutePaise: Math.round(Number(v.rate) * 100),
        });
        notify(tr("Pay rate saved."));
      },
    });
  }
  function styleRateForm(st: Style) {
    open({
      title: tr("{{value0}} pay rate", { value0: st.code }),
      description: tr(
        "Use a separate rate per minute for this style. Leave empty to use the factory rate ({{value0}}).",
        { value0: money(factoryRate) },
      ),
      fields: [
        {
          key: "rate",
          label: tr("Rate per minute (INR)"),
          value: st.perMinutePaise ? rupees(st.perMinutePaise) : "",
          numeric: true,
        },
      ],
      submitLabel: tr("Save style rate"),
      onSubmit: async (v) => {
        await s.workspaceAct({
          type: "set_style_pricing",
          styleId: st.id,
          perMinutePaise: v.rate?.trim()
            ? Math.round(Number(v.rate) * 100)
            : null,
        });
        notify(tr("Style rate saved."));
      },
    });
  }
  const priceHelp = (styleId: string) =>
    tr(
      "Enter a price, or only seconds: price = seconds / 60 x {{value0}} per minute. Both are optional.",
      { value0: money(perMinuteFor(d, styleId)) },
    );
  const toPaise = (v?: string) =>
    v?.trim() ? Math.round(Number(v) * 100) : undefined;
  const toSeconds = (v?: string) => (v?.trim() ? Number(v) : undefined);
  function editTask(o: Operation) {
    const earlier = d.operations
      .filter((x) => x.styleId === o.styleId && x.sequence < o.sequence)
      .sort((x, y) => x.sequence - y.sequence);
    open({
      title: o.name,
      description: priceHelp(o.styleId),
      fields: [
        {
          key: "name",
          label: tr("Operation name"),
          value: o.name,
          required: true,
        },
        {
          key: "price",
          label: tr("Rate ₹"),
          value:
            o.manual || !o.seconds
              ? o.ratePaise
                ? rupees(o.ratePaise)
                : ""
              : "",
          numeric: true,
          half: true,
        },
        {
          key: "seconds",
          label: tr("Seconds"),
          value: o.seconds ? String(o.seconds) : "",
          numeric: true,
          half: true,
        },
        ...(earlier.length
          ? [
              {
                key: "prerequisite",
                label: tr("Must come after"),
                value: o.prerequisiteIds[0] ?? "",
                options: [
                  { value: "", label: tr("Nothing") },
                  ...earlier.map((x) => ({ value: x.id, label: x.name })),
                ],
              },
            ]
          : []),
      ],
      submitLabel: tr("Save operation"),
      onSubmit: async (v) => {
        const seconds = toSeconds(v.seconds);
        const price = toPaise(v.price);
        await s.workspaceAct({
          type: "update_operation",
          id: o.id,
          name: v.name,
          prerequisiteIds: v.prerequisite ? [v.prerequisite] : [],
        });
        await s.workspaceAct({
          type: "set_task_pricing",
          id: o.id,
          seconds,
          ratePaise: price ?? (seconds === undefined ? 0 : null),
        });
        notify(tr("Operation saved."));
      },
    });
  }
  function addOne(st: Style) {
    open({
      title: tr("Add operation to {{value0}}", { value0: st.code }),
      description: priceHelp(st.id),
      fields: [
        { key: "name", label: tr("Operation name"), required: true },
        { key: "price", label: tr("Rate ₹"), numeric: true, half: true },
        { key: "seconds", label: tr("Seconds"), numeric: true, half: true },
      ],
      submitLabel: tr("Add operation"),
      onSubmit: async (v) => {
        const price = toPaise(v.price);
        const seconds = toSeconds(v.seconds);
        await s.workspaceAct({
          type: "add_operations",
          styleId: st.id,
          tasks: [{ name: v.name, seconds, ratePaise: price }],
        });
        notify(tr("Operation added."));
      },
    });
  }
  function addTasks(st: Style) {
    open({
      title: tr("Add operations to {{value0}}", { value0: st.code }),
      description: tr(
        "Enter one operation on each row: name, comma, then rate or seconds. Example: Sleeve stitching, 1.80",
      ),
      fields: [
        {
          key: "mode",
          label: tr("The number on each line is"),
          value: "price",
          options: [
            { value: "price", label: tr("Rate ₹") },
            { value: "seconds", label: tr("Seconds") },
          ],
        },
        {
          key: "tasks",
          label: tr("Operations"),
          multiline: true,
          required: true,
        },
      ],
      submitLabel: tr("Add operations"),
      onSubmit: async (v) => {
        const bySeconds = v.mode === "seconds";
        const tasks = v.tasks
          .split("\n")
          .map((line, index) => ({ line: line.trim(), index }))
          .filter((x) => x.line)
          .map(({ line, index }) => {
            const m = line.match(/^(.*?)[,\t]\s*₹?\s*([\d.]+)\s*$/);
            if (!m) return { name: line };
            if (!m[1].trim() || Number.isNaN(Number(m[2])))
              throw new Error(
                tr(
                  "Row {{value0}}: enter operation name, comma, then a number.",
                  { value0: index + 1 },
                ),
              );
            return bySeconds
              ? { name: m[1].trim(), seconds: Math.round(Number(m[2])) }
              : {
                  name: m[1].trim(),
                  ratePaise: Math.round(Number(m[2]) * 100),
                };
          });
        if (!tasks.length) throw new Error("Add at least one operation.");
        await s.workspaceAct({ type: "add_operations", styleId: st.id, tasks });
        notify(tr("{{value0}} operations added.", { value0: tasks.length }));
      },
    });
  }
  function copyTasks(st: Style) {
    const sources = d.styles.filter(
      (x) => x.id !== st.id && d.operations.some((o) => o.styleId === x.id),
    );
    if (!sources.length) {
      notify(tr("No other style has operations to copy yet."));
      return;
    }
    open({
      title: tr("Copy operations into {{value0}}", { value0: st.code }),
      description: tr(
        "Operations and seconds are copied and priced at this style's rate. Fixed prices stay fixed.",
      ),
      fields: [
        {
          key: "from",
          label: tr("Copy from"),
          required: true,
          value: sources[0].id,
          options: sources.map((x) => ({
            value: x.id,
            label: `${x.code} ${x.name}`,
          })),
        },
      ],
      submitLabel: tr("Copy operations"),
      onSubmit: async (v) => {
        const tasks = d.operations
          .filter((o) => o.styleId === v.from)
          .sort((a, b) => a.sequence - b.sequence)
          .map((o) => ({
            name: o.name,
            seconds: o.seconds,
            ratePaise: o.manual || !o.seconds ? o.ratePaise : undefined,
          }));
        await s.workspaceAct({ type: "add_operations", styleId: st.id, tasks });
        notify(tr("{{value0}} operations copied.", { value0: tasks.length }));
      },
    });
  }
  function lotForm(l?: Lot, unitId?: string) {
    if (!l && !unitId) {
      open({
        title: tr("Choose line"),
        fields: [
          {
            key: "unit",
            label: tr("Line"),
            required: true,
            value: units[0]?.value,
            options: units,
          },
        ],
        submitLabel: tr("Continue"),
        onSubmit: async (v) => {
          setTimeout(() => lotForm(undefined, v.unit), 0);
        },
      });
      return;
    }
    const lines = d.lines.filter((x) => x.unitId === unitId);
    open({
      title: l ? tr("Edit batch") : tr("New batch"),
      description: l
        ? tr(
            "Closing a batch stops new counts and assignments. Saved counts stay in History.",
          )
        : undefined,
      fields: [
        {
          key: "code",
          label: tr("Batch number"),
          value: l?.code,
          required: true,
        },
        ...(!l
          ? [
              {
                key: "styleId",
                label: tr("Style"),
                required: true,
                value: d.styles[0]?.id,
                options: d.styles.map((st) => ({
                  value: st.id,
                  label: st.name,
                })),
              },
            ]
          : []),
        {
          key: "pieces",
          label: tr("Planned pieces"),
          numeric: true,
          value: String(l?.totalPieces ?? ""),
          required: true,
        },
        ...(l
          ? [
              {
                key: "status",
                label: tr("Batch status"),
                value: l.status,
                options: [
                  { value: "active", label: tr("In use") },
                  { value: "closed", label: tr("Closed") },
                ],
              },
            ]
          : []),
      ],
      submitLabel: tr("Save batch"),
      onSubmit: async (v) => {
        if (l)
          await s.workspaceAct({
            type: "update_lot",
            id: l.id,
            code: v.code,
            totalPieces: Number(v.pieces),
            status: v.status as "active" | "closed",
          });
        else
          await s.act({
            type: "create_lot",
            code: v.code,
            styleId: v.styleId,
            lineId: lines[0]?.id ?? "",
            unitId: unitId!,
            totalPieces: Number(v.pieces),
          });
        notify(tr("Batch saved."));
      },
    });
  }
  if (kind === "units")
    return (
      <>
        {isAdmin && (
          <ActionButton
            label={tr("Add line")}
            icon="add"
            onPress={() => unitForm()}
          />
        )}
        {scopedUnits.map((u) => (
          <Card key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
            <View style={styles.between}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: c.ink }}>
                  {u.name}
                </Text>
                <Text style={styles.muted}>
                  {tr("Captain:")}{" "}
                  {d.employees.find(
                    (e) =>
                      e.unitId === u.id && e.role === "captain" && e.active,
                  )?.name ?? tr("Not assigned")}{" "}
                  ·{" "}
                  {
                    d.employees.filter(
                      (e) =>
                        e.unitId === u.id && e.active && e.role === "worker",
                    ).length
                  }{" "}
                  {d.employees.filter(
                    (e) => e.unitId === u.id && e.active && e.role === "worker",
                  ).length === 1
                    ? tr("employee")
                    : tr("employees")}
                  {u.active ? "" : tr(" \u00B7 Not in use")}
                </Text>
              </View>
              <TextButton
                label={tr("Manage")}
                onPress={() => setSelectedLine(u)}
              />
            </View>
          </Card>
        ))}
        {selectedLine && (
          <Sheet
            title={selectedLine.name}
            onClose={() => setSelectedLine(null)}
            footer={
              <>
                <ActionButton
                  label={tr("Manage employees")}
                  onPress={() => {
                    const line = selectedLine.id;
                    setSelectedLine(null);
                    go?.(isAdmin ? "people" : "team", { line });
                  }}
                />
                {isAdmin && (
                  <TextButton
                    label={tr("Edit line")}
                    onPress={() => {
                      const unit = selectedLine;
                      setSelectedLine(null);
                      unitForm(unit);
                    }}
                  />
                )}
              </>
            }
          >
            <Text style={styles.label}>{tr("Captain")}</Text>
            <Text style={styles.body}>
              {d.employees.find(
                (e) =>
                  e.unitId === selectedLine.id &&
                  e.active &&
                  e.role === "captain",
              )?.name || tr("Not assigned")}
            </Text>
            {isAdmin && (
              <ActionButton
                secondary
                label={tr("Choose captain")}
                onPress={() => {
                  const unitId = selectedLine.id;
                  setSelectedLine(null);
                  open({
                    title: tr("Choose captain"),
                    description: tr(
                      "The selected employee becomes captain of this line. The current captain becomes an employee.",
                    ),
                    fields: [
                      {
                        key: "employeeId",
                        label: tr("Captain"),
                        required: true,
                        options: d.employees
                          .filter(
                            (e) =>
                              e.active && !e.deletedAt && e.role !== "admin",
                          )
                          .map((e) => ({
                            value: e.id,
                            label: e.name + " · " + e.employeeId,
                          })),
                      },
                    ],
                    submitLabel: tr("Save captain"),
                    onSubmit: async (v) => {
                      await s.workspaceAct({
                        type: "set_line_captain",
                        unitId,
                        employeeId: v.employeeId,
                      });
                      notify(tr("Captain updated."));
                    },
                  });
                }}
              />
            )}
            <Text style={styles.label}>{tr("Employees")}</Text>
            {d.employees
              .filter(
                (e) =>
                  e.unitId === selectedLine.id &&
                  e.active &&
                  !e.deletedAt &&
                  e.role === "worker",
              )
              .map((e) => (
                <View key={e.id} style={styles.between}>
                  <Text style={[styles.body, { flex: 1 }]}>{e.name}</Text>
                  <Text style={styles.muted}>{e.employeeId}</Text>
                </View>
              ))}
          </Sheet>
        )}
      </>
    );
  if (kind === "styles") {
    const shown = d.styles.filter(
      (x) =>
        (category === "all" || (x.category ?? "") === category) &&
        `${x.code} ${x.name}`.toLowerCase().includes(search.toLowerCase()),
    );
    return (
      <>
        <Card>
          <View style={styles.between}>
            <View style={{ flex: 1, gap: 3 }}>
              <TitleRow
                title={tr("Pay rate: {{value0}} per minute", {
                  value0: money(factoryRate),
                })}
                info={tr(
                  "Seconds ÷ 60 × the minute rate sets an operation’s piece rate. You can also enter a fixed rate.",
                )}
              />
            </View>
            <TextButton label={tr("Change")} onPress={rateForm} />
          </View>
        </Card>
        <ActionButton
          label={tr("Add style")}
          icon="add"
          onPress={() => styleForm()}
        />
        <Search
          value={search}
          onChange={setSearch}
          placeholder={tr("Search styles by code or name")}
        />
        {categories.length > 0 && (
          <ChoiceField
            label={tr("Category")}
            value={category}
            onChange={setCategory}
            options={[
              { id: "all", label: tr("All categories") },
              ...categories.map((x) => ({ id: x, label: x })),
            ]}
          />
        )}
        {shown.length === 0 && (
          <Card>
            <Text style={styles.muted}>
              {tr("No styles match. Clear the search or add a new style.")}
            </Text>
          </Card>
        )}
        {shown.map((st) => {
          const ops = d.operations.filter((o) => o.styleId === st.id);
          const total = ops.reduce((n, o) => n + o.ratePaise, 0);
          const isOpen = openStyle === st.id;
          return (
            <Card key={st.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpenStyle(isOpen ? null : st.id)}
                style={styles.between}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{ fontSize: 17, fontWeight: "700", color: c.ink }}
                  >
                    {st.code} {st.name}
                  </Text>
                  <Text style={styles.muted}>
                    {st.category ? `${st.category} · ` : ""}
                    {tr("{{value0}} operations", { value0: ops.length })}
                    {ops.length
                      ? tr(" \u00B7 {{value0}} per piece", {
                          value0: money(total),
                        })
                      : ""}
                    {st.perMinutePaise
                      ? tr(" \u00B7 own rate {{value0}}/min", {
                          value0: money(st.perMinutePaise),
                        })
                      : ""}
                  </Text>
                </View>
                <Icon
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={c.muted}
                />
              </Pressable>
              {isOpen && (
                <>
                  <View style={styles.divider} />
                  {ops.length === 0 && (
                    <Text style={styles.muted}>
                      {tr(
                        "No operations yet. Add one, or paste a whole list from Style options.",
                      )}
                    </Text>
                  )}
                  {ops.length > 0 && ops.every((o) => (o.seconds ?? 0) > 0) && (
                    <Text style={styles.muted}>
                      {tr(
                        "Standard time: {{value0}} seconds · {{value1}} minutes",
                        {
                          value0: ops.reduce((n, o) => n + (o.seconds || 0), 0),
                          value1: (
                            ops.reduce((n, o) => n + (o.seconds || 0), 0) / 60
                          ).toFixed(2),
                        },
                      )}
                    </Text>
                  )}
                  {[...ops]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((o, i) => (
                      <View
                        key={o.id}
                        style={[
                          styles.row,
                          {
                            flexWrap: "wrap",
                            paddingVertical: 10,
                            borderTopWidth: i ? 1 : 0,
                            borderColor: c.line,
                          },
                        ]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "600",
                              color: c.ink,
                            }}
                          >
                            {operationCode(o)} · {o.name}
                          </Text>
                          <Text style={styles.muted}>
                            {o.seconds && !o.manual
                              ? tr("{{value0}} sec \u00B7 worked out", {
                                  value0: o.seconds,
                                })
                              : o.ratePaise
                                ? tr("Set rate")
                                : tr("No rate yet")}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: c.ink,
                          }}
                        >
                          {money(o.ratePaise)}
                        </Text>
                        <IconButton
                          name="ellipsis-horizontal"
                          label={tr("Operation details")}
                          onPress={() => setMenuOperation(o)}
                        />
                      </View>
                    ))}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label={tr("Add operation")}
                        icon="add"
                        onPress={() => addOne(st)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label={tr("Style options")}
                        secondary
                        onPress={() => setMenuStyle(st)}
                      />
                    </View>
                  </View>
                </>
              )}
            </Card>
          );
        })}
        {menuOperation && (
          <Sheet
            title={operationCode(menuOperation) + " · " + menuOperation.name}
            onClose={() => setMenuOperation(null)}
          >
            <MenuRow
              title={tr("Edit")}
              detail={tr("Operation name")}
              icon="wallet-outline"
              onPress={() => {
                const op = menuOperation;
                setMenuOperation(null);
                setTimeout(() => editTask(op), 0);
              }}
            />
            <MenuRow
              title={tr("Operation details")}
              detail={tr("OP code")}
              icon="cut-outline"
              onPress={() => {
                const op = menuOperation;
                setMenuOperation(null);
                setTimeout(() => operationDetails(op), 0);
              }}
            />
          </Sheet>
        )}
        {menuStyle && (
          <Sheet
            title={tr("{{value0}} options", { value0: menuStyle.code })}
            onClose={() => setMenuStyle(null)}
          >
            <ActionButton
              label={tr("Material")}
              secondary
              onPress={() => {
                const st = menuStyle;
                setMenuStyle(null);
                materialForm(st);
              }}
            />
            {(
              [
                [
                  tr("Add many operations"),
                  tr("Paste a list: operation name, seconds"),
                  "cut-outline",
                  () => addTasks(menuStyle),
                ],
                [
                  tr("Copy operations from another style"),
                  tr("Reuse a operation list and price it for this style"),
                  "layers-outline",
                  () => copyTasks(menuStyle),
                ],
                [
                  tr("Style pay rate"),
                  menuStyle.perMinutePaise
                    ? tr("{{value0}} per minute (own rate)", {
                        value0: money(menuStyle.perMinutePaise),
                      })
                    : tr("Using factory rate {{value0}} per minute", {
                        value0: money(factoryRate),
                      }),
                  "wallet-outline",
                  () => styleRateForm(menuStyle),
                ],
                [
                  tr("Edit style details"),
                  tr("Code, name and category"),
                  "shirt-outline",
                  () => styleForm(menuStyle),
                ],
              ] as const
            ).map(([title, detail, icon, run]) => (
              <MenuRow
                key={title}
                title={title}
                detail={detail}
                icon={icon}
                onPress={() => {
                  setMenuStyle(null);
                  setTimeout(run, 0);
                }}
              />
            ))}
          </Sheet>
        )}
      </>
    );
  }
  return (
    <>
      <ActionButton
        label={tr("New batch")}
        icon="add"
        onPress={() => lotForm()}
      />
      {d.lots.map((l) => (
        <Card key={l.id}>
          <View style={styles.between}>
            <View style={{ gap: 3, flex: 1 }}>
              <Text style={[styles.body, { fontWeight: "700" }]}>{l.code}</Text>
              <Text style={styles.muted}>
                {d.styles.find((st) => st.id === l.styleId)?.name}
              </Text>
            </View>
            <Pill
              label={tr(l.status)}
              tone={l.status === "active" ? "neutral" : "warning"}
            />
          </View>
          <Text style={styles.muted}>
            {d.units.find((u) => u.id === l.unitId)?.name} ·{" "}
            {d.lines.find((x) => x.id === l.lineId)?.name}
          </Text>
          <View style={styles.between}>
            <Text style={{ fontSize: 25, color: c.ink, fontWeight: "600" }}>
              {l.totalPieces}
              <Text style={{ fontSize: 12, fontWeight: "400" }}>
                {" "}
                {tr("planned pieces")}
              </Text>
            </Text>
            <TextButton label={tr("Manage batch")} onPress={() => lotForm(l)} />
          </View>
        </Card>
      ))}
    </>
  );
}
