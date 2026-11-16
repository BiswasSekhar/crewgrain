import { formatDate, tr, errorText, currentLanguage } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { Text } from "./Typography";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  BackHandler,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Separator } from "../../components/ui/separator";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useDailyStore } from "../lib/daily-store";
import { PAUSED_WARNING } from "../lib/service-pause";
import { factoryDate } from "../domain/rules";
import type { Role } from "../domain/types";
import * as trail from "../domain/nav";
import { FormSheet, FormSpec } from "./SimpleForms";
import { AdminInbox } from "./AdminInbox";
import { Brand } from "./Brand";
import { LanguagePicker } from "./LanguagePicker";
import { LaunchScreen } from "./LaunchScreen";
import { appVersion, appBuild } from "../lib/app-info";
import { CAPTAIN_REPORTS_ENABLED } from "../lib/features";
import {
  ADMIN_DESKTOP_BREAKPOINT,
  c,
  styles,
  Icon,
  IconName,
  IconButton,
  Title,
  Pill,
  Card,
  ActionButton,
  StickyBarHost,
  TextButton,
  Sheet,
  MenuRow,
  Tap as Pressable,
} from "./kit";
import {
  EmployeeToday,
  CaptainDay,
  OperationAssignments,
  People,
} from "./Workflows";
import { Catalog } from "./Catalog";
import { LineDetail } from "./LineDetail";
import { Output } from "./Output";
import {
  Overview,
  History,
  MyWork,
  Team,
  Requests,
  Reports,
  Hub,
  Production,
  OperationsBreakdown,
  BatchesAlerts,
  Settings,
  Profile,
} from "./FeatureScreens";
const workerNav: () => [string, string, IconName][] = () => [
  ["today", tr("Today"), "home-outline"],
  ["history", tr("History"), "time-outline"],
];
const captainNav: () => [string, string, IconName][] = () => [
  ["approvals", tr("Today"), "home-outline"],
  ["team", tr("Team"), "people-outline"],
  ["plan", tr("Day setup"), "shirt-outline"],
  ["reports", tr("Output"), "wallet-outline"],
];
const adminNav: () => [string, string, IconName][] = () => [
  ["overview", tr("Today"), "home-outline"],
  ["people", tr("Employees"), "people-outline"],
  ["setup", tr("Setup"), "layers-outline"],
  ["production", tr("Production"), "document-text-outline"],
];
const adminNavSections: () => {
  title: string;
  items: [string, string, IconName][];
}[] = () => [
  {
    title: tr("Daily"),
    items: [
      ["overview", tr("Today"), "home-outline"],
      ["people", tr("Employees"), "people-outline"],
      ["tasks", tr("Day setup"), "cut-outline"],
      ["approvals", tr("Approvals"), "checkmark-circle-outline"],
    ],
  },
  {
    title: tr("Setup"),
    items: [
      ["units", tr("Lines"), "business-outline"],
      ["styles", tr("Styles & rates"), "shirt-outline"],
    ],
  },
  {
    title: tr("Production & pay"),
    items: [
      ["production", tr("Production"), "shirt-outline"],

      ...(CAPTAIN_REPORTS_ENABLED
        ? [
            ["reports", tr("Captain reports"), "document-text-outline"] as [
              string,
              string,
              IconName,
            ],
          ]
        : []),
    ],
  },
];
const pageInfo = () =>
  Object.fromEntries(
    Object.entries({
      overview: "Today",
      history: "History",
      today: "Today",
      profile: "Profile",
      team: "Team",
      tasks: "Day setup",
      approvals: "Approvals",
      reports: "Captain reports",
      people: "Employees",
      production: "Production & pay",
      operations: "Operations breakdown",
      alerts: "Batches & alerts",
      line: "Line",
      plan: "Day setup",
      setup: "Setup",
      review: "Production & pay",
      payroll: "Payroll",
      units: "Lines",
      styles: "Styles",
      lots: "Batches",
      requests: "Requests",
      audit: "Audit trail",
      settings: "Settings",
    }).map(([key, value]) => [key, tr(value)]),
  );
const roleName = (r: Role) =>
  r === "worker"
    ? tr("Employee")
    : r === "captain"
      ? tr("Captain")
      : tr("Admin");
