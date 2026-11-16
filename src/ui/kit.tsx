import { numberLocale, tr, currentLanguage } from "../lib/i18n";
import { useTranslation } from "react-i18next";
import { languageFont } from "../lib/language-fonts";
import { Text, TextInput, font } from "./Typography";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  Keyboard,
  View,
  Pressable as RNPressable,
  PressableProps,
  ScrollView,
  Modal,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Bell from "lucide-react-native/icons/bell";
import Building from "lucide-react-native/icons/building";
import CalendarDays from "lucide-react-native/icons/calendar-days";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Circle from "lucide-react-native/icons/circle";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleDot from "lucide-react-native/icons/circle-dot";
import CircleUser from "lucide-react-native/icons/circle-user";
import CircleUserRound from "lucide-react-native/icons/circle-user-round";
import X from "lucide-react-native/icons/x";
import Clock3 from "lucide-react-native/icons/clock-3";
import CloudCheck from "lucide-react-native/icons/cloud-check";
import Coins from "lucide-react-native/icons/coins";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Eye from "lucide-react-native/icons/eye";
import EyeOff from "lucide-react-native/icons/eye-off";
import FileText from "lucide-react-native/icons/file-text";
import FolderUsers from "lucide-react-native/icons/folder-users";
import House from "lucide-react-native/icons/house";
import Info from "lucide-react-native/icons/info";
import Layers from "lucide-react-native/icons/layers";
import Lock from "lucide-react-native/icons/lock";
import LogOut from "lucide-react-native/icons/log-out";
import Phone from "lucide-react-native/icons/phone";
import Plus from "lucide-react-native/icons/plus";
import Scissors from "lucide-react-native/icons/scissors";
import SearchIcon from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Shirt from "lucide-react-native/icons/shirt";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Languages from "lucide-react-native/icons/languages";
import { BarChart } from "react-native-gifted-charts";
import { Badge as ReusableBadge } from "../../components/ui/badge";
import { Button as ReusableButton } from "../../components/ui/button";
import { Card as ReusableCard } from "../../components/ui/card";
import { Icon as ReusableIcon } from "../../components/ui/icon";
import { Input as ReusableInput } from "../../components/ui/input";
import { Text as ReusableText } from "../../components/ui/text";
import { cn } from "../../lib/utils";
import { PortalHost } from "@rn-primitives/portal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
// NativeWind ignores Pressable style functions, which collapsed row layouts
// and button backgrounds on device. Resolve the pressed state here instead.
export function Tap({
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?:
    StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
}) {
  useTranslation();
  const [pressed, setPressed] = useState(false);
  return (
    <RNPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={typeof style === "function" ? style({ pressed }) : style}
    >
      {children}
    </RNPressable>
  );
}
const Pressable = Tap;
export const c = {
  primary: "#2459CE",
  navy: "#17202C",
  action: "#2459CE",
  signal: "#C64F3A",
  signalLight: "#F3A089",
  success: "#287653",
  soft: "#EAF0FF",
  infoLight: "#EEF4FF",
  infoBorder: "#CCDAF8",
  violet: "#6543AC",
  violetLight: "#F2EDFC",
  warning: "#8B621B",
  warningLight: "#FFF4D8",
  canvas: "#F3F5FA",
  ink: "#202731",
  muted: "#667080",
  line: "#E1E5EB",
  paper: "#FFFFFF",
  danger: "#B84138",
  dangerLight: "#FCE9E6",
};
export const ADMIN_DESKTOP_BREAKPOINT = 1100;
export const ink = c.ink,
  green = c.primary,
  grey = c.muted,
  line = c.line;
