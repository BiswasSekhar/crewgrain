import { useTranslation } from "react-i18next";
import { tr, errorText } from "../lib/i18n";
import { Text, TextInput } from "./Typography";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Redirect, router } from "expo-router";
import { Input } from "../../components/ui/input";
import { appVersion } from "../lib/app-info";
import { useDailyStore } from "../lib/daily-store";
import { setupTokenFromLink } from "../lib/setup-link";
import { configured } from "../lib/supabase";
import type { Role } from "../domain/types";
import { Brand, BrandMark } from "./Brand";
import { LanguagePicker } from "./LanguagePicker";
import {
  ActionButton,
  Card,
  Icon,
  IconButton,
  MenuRow,
  Pill,
  Sheet,
  TextButton,
  c,
} from "./kit";
export function LoginScreen() {
  useTranslation();
  const s = useDailyStore(),
    { width } = useWindowDimensions(),
    wide = width >= 980;
  const [admin, setAdmin] = useState(false),
    [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  const [working, setWorking] = useState(false),
    [demoPicker, setDemoPicker] = useState(false);
  const [languagePicker, setLanguagePicker] = useState(false);
  const [emailError, setEmailError] = useState(""),
    [passwordError, setPasswordError] = useState("");
  const [setupOpen, setSetupOpen] = useState(false),
    [setupText, setSetupText] = useState(""),
    [setupError, setSetupError] = useState("");
  const passwordField = useRef<React.ComponentRef<typeof TextInput>>(null);
  const busy = working || s.busy || s.loading;
  const home = (role: Role) =>
    role === "admin" ? "overview" : role === "captain" ? "approvals" : "today";
  function openWorkspace(role: Role) {
    router.replace({ pathname: "/", params: { view: home(role) } });
  }
  function switchMode() {
    if (busy) return;
    setAdmin(!admin);
    setError("");
    s.clearError();
    setPassword("");
    setVisible(false);
    setEmailError("");
    setPasswordError("");
  }
  async function signIn() {
    if (busy) return;
    setError("");
    s.clearError();
    if (admin) {
      const emailProblem = !email.trim()
        ? tr("Enter your email.")
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
          ? tr("Enter a valid email.")
          : "";
      const passwordProblem = password ? "" : tr("Enter your password.");
      setEmailError(emailProblem);
      setPasswordError(passwordProblem);
      if (emailProblem || passwordProblem) return;
      if (!configured) {
        setError("Use Try demo to preview admin.");
        return;
      }
    } else if (!identifier.trim()) {
      setError("Enter your ID or phone number.");
      return;
    }
    setWorking(true);
    try {
      if (admin) {
        await s.login(email.trim(), password);
        setPassword("");
        openWorkspace("admin");
      } else {
        const role = await s.staffLogin(identifier);
        openWorkspace(role);
      }
    } catch (cause) {
      setError((cause as Error).message || "Could not log in. Try again.");
    } finally {
      setWorking(false);
    }
  }
  async function linkWithPaste() {
    if (busy) return;
    setSetupError("");
    let token: string;
    try {
      token = setupTokenFromLink(setupText);
    } catch (cause) {
      setSetupError((cause as Error).message);
      return;
    }
    setWorking(true);
    try {
      await s.linkPhone(token);
      setSetupText("");
      setSetupOpen(false);
    } catch (cause) {
      setSetupError(
        (cause as Error).message || "Could not link this phone. Try again.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function preview(role: Role) {
    if (busy) return;
    setWorking(true);
    setError("");
    try {
      await s.enterDemo(role);
      setDemoPicker(false);
      openWorkspace(role);
    } catch (cause) {
      setError((cause as Error).message);
      setDemoPicker(false);
    } finally {
      setWorking(false);
    }
  }
  if (!s.loading && !s.demo && s.actor)
    return (
      <Redirect
        href={{ pathname: "/", params: { view: home(s.actor.role) } }}
      />
    );
  if (!configured && !s.demo)
    return (
      <SafeAreaView style={login.root}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 12,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: c.ink,
              textAlign: "center",
            }}
          >
            {tr("This app is not connected yet")}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: c.muted,
              textAlign: "center",
              maxWidth: 360,
            }}
          >
            {tr(
              "This build has no factory backend set up. Ask the administrator for the correct build.",
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={login.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={login.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={login.layout}>
          {wide && (
            <View style={login.brandPanel}>
              <Brand light size={44} />
              <View style={login.brandArt}>
                <BrandMark size={240} color="white" />
              </View>
              <Text style={login.panelCaption}>{tr("Production Tracker")}</Text>
            </View>
          )}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[login.scroll, { padding: wide ? 48 : 20 }]}
          >
            <View style={login.form}>
              <View style={login.top}>
                {!wide ? <Brand size={40} subtitle={false} /> : <View />}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <IconButton
                    name="ellipsis-horizontal"
                    label={tr("Language")}
                    onPress={() => setLanguagePicker(true)}
                  />
                </View>
              </View>
              <Card style={login.card}>
                <View style={login.heading}>
                  <View style={login.roleIcon}>
                    <Icon
                      name={
                        admin ? "shield-checkmark-outline" : "people-outline"
                      }
                      color={c.primary}
                      size={24}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text accessibilityRole="header" style={login.title}>
                      {admin ? tr("Admin login") : tr("Login")}
                    </Text>
                    <Text style={login.role}>
                      {admin
                        ? tr("Email & password")
                        : tr("Employee \u00B7 Captain")}
                    </Text>
                  </View>
                </View>
                {admin ? (
                  <>
                    <View style={login.field}>
                      <Text style={login.label}>{tr("Email")}</Text>
                      <Input
                        accessibilityLabel={tr("Admin email")}
                        value={email}
                        onChangeText={(value) => {
                          setEmail(value);
                          setEmailError("");
                          setError("");
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="username"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordField.current?.focus()}
                        editable={!busy}
                        placeholder={"name@company.com"}
                        className="h-14 rounded-xl bg-white px-4"
                        style={login.input}
                      />
                      {!!emailError && (
                        <Text accessibilityRole="alert" style={login.error}>
                          {errorText(emailError)}
                        </Text>
                      )}
                    </View>
                    <View style={login.field}>
                      <Text style={login.label}>{tr("Password")}</Text>
                      <View style={login.password}>
                        <Input
                          ref={passwordField}
                          accessibilityLabel={tr("Admin password")}
                          value={password}
                          onChangeText={(value) => {
                            setPassword(value);
                            setPasswordError("");
                            setError("");
                          }}
                          secureTextEntry={!visible}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="current-password"
                          textContentType="password"
                          returnKeyType="go"
                          onSubmitEditing={() => void signIn()}
                          editable={!busy}
                          className="h-14 flex-1 border-0 bg-transparent px-4 shadow-none"
                          style={login.input}
                        />
                        <IconButton
                          name={visible ? "eye-off-outline" : "eye-outline"}
                          label={
                            visible ? tr("Hide password") : tr("Show password")
                          }
                          onPress={() => setVisible(!visible)}
                        />
                      </View>
                      {!!passwordError && (
                        <Text accessibilityRole="alert" style={login.error}>
                          {errorText(passwordError)}
                        </Text>
                      )}
                    </View>
                  </>
                ) : (
                  <View style={login.field}>
                    <Text style={login.label}>{tr("ID or phone number")}</Text>
                    <Input
                      accessibilityLabel={tr("ID or phone number")}
                      value={identifier}
                      onChangeText={(value) => {
                        setIdentifier(value);
                        setError("");
                        s.clearError();
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      returnKeyType="go"
                      onSubmitEditing={() => void signIn()}
                      editable={!busy}
                      maxLength={40}
                      placeholder={
                        s.demo
                          ? tr("e.g. ZV-041")
                          : tr("Enter ID or phone number")
                      }
                      className="h-14 rounded-xl bg-white px-4"
                      style={login.input}
                    />
                  </View>
                )}
                {!!(error || s.error) && (
                  <Text accessibilityRole="alert" style={login.error}>
                    {error || s.error}
                  </Text>
                )}
                <ActionButton
                  label={working ? tr("Logging in\u2026") : tr("Login")}
                  disabled={busy}
                  onPress={() => void signIn()}
                />
              </Card>
              <TextButton
                label={admin ? tr("Staff login") : tr("Admin login")}
                onPress={switchMode}
              />
              {!admin && (
                <>
                  <TextButton
                    label={tr("I have a setup link")}
                    onPress={() => {
                      setSetupOpen(!setupOpen);
                      setSetupError("");
                    }}
                  />
                  {setupOpen && (
                    <Card style={login.setup}>
                      <Input
                        accessibilityLabel={tr("Paste the setup link")}
                        value={setupText}
                        onChangeText={(value) => {
                          setSetupText(value);
                          setSetupError("");
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!busy}
                        placeholder={tr("Paste the setup link")}
                        className="h-14 rounded-xl bg-white px-4"
                        style={login.input}
                      />
                      {!!setupError && (
                        <Text accessibilityRole="alert" style={login.error}>
                          {errorText(setupError)}
                        </Text>
                      )}
                      <ActionButton
                        label={working ? tr("Linking…") : tr("Link this phone")}
                        disabled={busy}
                        onPress={() => void linkWithPaste()}
                      />
                    </Card>
                  )}
                </>
              )}
              <View style={login.footer}>
                {s.demo ? (
                  <TextButton
                    label={tr("Try demo")}
                    onPress={() => setDemoPicker(true)}
                  />
                ) : (
                  <View />
                )}
                <View
                  style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
                >
                  {s.demo && <Pill label={tr("Demo")} tone="info" />}
                  <Text style={login.version}>Crewgrain {appVersion}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {demoPicker && (
        <Sheet
          title={tr("Try Crewgrain")}
          onClose={() => {
            if (!busy) setDemoPicker(false);
          }}
        >
          {(
            [
              { role: "worker", label: tr("Employee"), icon: "shirt-outline" },
              { role: "captain", label: tr("Captain"), icon: "people-outline" },
              {
                role: "admin",
                label: tr("Admin"),
                icon: "shield-checkmark-outline",
              },
            ] as const
          ).map((item) => (
            <MenuRow
              key={item.role}
              title={item.label}
              icon={item.icon}
              onPress={() => void preview(item.role)}
            />
          ))}
        </Sheet>
      )}
      {languagePicker && (
        <LanguagePicker onClose={() => setLanguagePicker(false)} />
      )}
    </SafeAreaView>
  );
}
const login = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.canvas },
  layout: { flex: 1, flexDirection: "row" },
  brandPanel: {
    width: "42%",
    backgroundColor: c.primary,
    padding: 48,
    justifyContent: "space-between",
  },
  brandArt: { alignItems: "center", justifyContent: "center", flex: 1 },
  panelCaption: { color: "#CFDEFF", fontSize: 18 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  form: { width: "100%", maxWidth: 420, gap: 12 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  card: {
    padding: 20,
    gap: 20,
    borderColor: c.infoBorder,
    borderTopWidth: 4,
    borderTopColor: c.primary,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.infoLight,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: c.ink,
  },
  role: { fontSize: 13, color: c.muted },
  setup: { padding: 16, gap: 12, borderColor: c.infoBorder },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: "600", color: c.ink },
  input: { fontSize: 16, color: c.ink },
  password: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    paddingRight: 6,
  },
  error: { fontSize: 14, lineHeight: 21, color: c.danger },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  version: { fontSize: 12, color: c.muted },
});