// Where the back arrow leads from a sub-page.
function backTo(role: Role, view: string) {
  if (role === "captain") return "team";
  if (view === "approvals") return "overview";
  if (view === "tasks" || view === "requests") return "people";
  if (view === "production" || view === "line") return "overview";
  if (
    ["review", "payroll", "reports", "audit", "operations", "alerts"].includes(
      view,
    )
  )
    return "production";
  return "setup";
}
// Parent used only when there is no trail (deep link, reload, notification).
function fallbackView(role: Role, view: string, tabs: string[], home: string) {
  if (tabs.includes(view) || role === "worker") return home;
  return backTo(role, view);
}
type Sel = Omit<trail.Loc, "view">;
export function AppShell() {
  useTranslation();
  const s = useDailyStore(),
    params = useLocalSearchParams<{
      view?: string;
      line?: string;
      captain?: string;
      employee?: string;
      period?: string;
      date?: string;
    }>(),
    { width: windowWidth } = useWindowDimensions(),
    [form, setForm] = useState<FormSpec | null>(null),
    [message, setMessage] = useState(""),
    [sample, setSample] = useState(false),
    [account, setAccount] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [languagePicker, setLanguagePicker] = useState(false);
  const a = s.actor;
  const homeView = (role?: Role) =>
    role === "worker" ? "today" : role === "captain" ? "approvals" : "overview";
  // Where the user has been. A ref so it survives re-renders and param changes.
  const trailRef = useRef<trail.Trail>([]);
  const [trailNow, setTrailNow] = useState<trail.Trail>([]);
  const setTrail = (next: trail.Trail) => {
    trailRef.current = next;
    setTrailNow(next);
  };
  const here: trail.Loc = {
    view: params.view ?? "",
    line: params.line,
    captain: params.captain,
    employee: params.employee,
    period: params.period,
    date: params.date,
  };
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  });
  // Filters a screen reports about itself (they are not in the URL).
  const liveRef = useRef<{ view: string; sel: Sel } | null>(null);
  const trackView = here.view;
  const track = useCallback(
    (sel: Sel) => {
      liveRef.current = { view: trackView, sel };
    },
    [trackView],
  );
  // Places we asked the router for that have not arrived yet.
  const pendingRef = useRef<string[]>([]);
  const hereKey = trail.locKey(trail.clean(here));
  const knownRef = useRef(hereKey);
  useEffect(() => {
    if (hereKey === knownRef.current) return;
    knownRef.current = hereKey;
    const at = pendingRef.current.indexOf(hereKey);
    if (at >= 0) pendingRef.current = pendingRef.current.slice(at + 1);
    else {
      // Changed from outside (browser back, notification tap): start fresh.
      pendingRef.current = [];
      setTrail(trail.reset());
    }
  }, [hereKey]);
  function show(to: trail.Loc) {
    const key = trail.locKey(trail.clean(to));
    if (key !== trail.locKey(trail.clean(hereRef.current)))
      pendingRef.current = [...pendingRef.current, key].slice(-5);
    liveRef.current = null;
    router.setParams({
      view: to.view,
      line: to.line,
      captain: to.captain,
      employee: to.employee,
      period: to.period,
      date: to.date,
    });
    setMessage(tr(""));
  }
  // Forward move: remember where we were so Back can return there.
  function go(view: string, selection?: Sel) {
    const live =
      liveRef.current?.view === hereRef.current.view ? liveRef.current.sel : {};
    setTrail(
      trail.push(
        trailRef.current,
        { ...hereRef.current, ...live },
        { view, ...selection },
      ),
    );
    show({ view, ...selection });
  }
  // Bottom tab / sidebar / role switch: a fresh start with no history.
  function jump(view: string) {
    setTrail(trail.reset());
    show({ view });
  }
  const tools = { open: setForm, notify: setMessage, go, track };
  if (s.loading) return <LaunchScreen />;
  if (!a || !s.data || params.view === "welcome" || (s.demo && !params.view))
    return <Redirect href="/login" />;
  const nav =
      a.role === "worker"
        ? workerNav()
        : a.role === "captain"
          ? captainNav()
          : adminNav(),
    allowed =
      a.role === "worker"
        ? workerNav().map((n) => n[0])
        : a.role === "captain"
          ? [...captainNav().map((n) => n[0]), "requests", "profile"]
          : Object.keys(pageInfo()).filter(
              (id) =>
                id !== "audit" && (CAPTAIN_REPORTS_ENABLED || id !== "reports"),
            );
  const view = allowed.includes(params.view ?? "")
    ? params.view!
    : homeView(a.role);
  const titleOf = (v: string, line?: string) =>
    a.role === "captain" && v === "approvals"
      ? tr("Today")
      : a.role === "captain" && v === "reports"
        ? tr("Output")
        : v === "line"
          ? (s.data!.units.find((u) => u.id === line)?.name ?? pageInfo().line)
          : (pageInfo()[v] ?? pageInfo().overview);
  const title = titleOf(view, params.line);
  const tabIds = nav.map((n) => n[0]);
  const fallback = fallbackView(a.role, view, tabIds, homeView(a.role));
  const backLoc = trail.peek(trailNow, fallback);
  const hasTrail = trailNow.length > 0;
  // One Back for the arrow and the Android button.
  function goBack() {
    const r = trail.back(trailRef.current, fallback);
    setTrail(r.trail);
    show(r.loc);
  }
  function hardwareBack() {
    if (!hasTrail && view === homeView(a!.role)) return false;
    goBack();
    return true;
  }
  const alerts =
    a.role === "admin"
      ? (s.data.days ?? []).filter((d) => d.status === "needs_admin").length +
        (s.data.corrections ?? []).filter((r) => r.status === "pending")
          .length +
        s.data.requests.filter((r) => r.status === "pending").length +
        (CAPTAIN_REPORTS_ENABLED
          ? s.data.reports.filter((r) => r.status === "submitted").length
          : 0)
      : a.role === "captain"
        ? s.data.employees.filter(
            (e) =>
              e.role === "worker" &&
              e.active &&
              s.data!.assignments.some(
                (task) =>
                  task.employeeId === e.id &&
                  task.active &&
                  (!task.workDate || task.workDate === factoryDate()),
              ) &&
              !(s.data!.days ?? []).some(
                (d) => d.employeeId === e.id && d.workDate === factoryDate(),
              ),
          ).length
        : 0;
  let content: React.ReactNode;
  switch (view) {
    case "today":
      content = <EmployeeToday {...tools} />;
      break;
    case "overview":
      content = <Overview {...tools} />;
      break;
    case "history":
      content =
        a.role === "worker" ? <MyWork {...tools} /> : <History {...tools} />;
      break;
    case "profile":
      content = <Profile {...tools} onExit={() => jump("welcome")} />;
      break;
    case "team":
      content = <Team {...tools} />;
      break;
    case "tasks":
      content = (
        <OperationAssignments
          {...tools}
          key={[params.line, params.date].join(":")}
          initialLine={params.line}
          initialDate={params.date}
        />
      );
      break;
    case "line":
      content = (
        <LineDetail
          {...tools}
          key={params.line}
          lineId={params.line}
          initialDate={params.date}
        />
      );
      break;
    case "approvals":
      content =
        a.role === "admin" ? (
          <AdminInbox {...tools} />
        ) : (
          <CaptainDay {...tools} />
        );
      break;
    case "plan":
      // One screen for the day: pick the date, the styles, and each employee's duties.
      content = <OperationAssignments {...tools} />;
      break;
    case "reports":
      content =
        a.role === "captain" ? <Output {...tools} /> : <Reports {...tools} />;
      break;
    case "requests":
      content = <Requests {...tools} />;
      break;
    case "people":
      content = (
        <People {...tools} key={params.line} initialLine={params.line} />
      );
      break;
    case "production":
      content = (
        <Production
          {...tools}
          key={[
            params.line,
            params.captain,
            params.employee,
            params.period,
            params.date,
          ].join(":")}
          initialLine={params.line}
          initialCaptain={params.captain}
          initialEmployee={params.employee}
          initialPeriod={params.period}
          initialDate={params.date}
        />
      );
      break;
    case "operations":
      content = (
        <OperationsBreakdown
          {...tools}
          key={view}
          line={params.line}
          captain={params.captain}
          employee={params.employee}
          period={params.period}
          date={params.date}
        />
      );
      break;
    case "alerts":
      content = (
        <BatchesAlerts
          {...tools}
          key={view}
          line={params.line}
          captain={params.captain}
          employee={params.employee}
          period={params.period}
          date={params.date}
        />
      );
      break;
    case "payroll":
      content = <Production {...tools} initialMode="pay" />;
      break;
    case "setup":
      content = <Hub {...tools} ids={["units", "styles"]} />;
      break;
    case "review":
      content = <Production {...tools} />;
      break;
    case "units":
    case "styles":
    case "lots":
      content = <Catalog {...tools} key={view} kind={view} />;
      break;
    case "audit":
      content = <Production {...tools} />;
      break;
    case "settings":
      content = <Settings {...tools} />;
      break;
    default:
      content = <Overview {...tools} />;
  }
  const adminTab = (v: string) =>
    ["overview", "approvals", "line"].includes(v)
      ? "overview"
      : ["people", "tasks", "requests"].includes(v)
        ? "people"
        : ["units", "styles", "lots", "setup"].includes(v)
          ? "setup"
          : "production";
  const activeTab = nav.some((n) => n[0] === view)
    ? view
    : a.role === "admin"
      ? adminTab(view)
      : a.role === "captain"
        ? view === "requests" || view === "profile"
          ? "team"
          : "approvals"
        : "history";
  const desktopAdmin =
    a.role === "admin" &&
    Platform.OS === "web" &&
    windowWidth >= ADMIN_DESKTOP_BREAKPOINT;
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.canvas }}
    >
      <StatusBar style="dark" />
      <AndroidBackNavigation onBack={hardwareBack} />
      {s.data.service?.state === "warning" && (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: c.warningLight,
            borderBottomWidth: 1,
            borderColor: c.line,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: c.warning, fontSize: 13, lineHeight: 18 }}>
            {s.data.service.message || tr(PAUSED_WARNING)}
          </Text>
        </View>
      )}
      <View
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: desktopAdmin ? "row" : "column",
          width: "100%",
          backgroundColor: c.canvas,
        }}
      >
        {desktopAdmin && (
          <View
            style={{
              width: 248,
              height: "100%",
              flexShrink: 0,
              backgroundColor: c.paper,
              borderRightWidth: 1,
              borderColor: c.line,
              paddingTop: 20,
              paddingHorizontal: 14,
              paddingBottom: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Go to today")}
              onPress={() => jump("overview")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                paddingHorizontal: 7,
                paddingBottom: 20,
              }}
            >
              <Brand size={40} />
            </Pressable>
            <Separator className="bg-border" />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: 10,
                paddingBottom: 20,
                gap: 16,
              }}
            >
              {adminNavSections().map((section) => (
                <View key={section.title} style={{ gap: 5 }}>
                  <Text
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      color: c.muted,
                      fontSize: 12,
                      fontWeight: "500",
                    }}
                  >
                    {section.title}
                  </Text>
                  {section.items.map(([id, name, icon]) => {
                    const selected =
                      view === id ||
                      (id === "overview" && view === "line") ||
                      (id === "production" &&
                        ["operations", "alerts"].includes(view)) ||
                      (id === "approvals" && view === "requests");
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => jump(id)}
                        style={({ pressed }) => ({
                          minHeight: 43,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 11,
                          paddingHorizontal: 10,
                          borderRadius: 9,
                          backgroundColor: selected
                            ? c.soft
                            : pressed
                              ? "#F3F5F8"
                              : "transparent",
                        })}
                      >
                        <Icon
                          name={icon}
                          size={18}
                          color={selected ? c.primary : c.muted}
                        />
                        <Text
                          style={{
                            flex: 1,
                            color: selected ? c.primary : c.muted,
                            fontSize: 14,
                            fontWeight: selected ? "700" : "500",
                          }}
                        >
                          {name}
                        </Text>
                        {id === "approvals" && alerts > 0 && (
                          <View
                            style={{
                              minWidth: 21,
                              height: 21,
                              paddingHorizontal: 5,
                              borderRadius: 11,
                              backgroundColor: c.signal,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: "white",
                                fontSize: 10,
                                fontWeight: "700",
                              }}
                            >
                              {alerts > 99 ? "99+" : alerts}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <Separator className="bg-border" />
            <View style={{ paddingTop: 12, paddingHorizontal: 4, gap: 4 }}>
              <Text style={{ color: c.ink, fontSize: 12, fontWeight: "600" }}>
                {tr("All units")}
              </Text>
              <Text style={{ color: c.muted, fontSize: 11 }}>
                {s.demo
                  ? tr("Sample workspace")
                  : s.online
                    ? tr("Connected")
                    : tr("Offline \u00B7 saved locally")}
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            flex: 1,
            minHeight: 0,
            height: desktopAdmin ? "100%" : undefined,
            minWidth: 0,
            maxWidth: desktopAdmin ? undefined : 980,
            width: "100%",
            alignSelf: "center",
            backgroundColor: c.canvas,
          }}
        >
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            key={`${a.id}-${view}`}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void s
                    .sync()
                    .then(s.refresh)
                    .catch((e) => setMessage(e.message))
                    .finally(() => setRefreshing(false));
                }}
                tintColor={c.primary}
              />
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: desktopAdmin ? 32 : 20,
              gap: 16,
              paddingBottom: 28,
              width: "100%",
              maxWidth: desktopAdmin ? 1560 : undefined,
              alignSelf: "center",
            }}
          >
            <View style={{ gap: 6 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {(hasTrail ||
                  (!desktopAdmin &&
                    !nav.some((n) => n[0] === view) &&
                    view !== "profile")) && (
                  <IconButton
                    name="arrow-back"
                    label={tr("Back to {{value0}}", {
                      value0: titleOf(backLoc.view, backLoc.line),
                    })}
                    onPress={goBack}
                  />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {a.role === "captain" ? (
                    <View style={{ gap: 6 }}>
                      <Title
                        title={title}
                        right={
                          <IconButton
                            name="ellipsis-horizontal"
                            label={tr("Account")}
                            onPress={() => setAccount(true)}
                          />
                        }
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Pill
                          icon="business-outline"
                          label={
                            s.data.units.find((unit) => unit.id === a.unitId)
                              ?.name ?? tr("Line")
                          }
                          tone="info"
                        />
                        {view === "approvals" && (
                          <Pill
                            icon="calendar-outline"
                            label={formatDate(
                              new Date(`${factoryDate()}T12:00:00Z`),
                              {
                                day: "numeric",
                                month: "short",
                              },
                            )}
                          />
                        )}
                      </View>
                    </View>
                  ) : (
                    <Title
                      title={title}
                      detail={
                        ["overview", "today"].includes(view)
                          ? formatDate(new Date(`${factoryDate()}T12:00:00Z`), {
                              day: "numeric",
                              month: "short",
                            })
                          : undefined
                      }
                      right={
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {a.role === "admin" &&
                            view === "overview" &&
                            desktopAdmin && (
                              <ActionButton
                                label={tr("Day setup")}
                                icon="add"
                                onPress={() => go("tasks")}
                              />
                            )}
                          {a.role === "admin" &&
                            (desktopAdmin ||
                              nav.some((n) => n[0] === view)) && (
                              <View>
                                <IconButton
                                  name="notifications-outline"
                                  label={tr("Approvals, {{value0}} waiting", {
                                    value0: alerts,
                                  })}
                                  onPress={() => go("approvals")}
                                />
                                {alerts > 0 && (
                                  <View
                                    pointerEvents="none"
                                    style={{
                                      position: "absolute",
                                      right: 0,
                                      top: 0,
                                      minWidth: 18,
                                      height: 18,
                                      paddingHorizontal: 4,
                                      borderRadius: 9,
                                      backgroundColor: c.primary,
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: c.paper,
                                        fontSize: 10,
                                        fontWeight: "600",
                                      }}
                                    >
                                      {alerts > 99 ? "99+" : alerts}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}
                          <IconButton
                            name="ellipsis-horizontal"
                            label={tr("Account")}
                            onPress={() => setAccount(true)}
                          />
                        </View>
                      }
                    />
                  )}
                </View>
              </View>
              {s.outbox.length > 0 || !s.online ? (
                <Text style={{ fontSize: 12, color: c.warning }}>
                  {s.syncing
                    ? tr("Syncing...")
                    : tr("{{value0}} changes saved on this phone", {
                        value0: s.outbox.length,
                      })}
                  {!s.online ? tr(" - Offline") : ""}
                </Text>
              ) : null}
            </View>
            {!!s.error && (
              <Card style={{ backgroundColor: c.dangerLight }}>
                <Text
                  accessibilityRole="alert"
                  style={{ color: c.danger, lineHeight: 21 }}
                >
                  {s.error}
                </Text>
                <TextButton
                  label={tr("Try again")}
                  onPress={() =>
                    void s.refresh().catch((e) => setMessage(e.message))
                  }
                />
              </Card>
            )}
            {!!message && (
              <Pressable onPress={() => setMessage(tr(""))}>
                <Card style={{ backgroundColor: c.soft }}>
                  <Text
                    accessibilityRole="alert"
                    style={[styles.body, { fontSize: 13 }]}
                  >
                    {errorText(message)}
                  </Text>
                </Card>
              </Pressable>
            )}
            {s.outbox.some((r) => r.state === "attention") && (
              <Card>
                <Text style={{ color: c.danger, fontSize: 13 }}>
                  {tr(
                    "Some saved changes need attention. Keep this phone\u2019s data until they are resolved.",
                  )}
                </Text>
                {s.outbox
                  .filter((r) => r.state === "attention")
                  .map((r) => (
                    <View key={r.id} style={{ gap: 6 }}>
                      <Text style={styles.muted}>{r.error}</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextButton
                          label={tr("Try again")}
                          onPress={() =>
                            void s
                              .retryAttention(r.id)
                              .catch((e) => setMessage(e.message))
                          }
                        />
                        <TextButton
                          label={tr("Discard this change")}
                          onPress={() =>
                            void s
                              .discardAttention(r.id)
                              .catch((e) => setMessage(e.message))
                          }
                        />
                      </View>
                    </View>
                  ))}
              </Card>
            )}
            {content}
          </ScrollView>
          <StickyBarHost />
          {!desktopAdmin && (
            <SafeAreaView
              edges={["bottom"]}
              style={{
                backgroundColor: c.paper,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  paddingHorizontal: 10,
                  paddingTop: 7,
                  paddingBottom: 6,
                  gap: 7,
                }}
              >
                {nav.map(([id, name, icon]) => (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      a.role === "captain" && id === "approvals" && alerts > 0
                        ? tr("{{value0}}, {{value1}} to check", {
                            value0: name,
                            value1: alerts,
                          })
                        : name
                    }
                    accessibilityState={{ selected: activeTab === id }}
                    onPress={() => jump(id)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 66,
                      gap: 4,
                      borderRadius: 12,
                      backgroundColor: c.paper,
                      marginHorizontal: 1,
                    }}
                  >
                    <View
                      style={{
                        minWidth: 56,
                        height: 30,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          activeTab === id ? c.soft : "transparent",
                      }}
                    >
                      <Icon
                        name={icon}
                        size={22}
                        color={activeTab === id ? c.primary : c.muted}
                      />
                      {a.role === "captain" &&
                        id === "approvals" &&
                        alerts > 0 && (
                          <View
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              right: 1,
                              top: -3,
                              minWidth: 18,
                              height: 18,
                              paddingHorizontal: 4,
                              borderRadius: 9,
                              backgroundColor: c.primary,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: c.paper,
                                fontSize: 10,
                                fontWeight: "600",
                              }}
                            >
                              {alerts > 99 ? "99+" : alerts}
                            </Text>
                          </View>
                        )}
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        lineHeight: 17,
                        textAlign: "center",
                        maxWidth: "100%",
                        flexShrink: 1,
                        fontWeight: activeTab === id ? "700" : "500",
                        color: activeTab === id ? c.primary : c.muted,
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </SafeAreaView>
          )}
        </View>
      </View>
      <FormSheet form={form} onClose={() => setForm(null)} />
      {account && (
        <Sheet title={a.name} onClose={() => setAccount(false)}>
          <MenuRow
            title={tr("Language")}
            detail={currentLanguage().native}
            icon="language-outline"
            onPress={() => {
              setAccount(false);
              setLanguagePicker(true);
            }}
          />
          <MenuRow
            title={tr("Refresh")}
            icon="cloud-done-outline"
            onPress={() => {
              setAccount(false);
              void s
                .sync()
                .then(s.refresh)
                .catch((e) => setMessage(e.message));
            }}
          />
          <Text style={styles.muted}>
            {roleName(a.role)} · {a.employeeId} ·{" "}
            {a.role === "admin"
              ? tr("All lines")
              : (s.data.units.find((u) => u.id === a.unitId)?.name ?? "")}
          </Text>
          {s.demo && (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>
                {tr("Switch role (sample data)")}
              </Text>
              {(["worker", "captain", "admin"] as Role[]).map((role) => (
                <MenuRow
                  key={role}
                  title={roleName(role)}
                  detail={role === a.role ? tr("Current role") : undefined}
                  icon={
                    role === "worker"
                      ? "shirt-outline"
                      : role === "captain"
                        ? "people-outline"
                        : "shield-checkmark-outline"
                  }
                  onPress={() =>
                    void s
                      .enterDemo(role)
                      .then(() => {
                        jump(homeView(role));
                        setAccount(false);
                      })
                      .catch((e) => setMessage(e.message))
                  }
                />
              ))}
              <TextButton
                label={s.online ? tr("Test offline counting") : tr("Reconnect")}
                onPress={() => {
                  s.simulateOffline(s.online);
                  setAccount(false);
                }}
              />
              <TextButton
                label={tr("Reset sample data")}
                onPress={() =>
                  void s
                    .resetDemo()
                    .then(() => {
                      setAccount(false);
                      setMessage(tr("Sample data reset."));
                    })
                    .catch((e) => setMessage(e.message))
                }
              />
            </View>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderColor: c.line,
              paddingTop: 16,
              gap: 4,
            }}
          >
            <Brand size={32} />
            <Text style={styles.muted}>
              {tr("Version")}
              {appVersion}
              {tr("\u00B7 Build")}
              {appBuild}
            </Text>
            {s.demo && (
              <Text style={styles.muted}>{tr("Sample workspace")}</Text>
            )}
          </View>
          <ActionButton
            label={tr("Log out")}
            secondary
            icon="log-out-outline"
            onPress={() =>
              void s
                .logout()
                .then(() => {
                  setAccount(false);
                  router.replace("/login");
                })
                .catch((e) => setMessage(e.message))
            }
          />
        </Sheet>
      )}
      {sample && (
        <Sheet title={tr("Sample workspace")} onClose={() => setSample(false)}>
          {(["worker", "captain", "admin"] as Role[]).map((role) => (
            <MenuRow
              key={role}
              title={roleName(role)}
              detail={tr("Explore with sample data")}
              icon={
                role === "worker"
                  ? "shirt-outline"
                  : role === "captain"
                    ? "people-outline"
                    : "shield-checkmark-outline"
              }
              onPress={() =>
                void s
                  .enterDemo(role)
                  .then(() => {
                    jump(homeView(role));
                    setSample(false);
                  })
                  .catch((e) => setMessage(e.message))
              }
            />
          ))}
          <TextButton
            label={s.online ? tr("Test offline counting") : tr("Reconnect")}
            onPress={() => {
              s.simulateOffline(s.online);
              setSample(false);
            }}
          />
          <TextButton
            label={tr("Reset sample data")}
            onPress={() =>
              void s
                .resetDemo()
                .then(() => {
                  setSample(false);
                  setMessage(tr("Sample data reset."));
                })
                .catch((e) => setMessage(e.message))
            }
          />
          <TextButton
            label={tr("Open login page")}
            onPress={() => {
              setSample(false);
              router.replace("/login");
            }}
          />
        </Sheet>
      )}
      {languagePicker && (
        <LanguagePicker onClose={() => setLanguagePicker(false)} />
      )}
    </SafeAreaView>
  );
}
function AndroidBackNavigation({ onBack }: { onBack: () => boolean }) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () =>
      latest.current(),
    );
    return () => subscription.remove();
  }, []);
  return null;
}