const iconMap = {
  "language-outline": Languages,
  "filter-outline": SlidersHorizontal,
  "layers-outline": Layers,
  "arrow-back": ArrowLeft,
  "home-outline": House,
  "people-outline": FolderUsers,
  "person-outline": CircleUser,
  "ellipsis-horizontal": Ellipsis,
  "eye-outline": Eye,
  "eye-off-outline": EyeOff,
  checkmark: Check,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,
  "radio-button-on": CircleDot,
  "radio-button-off": Circle,
  "notifications-outline": Bell,
  "business-outline": Building,
  "shirt-outline": Shirt,
  "chevron-forward": ChevronRight,
  "chevron-back": ChevronLeft,
  "checkmark-circle-outline": CircleCheck,
  "search-outline": SearchIcon,
  close: X,
  "shield-checkmark-outline": ShieldCheck,
  add: Plus,
  "cut-outline": Scissors,
  "calendar-outline": CalendarDays,
  "call-outline": Phone,
  "cloud-done-outline": CloudCheck,
  "document-text-outline": FileText,
  "log-out-outline": LogOut,
  "lock-closed-outline": Lock,
  "person-add-outline": CircleUserRound,
  "settings-outline": Settings,
  "swap-horizontal-outline": ArrowLeftRight,
  "time-outline": Clock3,
  "wallet-outline": Coins,
  "information-circle-outline": Info,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof iconMap;
export function Icon({
  name,
  size = 21,
  color = c.primary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  useTranslation();
  return (
    <ReusableIcon
      as={iconMap[name]}
      size={size}
      color={color}
      aria-hidden={true}
      style={
        currentLanguage().rtl &&
        ["arrow-back", "chevron-forward", "chevron-back"].includes(name)
          ? { transform: [{ scaleX: -1 }] }
          : undefined
      }
    />
  );
}
export const styles = StyleSheet.create({
  body: { fontSize: 16, color: c.ink, lineHeight: 24 },
  muted: { fontSize: 14, color: c.muted, lineHeight: 21 },
  heading: {
    fontSize: 26,
    fontWeight: "600",
    color: c.ink,
    letterSpacing: -0.6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  section: { gap: 16 },
  divider: { height: 1, backgroundColor: c.line },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: c.ink,
    minHeight: 56,
    backgroundColor: c.paper,
  },
  label: { fontSize: 14, fontWeight: "600", color: c.ink, marginBottom: 7 },
  card: {
    backgroundColor: c.paper,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.line,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "700",
    color: c.ink,
    letterSpacing: -0.6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: c.muted,
    textTransform: "uppercase",
  },
  list: {
    backgroundColor: c.paper,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    minHeight: 80,
  },
  avatar: {
    height: 40,
    width: 40,
    borderRadius: 12,
    backgroundColor: c.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    color: c.ink,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
});
export function ActionButton({
  label,
  onPress,
  secondary = false,
  destructive = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  useTranslation();
  return (
    <ReusableButton
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      variant={destructive ? "destructive" : secondary ? "outline" : "default"}
      className={cn(
        "min-h-[52px] h-auto rounded-xl border px-4 py-3 shadow-none",
        destructive
          ? "border-destructive"
          : secondary
            ? "border-border bg-card"
            : "border-primary",
      )}
      style={({ pressed }) => ({
        opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
      })}
    >
      {icon && (
        <Icon
          name={icon}
          size={19}
          color={secondary && !destructive ? c.ink : "white"}
        />
      )}
      <ReusableText
        style={{
          fontSize: 15,
          fontWeight: "600",
          flexShrink: 1,
          color: secondary ? c.ink : "white",
          textAlign: "center",
        }}
      >
        {label}
      </ReusableText>
    </ReusableButton>
  );
}
export function TextButton({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  useTranslation();
  const danger = destructive;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        alignSelf: "flex-start",
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: pressed
          ? danger
            ? "#F6D5D1"
            : c.soft
          : danger
            ? c.dangerLight
            : "transparent",
      })}
    >
      <Text
        style={{
          fontSize: 14,
          color: danger ? c.danger : c.primary,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  dark = false,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  dark?: boolean;
  disabled?: boolean;
}) {
  useTranslation();
  return (
    <ReusableButton
      variant="ghost"
      size="icon"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 min-h-11 rounded-full border border-border bg-card"
      style={{
        height: 44,
        width: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: dark ? c.navy : c.line,
        backgroundColor: dark ? c.navy : c.paper,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon name={name} color={dark ? c.paper : c.muted} />
    </ReusableButton>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  useTranslation();
  return (
    <ReusableCard
      className="rounded-2xl border-border bg-card p-4 gap-3 shadow-none"
      style={style}
    >
      {children}
    </ReusableCard>
  );
}
export function Pill({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "neutral" | "warning" | "danger" | "info" | "success";
  icon?: IconName;
}) {
  useTranslation();
  return (
    <ReusableBadge
      variant={tone === "danger" ? "destructive" : "secondary"}
      className={cn(
        "self-start rounded-md border-transparent px-2 py-1",
        tone === "warning" && "bg-warningLight",
        tone === "info" && "bg-accent",
        tone === "neutral" && "bg-muted",
      )}
      style={{
        backgroundColor:
          tone === "info"
            ? c.infoLight
            : tone === "success"
              ? c.violetLight
              : tone === "warning"
                ? c.warningLight
                : tone === "danger"
                  ? c.danger
                  : "#E9EDF4",
        gap: 5,
        maxWidth: "100%",
      }}
    >
      {icon && (
        <Icon
          name={icon}
          size={13}
          color={
            tone === "warning"
              ? c.warning
              : tone === "success"
                ? c.violet
                : c.primary
          }
        />
      )}
      <ReusableText
        className={cn(
          "text-xs font-medium",
          tone === "warning" && "text-warning",
          tone === "info" && "text-primary",
          tone === "neutral" && "text-muted-foreground",
        )}
        style={{
          flexShrink: 1,
          lineHeight: 18,
          ...(tone === "success" ? { color: c.violet } : {}),
        }}
      >
        {label}
      </ReusableText>
    </ReusableBadge>
  );
}
export function Title({
  title,
  detail,
  right,
  info,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
  info?: string;
}) {
  useTranslation();
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <View style={styles.between}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <Text
            accessibilityRole="header"
            style={[styles.pageTitle, { flexShrink: 1 }]}
          >
            {title}
          </Text>
          {!!info && (
            <InfoIcon open={infoOpen} onPress={() => setInfoOpen(!infoOpen)} />
          )}
        </View>
        {!!detail && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon name="calendar-outline" size={13} color={c.muted} />
            <Text style={[styles.muted, { flex: 1, minWidth: 0 }]}>
              {detail}
            </Text>
          </View>
        )}
        {infoOpen && !!info && <Text style={styles.muted}>{info}</Text>}
      </View>
      {!!right && <View style={{ flexShrink: 0 }}>{right}</View>}
    </View>
  );
}
export function SectionTitle({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  useTranslation();
  return (
    <View style={styles.between}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink, flex: 1 }}>
        {title}
      </Text>
      {right}
    </View>
  );
}
export type TrendSeries = {
  label: string;
  points: {
    label: string;
    value: number;
  }[];
  format: (value: number) => string;
};
export function TrendChart({
  title,
  pieces,
  money,
  collapsible = false,
}: {
  title: string;
  pieces: TrendSeries;
  money: TrendSeries;
  collapsible?: boolean;
}) {
  useTranslation();
  const [selected, setSelected] = useState<"pieces" | "money">("pieces");
  const [expanded, setExpanded] = useState(!collapsible);
  const [chartWidth, setChartWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const series = selected === "pieces" ? pieces : money;
  const peak = Math.max(0, ...series.points.map((point) => point.value));
  const description = series.points
    .map((point) => `${point.label}: ${series.format(point.value)}`)
    .join(", ");
  return (
    <View style={[styles.card, { padding: 16, gap: 12 }]}>
      {collapsible && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={title}
          onPress={() => setExpanded(!expanded)}
          style={[styles.between, { minHeight: 44 }]}
        >
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: "600" }}>
            {title}
          </Text>
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={c.muted}
          />
        </Pressable>
      )}
      {(!collapsible || expanded) && (
        <>
          <View style={styles.between}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>
              {!collapsible ? title : ""}
            </Text>
            <View
              style={{
                flexDirection: "row",
                padding: 3,
                backgroundColor: c.canvas,
                borderRadius: 9,
              }}
            >
              {(
                [
                  ["pieces", tr("Pieces")],
                  ["money", money.label],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selected === key }}
                  onPress={() => setSelected(key)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    borderRadius: 7,
                    backgroundColor: selected === key ? c.paper : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: selected === key ? "600" : "500",
                      color: selected === key ? c.ink : c.muted,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View
            accessibilityLabel={`${title} · ${series.label}. ${description}`}
            onLayout={(event) => {
              const nextWidth = Math.floor(event.nativeEvent.layout.width);
              if (nextWidth !== chartWidth) setChartWidth(nextWidth);
            }}
          >
            {chartWidth > 0 && (
              <BarChart
                data={series.points.map((point) => ({
                  label: point.label,
                  value: Math.max(0, point.value),
                  topLabelContainerStyle: {
                    width: 48,
                    marginLeft: -15,
                    alignItems: "center",
                  },
                  topLabelComponent: () => (
                    <Text
                      numberOfLines={1}
                      style={{
                        color: c.ink,
                        fontSize: 11,
                        fontWeight: "700",
                        width: 44,
                        textAlign: "center",
                        marginBottom: 2,
                      }}
                    >
                      {point.value > 0 ? series.format(point.value) : ""}
                    </Text>
                  ),
                }))}
                width={Math.min(chartWidth, Math.max(220, windowWidth - 72))}
                height={130}
                maxValue={(peak || 1) * 1.2}
                noOfSections={3}
                spacing={Math.max(
                  8,
                  (Math.min(chartWidth, Math.max(220, windowWidth - 72)) -
                    50 -
                    series.points.length * 18) /
                    Math.max(1, series.points.length - 1),
                )}
                initialSpacing={10}
                endSpacing={10}
                barWidth={18}
                frontColor={c.primary}
                barBorderRadius={5}
                xAxisColor={c.line}
                xAxisThickness={1}
                xAxisLabelTextStyle={{
                  color: c.muted,
                  fontSize: 12,
                  fontFamily:
                    languageFont(currentLanguage().code) ?? font.regular,
                }}
                yAxisThickness={0}
                hideYAxisText
                hideRules
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  icon: IconName;
  note?: string;
}) {
  useTranslation();
  const { width } = useWindowDimensions();
  const monetary = icon === "wallet-outline";
  return (
    <ReusableCard
      className="shadow-none"
      style={{
        flex: 1,
        minWidth: 0,
        padding: 14,
        gap: 8,
        backgroundColor: monetary ? c.warningLight : c.infoLight,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: monetary ? "#EFDFB5" : c.infoBorder,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={16} color={monetary ? c.warning : c.primary} />
        <Text
          style={{
            fontSize: 12,
            lineHeight: 17,
            flex: 1,
            minWidth: 0,
            color: monetary ? c.warning : c.primary,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={{
          fontSize: width < 400 ? 22 : 28,
          fontWeight: "600",
          color: c.ink,
          fontVariant: ["tabular-nums"],
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Text>
      {!!note && (
        <Text style={{ fontSize: 11, color: c.muted, lineHeight: 16 }}>
          {note}
        </Text>
      )}
    </ReusableCard>
  );
}
export function MenuRow({
  title,
  detail,
  icon,
  onPress,
  right,
}: {
  title: string;
  detail?: string;
  icon: IconName;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 16,
        paddingVertical: 17,
        minHeight: 66,
        backgroundColor: pressed ? c.soft : c.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.line,
      })}
    >
      <Icon name={icon} size={21} color={c.muted} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: c.ink }}>
          {title}
        </Text>
        {!!detail && (
          <Text style={{ fontSize: 14, color: c.muted, lineHeight: 21 }}>
            {detail}
          </Text>
        )}
      </View>
      {right ?? <Icon name="chevron-forward" size={18} color={c.muted} />}
    </Pressable>
  );
}
export function Empty({
  title,
  detail,
  icon = "checkmark-circle-outline",
  action,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  action?: React.ReactNode;
}) {
  useTranslation();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
      <View style={{ padding: 14, borderRadius: 50, backgroundColor: c.soft }}>
        <Icon name={icon} size={28} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>
        {title}
      </Text>
      {!!detail && (
        <Text style={[styles.muted, { textAlign: "center", maxWidth: 330 }]}>
          {detail}
        </Text>
      )}
      {action}
    </Card>
  );
}
/** Boxed segmented control: one raised thumb slides to the chosen option. */
export function Segments({
  value,
  options,
  onChange,
}: {
  value: string;
  options: {
    id: string;
    label: string;
  }[];
  onChange: (value: string) => void;
}) {
  useTranslation();
  const reduceMotion = useReducedMotion();
  const rtl = currentLanguage().rtl;
  const [width, setWidth] = useState(0);
  const count = Math.max(options.length, 1);
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const inner = Math.max(width - 8, 0);
  const segment = inner / count;
  const offset = useSharedValue(0);
  const ready = useSharedValue(0);
  useEffect(() => {
    if (!inner) return;
    const target = (rtl ? -1 : 1) * index * segment;
    if (!ready.value || reduceMotion) {
      offset.value = target;
      ready.value = 1;
    } else {
      offset.value = withTiming(target, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [index, segment, inner, rtl, reduceMotion, offset, ready]);
  const thumb = useAnimatedStyle(() => ({
    opacity: ready.value,
    transform: [{ translateX: offset.value }],
  }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        padding: 4,
        borderRadius: 14,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: "#EEF1F6",
        width: "100%",
      }}
    >
      {!!inner && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              width: segment,
              borderRadius: 10,
              borderCurve: "continuous",
              backgroundColor: c.paper,
              borderWidth: 1,
              borderColor: c.infoBorder,
              boxShadow: "0 1px 3px rgba(23,32,44,0.14)",
            },
            thumb,
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              paddingHorizontal: 4,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontSize: 14,
                fontWeight: on ? "700" : "500",
                color: on ? c.primary : c.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
// Custom dropdown: the list opens inline under the field, so it is always in
// front of the content and never hides behind a sheet or the system picker.
export function ChoiceField({
  value,
  options,
  onChange,
  label,
  compact = false,
  icon,
}: {
  value: string;
  options: {
    id: string;
    label: string;
  }[];
  onChange: (value: string) => void;
  label: string;
  portalHost?: string;
  /** A shorter field with an optional leading icon, for filter bars. */
  compact?: boolean;
  icon?: IconName;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: compact ? 48 : 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: open ? c.primary : c.line,
          backgroundColor: c.paper,
        }}
      >
        {icon && <Icon name={icon} size={18} color={c.primary} />}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 15,
            color: selected ? c.ink : c.muted,
            fontWeight: selected ? "600" : "400",
          }}
        >
          {selected?.label ?? label}
        </Text>
        <Icon
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.muted}
        />
      </Pressable>
      {open && (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.paper,
            maxHeight: 240,
            overflow: "hidden",
          }}
        >
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((option, index) => {
              const on = option.id === value;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: c.line,
                    backgroundColor: on ? c.soft : c.paper,
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: on ? c.primary : c.ink,
                      fontWeight: on ? "700" : "400",
                    }}
                  >
                    {option.label}
                  </Text>
                  {on && <Icon name="checkmark-circle-outline" size={18} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
export function DailySummary({
  pieces,
  value,
  checked,
  people,
  present,
  team = false,
  onPieces,
  onValue,
  onPeople,
}: {
  pieces: number;
  value: number;
  checked: number;
  people: number;
  present: number;
  team?: boolean;
  onPieces?: () => void;
  onValue?: () => void;
  onPeople?: () => void;
}) {
  useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= ADMIN_DESKTOP_BREAKPOINT;
  return (
    <View style={[styles.list, { flexDirection: wide ? "row" : "column" }]}>
      <View style={{ flexDirection: "row", flex: wide ? 1 : undefined }}>
        {[
          {
            label: tr("Pieces today"),
            amount: pieces.toLocaleString(numberLocale()),
            action: onPieces,
          },
          {
            label: team ? tr("Line pay") : tr("Labour cost"),
            amount: (value / 100).toLocaleString(numberLocale(), {
              style: "currency",
              currency: "INR",
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            }),
            action: onValue,
          },
        ].map((item, index) => (
          <Pressable
            key={item.label}
            accessibilityRole={item.action ? "button" : undefined}
            accessibilityLabel={tr("{{value0}}, {{value1}}. Open details", {
              value0: item.label,
              value1: item.amount,
            })}
            disabled={!item.action}
            onPress={item.action}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              padding: wide ? 24 : 16,
              gap: 12,
              borderLeftWidth: index ? 1 : 0,
              borderColor: c.line,
              backgroundColor: pressed ? c.soft : c.paper,
            })}
          >
            <View style={[styles.between, { gap: 4 }]}>
              <Text style={{ fontSize: 14, color: c.muted, flexShrink: 1 }}>
                {item.label}
              </Text>
              {!!item.action && (
                <Icon name="chevron-forward" size={16} color={c.muted} />
              )}
            </View>
            <Text
              selectable={!item.action}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{
                fontSize: wide ? 40 : width < 400 ? 24 : 30,
                fontWeight: "600",
                color: c.ink,
                fontVariant: ["tabular-nums"],
                letterSpacing: -1,
              }}
            >
              {item.amount}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole={onPeople ? "button" : undefined}
        accessibilityLabel={tr(
          "{{value0}} of {{value1}} employees checked, {{value2}} present. Open employees",
          { value0: checked, value1: people, value2: present },
        )}
        disabled={!onPeople}
        onPress={onPeople}
        style={{
          paddingHorizontal: wide ? 24 : 16,
          paddingVertical: 16,
          gap: 12,
          width: wide ? 260 : undefined,
          justifyContent: "center",
          borderTopWidth: wide ? 0 : 1,
          borderLeftWidth: wide ? 1 : 0,
          borderColor: c.line,
        }}
      >
        <View style={styles.between}>
          <Text style={{ fontSize: 14, color: c.muted }}>
            <Text
              style={{
                color: c.ink,
                fontWeight: "600",
                fontSize: wide ? 24 : 14,
              }}
            >
              {checked}/{people}
            </Text>{" "}
            {tr("checked")}
          </Text>
          <Text style={{ fontSize: 14, color: c.muted }}>
            {present}
            {tr("present")}
          </Text>
        </View>
        <View
          style={{
            height: 4,
            backgroundColor: c.canvas,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 4,
              backgroundColor: c.primary,
              borderRadius: 4,
              width: `${people ? Math.min(100, (checked / people) * 100) : 0}%`,
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}
export function Search({
  value,
  onChange,
  placeholder = tr("Search"),
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  useTranslation();
  return (
    <View
      style={[
        styles.row,
        {
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 10,
          backgroundColor: "white",
          paddingHorizontal: 13,
        },
      ]}
    >
      <Icon name="search-outline" size={19} color={c.muted} />
      <ReusableInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        className="h-[50px] flex-1 border-0 bg-transparent px-0 text-sm shadow-none"
        style={{ flex: 1, minHeight: 50, fontSize: 14, color: c.ink }}
      />
    </View>
  );
}
/** A typed count. The worker types the number done; it replaces the previous
 *  value (the change is worked out from what is shown, so nothing else is kept).
 *  Saves when the field is left or the keyboard's Done is pressed. */
export function Counter({
  label,
  value,
  onSet,
  disabled = false,
  small = false,
}: {
  label: string;
  value: number;
  onSet: (next: number) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim() === "" ? value : Number(draft);
    setDraft(null);
    if (Number.isInteger(next) && next >= 0 && next <= 20000 && next !== value)
      onSet(next);
  };
  return (
    <View
      style={{
        minHeight: small ? 56 : 72,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: draft !== null ? c.primary : c.line,
        backgroundColor: disabled ? c.canvas : c.paper,
        justifyContent: "center",
      }}
    >
      <TextInput
        accessibilityLabel={tr("{{value0}} count {{value1}}", {
          value0: label,
          value1: value,
        })}
        editable={!disabled}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={5}
        value={shown}
        onFocus={() => setDraft(String(value))}
        onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onSubmitEditing={commit}
        style={{
          fontSize: small ? 30 : 40,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
          textAlign: "center",
          color: c.ink,
          minHeight: small ? 56 : 72,
        }}
      />
    </View>
  );
}
// Pinned action bar for full screens. A screen renders <StickyBar> anywhere;
// the content is shown by <StickyBarHost> (AppShell, between the scrolling
// area and the bottom tab bar), so it never scrolls away with a long list.
let stickyNode: React.ReactNode = null;
const stickyListeners = new Set<() => void>();
function setStickyNode(node: React.ReactNode) {
  stickyNode = node;
  stickyListeners.forEach((l) => l());
}
export function StickyBar({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setStickyNode(children);
  });
  useEffect(() => () => setStickyNode(null), []);
  return null;
}
export function StickyBarHost() {
  const node = useSyncExternalStore(
    (l) => {
      stickyListeners.add(l);
      return () => void stickyListeners.delete(l);
    },
    () => stickyNode,
    () => null,
  );
  if (!node) return null;
  return (
    <View
      style={{
        gap: 10,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: c.paper,
        borderTopWidth: 1,
        borderTopColor: c.line,
        boxShadow: "0 -4px 12px rgba(23, 32, 44, 0.06)",
      }}
    >
      {node}
    </View>
  );
}
export function Checkbox({
  checked,
  onChange,
  label,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? c.primary : c.muted,
          backgroundColor: checked ? c.primary : c.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Icon name="checkmark" size={16} color={c.paper} />}
      </View>
      {children}
    </Tap>
  );
}
export function SelectAllRow({
  onAll,
  onClear,
}: {
  onAll: () => void;
  onClear: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 20 }}>
      {[
        [tr("Select all"), onAll],
        [tr("Clear"), onClear],
      ].map(([label, fn]) => (
        <Tap
          key={label as string}
          accessibilityRole="button"
          onPress={fn as () => void}
          style={{ minHeight: 36, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.primary }}>
            {label as string}
          </Text>
        </Tap>
      ))}
    </View>
  );
}
export function Sheet({
  title,
  children,
  onClose,
  info,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  info?: string;
  footer?: React.ReactNode;
}) {
  useTranslation();
  const [infoOpen, setInfoOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 768;
  // A Modal is its own window on Android, so it is not resized for the keyboard.
  // Lift the sheet by the keyboard's height so fields and buttons stay visible.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboard(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboard(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      animationType={reduceMotion ? "none" : desktop ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          direction: currentLanguage().rtl ? "rtl" : "ltr",
          backgroundColor: `${c.navy}80`,
          justifyContent: desktop ? "center" : "flex-end",
          alignItems: "center",
          padding: desktop ? 24 : 0,
          paddingBottom: desktop ? 24 : keyboard,
        }}
      >
        <View
          style={{
            backgroundColor: c.paper,
            width: "100%",
            maxWidth: 580,
            maxHeight: desktop ? "85%" : "94%",
            borderRadius: desktop ? 16 : 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            overflow: "hidden",
          }}
        >
          {!desktop && (
            <View
              style={{
                alignSelf: "center",
                width: 36,
                height: 4,
                borderRadius: 5,
                backgroundColor: c.line,
                marginTop: 11,
              }}
            />
          )}
          <View
            style={[
              styles.between,
              { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 },
            ]}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={[styles.heading, { fontSize: 23, flexShrink: 1 }]}>
                {title}
              </Text>
              {!!info && (
                <InfoIcon
                  open={infoOpen}
                  onPress={() => setInfoOpen(!infoOpen)}
                />
              )}
            </View>
            <IconButton name="close" label={tr("Close")} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 22,
              paddingTop: 8,
              gap: 20,
              paddingBottom: footer ? 16 : Math.max(24, insets.bottom + 16),
            }}
          >
            {infoOpen && !!info && <Text style={styles.muted}>{info}</Text>}
            {children}
          </ScrollView>
          {!!footer && (
            <View
              style={{
                flexShrink: 0,
                gap: 10,
                paddingHorizontal: 22,
                paddingTop: 12,
                paddingBottom: Math.max(16, insets.bottom + 8),
                backgroundColor: c.paper,
                borderTopWidth: 1,
                borderTopColor: c.line,
                boxShadow: "0 -4px 12px rgba(23, 32, 44, 0.06)",
              }}
            >
              {footer}
            </View>
          )}
          <PortalHost name="sheet-choices" />
        </View>
      </View>
    </Modal>
  );
}
export type Tools = {
  open: (f: import("./SimpleForms").FormSpec) => void;
  notify: (message: string) => void;
  go?: (
    view: string,
    selection?: {
      line?: string;
      captain?: string;
      employee?: string;
      period?: string;
      date?: string;
    },
  ) => void;
  /** A screen reports its live filters so Back can restore them. */
  track?: (selection: {
    line?: string;
    captain?: string;
    employee?: string;
    period?: string;
    date?: string;
  }) => void;
};
/** Long help text stays hidden behind a small info icon until tapped. */
export function InfoTip({
  text,
  label = tr("Info"),
}: {
  text: string;
  label?: string;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("{{value0}}: {{value1}} help", {
          value0: label,
          value1: open ? tr("hide") : tr("show"),
        })}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          minHeight: 32,
        }}
      >
        <Icon name="information-circle-outline" size={18} color={c.primary} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: c.primary }}>
          {label}
        </Text>
      </Pressable>
      {open && <Text style={styles.muted}>{text}</Text>}
    </View>
  );
}
/** Small info button. Tapping it shows or hides the help text. */
export function InfoIcon({
  open,
  onPress,
}: {
  open: boolean;
  onPress: () => void;
}) {
  useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr("How it works")}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: open ? c.soft : "transparent",
      }}
    >
      <Icon name="information-circle-outline" size={20} color={c.primary} />
    </Pressable>
  );
}
/** A title with its info icon on the same row. */
export function TitleRow({
  title,
  info,
  size = 16,
}: {
  title: string;
  info?: string;
  size?: number;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text
          style={{
            fontSize: size,
            fontWeight: "700",
            color: c.ink,
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
        {!!info && <InfoIcon open={open} onPress={() => setOpen(!open)} />}
      </View>
      {open && !!info && <Text style={styles.muted}>{info}</Text>}
    </View>
  );
}
