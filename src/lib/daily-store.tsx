import { reconcileCountBatch, type CountReceipt } from "../domain/sync";
import {
  captureTiming,
  operationCode,
  type TimingAnchor,
} from "../domain/operations";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  Snapshot,
  Employee,
  Role,
  Action,
  OutboxRow,
  CounterChange,
  CountCapture,
} from "../domain/types";
import { makeDemo, demoAction } from "../domain/demo";
import {
  applyCounter,
  applyDailyAction,
  seedDaily,
  countFor,
  dayFor,
  operationsFor,
  DailyAction,
} from "../domain/daily";
import { scopeSnapshot, factoryDate, integer } from "../domain/rules";
import { ledger, type LedgerRow } from "../domain/workspace";
import { configured, demoAllowed, supabase } from "./supabase";
import { getPhone, savePhone, PhoneSession } from "./phone";
import { findStaff, staffIdentifier } from "./staff-access";
import { notifyEvent } from "./push";
import { reportFailure } from "./monitoring";
import { parsePause } from "./service-pause";
import { listOutbox, putOutbox, removeOutbox } from "./storage";
import {
  seedWorkspace,
  applyWorkspaceAction,
  WorkspaceAction,
} from "../domain/workspace";
const demoKey = "crewgrain-app-demo-v6";
let lastPresenceTouch = 0;
type Context = {
  data: Snapshot | null;
  actor: Employee | null;
  demo: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  outbox: OutboxRow[];
  syncing: boolean;
  online: boolean;
  /** Set while the service provider has paused the service. */
  paused: { message: string } | null;
  /** True when a staff phone is linked (its token is kept while paused). */
  phoneLinked: boolean;
  recheckService: () => Promise<void>;
  enterDemo: (role: Role) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  staffLogin: (identifier: string) => Promise<Role>;
  logout: () => Promise<void>;
  act: (a: Action) => Promise<void>;
  workspaceAct: (a: WorkspaceAction) => Promise<void>;
  dailyAct: (a: DailyAction) => Promise<void>;
  adminAdjustCount: (input: AdminCountFix) => Promise<void>;
  change: (
    assignmentId: string,
    delta: number,
    source?: CountCapture["source"],
  ) => Promise<void>;
  sync: () => Promise<void>;
  retryAttention: (id: string) => Promise<void>;
  discardAttention: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  resetDemo: () => Promise<void>;
  clearError: () => void;
  simulateOffline: (offline: boolean) => void;
  linkPhone: (token: string) => Promise<void>;
  issuePhone: (profileId: string) => Promise<string>;
};
/** Admin fix for the count of one approved task on one day. */
export type AdminCountFix = {
  employeeId: string;
  assignmentId: string;
  workDate: string;
  quantity: number;
  reason: string;
};
const Store = createContext<Context>(null!);
export function DailyProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <StateProvider>{children}</StateProvider>
    </QueryClientProvider>
  );
}
function StateProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false),
    [demo, setDemo] = useState(demoAllowed),
    [demoId, setDemoId] = useState("worker"),
    [adminId, setAdminId] = useState<string | null>(null),
    [phone, setPhone] = useState<PhoneSession | null>(null),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [offline, setOffline] = useState(false),
    [queue, setQueue] = useState<OutboxRow[]>([]),
    [paused, setPaused] = useState<{ message: string } | null>(null);
  const [demoData, setDemoData] = useState(() =>
    seedWorkspace(seedDaily(makeDemo())),
  );
  const [initialCaptureSession] = useState(() => Crypto.randomUUID());
  const full = useRef(demoData),
    lock = useRef(false),
    syncLock = useRef(false),
    captureChain = useRef<Promise<void>>(Promise.resolve()),
    captureAnchor = useRef<TimingAnchor | undefined>(undefined),
    captureSession = useRef(initialCaptureSession),
    order = useRef(0),
    acknowledged = useRef(new Set<string>()),
    setupLinks = useRef(new Set<string>()),
    queueRef = useRef<OutboxRow[]>([]),
    modeRef = useRef(demo),
    cacheWrittenAt = useRef(0),
    pausedRef = useRef(false);
  useEffect(() => {
    modeRef.current = demo;
  }, [demo]);
  const identity = demo ? demoId : (phone?.profileId ?? adminId);
  const mode = demo ? "demo" : phone ? "phone" : "admin";
  const queryKey = useMemo(() => ["daily", mode, identity], [mode, identity]);
  const readQueue = useCallback(async () => {
    const rows = (await listOutbox()).filter(
      (r) => !acknowledged.current.has(r.id),
    );
    queueRef.current = rows;
    setQueue(rows);
    return rows;
  }, []);
  // Records a service pause found in any error. Nothing is cleared or removed:
  // saved taps, the phone token and cached data all stay for after the resume.
  const notePause = useCallback((err: unknown) => {
    const found = parsePause(err);
    if (!found) return false;
    pausedRef.current = true;
    setPaused((current) =>
      current && current.message === found.message ? current : found,
    );
    return true;
  }, []);
  const rpcFailure = useCallback(
    (error: { message: string; code?: string }) => {
      notePause(error);
      // Keep the database error code so unexpected failures can be told apart
      // from ordinary rule messages when they are reported.
      return Object.assign(new Error(error.message), { code: error.code });
    },
    [notePause],
  );
  const invokeDevice = useCallback(
    async (
      body: Record<string, unknown>,
      session: PhoneSession | null = null,
    ) => {
      if (!supabase)
        throw new Error("Connect Supabase before linking a real phone.");
      const response = await supabase.functions.invoke("device-access", {
        body,
        headers: session ? { "x-device-token": session.token } : {},
      });
      let result = response.data;
      if (response.error) {
        const context = response.error.context as Response | undefined;
        if (context && typeof context.json === "function")
          result = await context.json().catch(() => null);
      }
      if (response.error || result?.error) {
        notePause(result?.error);
        throw Object.assign(
          new Error(result?.error ?? "Could not reach the workshop."),
          {
            code: result?.code ?? "",
            permanent: !!result?.code,
            denied: result?.code === "42501",
          },
        );
      }
      return result;
    },
    [notePause],
  );
  const gateway = useCallback(
    async (operation: string, payload: unknown = {}, session = phone) => {
      return (await invokeDevice({ operation, payload }, session))
        .data as unknown;
    },
    [invokeDevice, phone],
  );
  const query = useQuery({
    queryKey,
    enabled: ready && !!identity && !paused,
    queryFn: async () => {
      if (demo) return full.current;
      try {
        let snapshot: Snapshot;
        if (phone) snapshot = (await gateway("snapshot")) as Snapshot;
        else {
          const r = await supabase!.rpc("get_app_snapshot");
          if (r.error)
            throw Object.assign(new Error(r.error.message), {
              code: r.error.code,
            });
          snapshot = r.data as Snapshot;
          if (
            snapshot.employees.find((e) => e.id === snapshot.actorId)?.role !==
            "admin"
          ) {
            await supabase!.auth.signOut();
            setAdminId(null);
            throw new Error(
              "Only admins sign in with a password. Ask the admin to link this phone.",
            );
          }
        }
        if (!phone && Date.now() - lastPresenceTouch > 180000) {
          // Signed-in users record "last seen" (phones are recorded server-side).
          lastPresenceTouch = Date.now();
          void Promise.resolve(supabase!.rpc("touch_presence")).catch(
            () => undefined,
          );
        }
        if (phone && Date.now() - cacheWrittenAt.current > 60000) {
          cacheWrittenAt.current = Date.now();
          await AsyncStorage.setItem(
            `crewgrain-phone-cache-${phone.profileId}`,
            JSON.stringify(snapshot),
          );
        }
        setOnline(true);
        return snapshot;
      } catch (e) {
        if (notePause(e)) throw e;
        const code = (e as { code?: string }).code;
        // A stalled snapshot download is worth knowing about; plain offline is not.
        if (code === "TIMEOUT") reportFailure(e, "snapshot");
        if (phone && code === "42501") {
          await savePhone(null);
          await AsyncStorage.removeItem(`crewgrain-phone-cache-${phone.profileId}`);
          setPhone(null);
          throw e;
        }
        if (phone && !code) {
          const cached = await AsyncStorage.getItem(
            `crewgrain-phone-cache-${phone.profileId}`,
          );
          if (cached) {
            setOnline(false);
            return JSON.parse(cached) as Snapshot;
          }
        }
        throw e;
      }
    },
  });
  const source = query.data ?? (demo ? demoData : null);
  const actor =
    source?.employees.find(
      (e) => e.id === (demo ? demoId : source.actorId) && e.active,
    ) ?? null;
  const data = useMemo(
    () => (source && actor ? scopeSnapshot(source, actor) : null),
    [source, actor],
  );
  const saveDemo = useCallback(
    async (s: Snapshot) => {
      await AsyncStorage.setItem(demoKey, JSON.stringify(s));
      full.current = s;
      setDemoData(s);
      qc.setQueryData(queryKey, s);
    },
    [qc, queryKey],
  );
  const linkPhone = useCallback(
    async (setupToken: string) => {
      if (!supabase)
        throw new Error(
          "This is the sample workspace. Connect the backend to link real phones.",
        );
      if (
        phone &&
        queueRef.current.some((r) => r.employeeId === phone.profileId)
      )
        throw new Error(
          "This phone still has saved work that has not been sent. Connect to the internet and wait, then open the link again.",
        );
      setBusy(true);
      try {
        const result = await invokeDevice(
          { operation: "redeem", setupToken },
          null,
        );
        if (!result.deviceToken)
          throw new Error(
            "This setup link could not be used. Ask the admin for a new one.",
          );
        const provisional = { token: result.deviceToken, profileId: "" };
        const snapshot = (
          await invokeDevice(
            { operation: "snapshot", payload: {} },
            provisional,
          )
        ).data as Snapshot;
        const session = { ...provisional, profileId: snapshot.actorId! };
        await savePhone(session);
        await supabase.auth.signOut();
        qc.clear();
        setAdminId(null);
        setDemo(false);
        setPhone(session);
      } finally {
        setBusy(false);
      }
    },
    [invokeDevice, qc, phone],
  );
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(demoKey);
        if (saved) {
          full.current = JSON.parse(saved);
          setDemoData(full.current);
        }
        const role = await AsyncStorage.getItem("crewgrain-simple-role");
        if (role) setDemoId(role);
        await readQueue();
        if (supabase) {
          const [linked, session] = await Promise.all([
            getPhone(),
            supabase.auth.getSession(),
          ]);
          setPhone(linked);
          setAdminId(session.data.session?.user.id ?? null);
        }
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
        setReady(true);
      }
    })();
    const auth = supabase?.auth.onAuthStateChange((_e, session) => {
      if (!modeRef.current) setAdminId(session?.user.id ?? null);
    });
    return () => auth?.data.subscription.unsubscribe();
  }, [readQueue]);
  useEffect(() => {
    if (!ready) return;
    const handle = async (url: string | null) => {
      if (!url) return;
      const match = url.match(/[#&?]setup=([a-f0-9]{64})/i);
      if (!match) return;
      if (setupLinks.current.has(match[1])) return;
      setupLinks.current.add(match[1]);
      try {
        if (Platform.OS === "web")
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        await linkPhone(match[1]);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => void handle(url));
    return () => sub.remove();
  }, [ready, linkPhone]);
  const refresh = useCallback(async () => {
    if (!syncLock.current && !pausedRef.current)
      await qc.invalidateQueries({ queryKey: ["daily"] });
  }, [qc]);
  const sync = useCallback(async () => {
    if (
      !actor ||
      pausedRef.current ||
      syncLock.current ||
      lock.current ||
      (demo && offline) ||
      AppState.currentState !== "active"
    )
      return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const rows = (await listOutbox())
        .filter((r) => r.employeeId === actor.id && r.kind === "counter")
        .sort(
          (a, b) =>
            (a.localOrder ?? Date.parse(a.capturedAt) * 1000) -
            (b.localOrder ?? Date.parse(b.capturedAt) * 1000),
        );
      const batch: OutboxRow[] = [];
      for (const row of rows) {
        if (
          row.state !== "pending" ||
          row.nextAttemptAt > Date.now() ||
          batch.length >= 40
        )
          break;
        batch.push(row);
      }
      if (!batch.length) return;
      let responses: CountReceipt[] = [];
      let transportError: unknown;
      if (!demo) {
        const changes = batch.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          assignmentId: row.assignmentId!,
          operationId: row.operationId,
          lotId: row.lotId,
          workDate: row.workDate,
          delta: row.delta!,
          capturedAt: row.capturedAt,
          capture: row.capture,
        }));
        try {
          if (phone)
            responses = (await gateway(
              "count_batch",
              changes,
            )) as typeof responses;
          else {
            const result = await supabase!.rpc("change_daily_counts", {
              p_changes: changes,
            });
            if (result.error) throw result.error;
            responses = result.data as typeof responses;
          }
        } catch (error) {
          // A pause leaves the queue exactly as it is; it flushes after resume.
          if (notePause(error)) return;
          transportError = error;
        }
      }
      if (!demo && !transportError) {
        if (!Array.isArray(responses)) {
          transportError = new Error("Could not sync counts. Try again.");
          responses = [];
        }
        const current = qc.getQueryData<Snapshot>(queryKey);
        if (current) {
          const reconciled = reconcileCountBatch(current, batch, responses);
          for (const id of reconciled.acknowledged)
            acknowledged.current.add(id);
          queueRef.current = queueRef.current.filter(
            (row) => !reconciled.acknowledged.has(row.id),
          );
          qc.setQueryData(queryKey, reconciled.data);
          setQueue(queueRef.current);
        }
      }
      let failed = false;
      for (const row of batch) {
        try {
          const event: CounterChange = {
            id: row.id,
            employeeId: row.employeeId,
            assignmentId: row.assignmentId!,
            operationId: row.operationId,
            lotId: row.lotId,
            workDate: row.workDate,
            delta: row.delta!,
            capturedAt: row.capturedAt,
            capture: row.capture,
          };
          if (demo) await saveDemo(applyCounter(full.current, actor, event));
          else {
            if (transportError) throw transportError;
            const result = responses.find((result) => result.id === row.id);
            if (!result) throw new Error("Could not sync counts. Try again.");
            if (result.error)
              throw Object.assign(new Error(result.error), {
                permanent: !["40001", "40P01", "53300", "57014"].includes(
                  result.code || "",
                ),
                code: result.code,
              });
            if (!result.count || !acknowledged.current.has(row.id))
              throw new Error("Could not sync counts. Try again.");
          }
          acknowledged.current.add(row.id);
          queueRef.current = queueRef.current.filter((r) => r.id !== row.id);
          if (demo)
            setQueue((current) => current.filter((r) => r.id !== row.id));
          await removeOutbox(row.id);
          setOnline(true);
        } catch (e) {
          if (notePause(e)) break;
          failed = true;
          const permanent =
            demo || Boolean((e as { permanent?: boolean }).permanent);
          // A count the server refused is a lost entry, so always report it. A
          // count that keeps failing to send is reported once, on the 3rd try.
          if (!demo) {
            if (permanent) reportFailure(e, "count_rejected", true);
            else if (row.attempts === 2)
              reportFailure(e, "count_stalled", true);
          }
          await putOutbox({
            ...row,
            state: permanent ? "attention" : "pending",
            error: (e as Error).message,
            attempts: row.attempts + 1,
            nextAttemptAt:
              Date.now() +
              Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8)),
          });
          if (!permanent) setOnline(false);
          break;
        }
      }
      await readQueue();
      if (!demo && failed) await qc.invalidateQueries({ queryKey });
    } catch (e) {
      reportFailure(e, "count_sync");
      setError((e as Error).message);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [
    actor,
    demo,
    offline,
    gateway,
    notePause,
    phone,
    qc,
    queryKey,
    saveDemo,
    readQueue,
  ]);
  useEffect(() => {
    if (!actor || paused || syncing || AppState.currentState !== "active")
      return;
    const pending = queue
      .filter((r) => r.employeeId === actor.id)
      .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0));
    if (!pending.length || pending[0].state !== "pending") return;
    const due = pending[0].nextAttemptAt;
    const timer = setTimeout(
      () => void sync(),
      Math.max(
        1000,
        Math.min(4000, Date.parse(pending[0].capturedAt) + 15000 - Date.now()),
        due - Date.now(),
      ),
    );
    return () => clearTimeout(timer);
  }, [actor, paused, queue, sync, syncing]);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      captureAnchor.current = undefined;
      captureSession.current = Crypto.randomUUID();
      if (state === "active") {
        void sync();
        const updated = qc.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
        if (Date.now() - updated > 60000) void refresh();
      }
    });
    const connect = () => {
      setOnline(true);
      void sync();
    };
    const disconnect = () => setOnline(false);
    if (Platform.OS === "web") {
      window.addEventListener("online", connect);
      window.addEventListener("offline", disconnect);
    }
    return () => {
      app.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("online", connect);
        window.removeEventListener("offline", disconnect);
      }
    };
  }, [sync, refresh, qc, queryKey]);
  useEffect(() => {
    captureAnchor.current = undefined;
    captureSession.current = Crypto.randomUUID();
  }, [identity]);
  async function enterDemo(role: Role) {
    await captureChain.current.catch(() => {});
    if (syncLock.current || lock.current)
      throw new Error("Wait for the save to finish.");
    const id =
      role === "admin" ? "admin" : role === "captain" ? "captain" : "worker";
    await AsyncStorage.setItem("crewgrain-simple-role", id);
    setDemo(true);
    setDemoId(id);
    setError("");
    qc.removeQueries({ queryKey: ["daily", "demo", id] });
  }
  async function login(email: string, password: string) {
    if (!supabase)
      throw new Error("The sample workspace has no real admin account.");
    setBusy(true);
    try {
      const r = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (r.error) throw new Error("Check your admin email and password.");
      const snap = await supabase.rpc("get_app_snapshot");
      if (snap.error && notePause(snap.error)) {
        // Signed in at the sign-in service, but every data call is refused.
        // Keep the session so Check again works after the service resumes.
        setDemo(false);
        setPhone(null);
        setAdminId(r.data.user.id);
        throw new Error(snap.error.message);
      }
      const snapshot = snap.data as Snapshot | null;
      if (
        snap.error ||
        !snapshot ||
        snapshot.employees.find((e) => e.id === snapshot.actorId)?.role !==
          "admin"
      ) {
        await supabase.auth.signOut();
        throw new Error(
          "Admin access is required. Employee and captain phones are linked by the admin.",
        );
      }
      setDemo(false);
      setPhone(null);
      await savePhone(null);
      setAdminId(r.data.user.id);
    } finally {
      setBusy(false);
    }
  }
  async function staffLogin(value: string): Promise<Role> {
    if (syncLock.current || lock.current)
      throw new Error("Wait for the save to finish.");
    const identifier = staffIdentifier(value);
    if (!identifier || identifier.length > 40)
      throw new Error("Enter your ID or phone number.");
    setBusy(true);
    setError("");
    try {
      if (!configured) {
        const employee = findStaff(full.current.employees, identifier);
        await AsyncStorage.setItem("crewgrain-simple-role", employee.id);
        setDemo(true);
        setDemoId(employee.id);
        qc.removeQueries({ queryKey: ["daily", "demo", employee.id] });
        return employee.role;
      }
      const result = await invokeDevice({ operation: "sign-in", identifier });
      if (!result.deviceToken)
        throw new Error("Check your ID or phone number.");
      const provisional = { token: result.deviceToken, profileId: "" };
      const snapshot = (
        await invokeDevice({ operation: "snapshot" }, provisional)
      ).data as Snapshot;
      const employee = snapshot.employees.find(
        (e) => e.id === snapshot.actorId,
      );
      if (!employee || employee.role === "admin")
        throw new Error("Use admin login.");
      const session = { ...provisional, profileId: employee.id };
      await savePhone(session);
      await supabase!.auth.signOut();
      qc.clear();
      setAdminId(null);
      setDemo(false);
      setPhone(session);
      return employee.role;
    } finally {
      setBusy(false);
    }
  }
  async function recheckService() {
    let gate: { state?: string; message?: string } | null = null;
    try {
      if (!supabase) gate = { state: "active" };
      else if (phone) gate = await invokeDevice({ operation: "gate" }, null);
      else {
        const r = await supabase.rpc("service_gate");
        if (!r.error) gate = r.data as typeof gate;
      }
    } catch {
      gate = null;
    }
    if (!gate) return; // could not ask (offline): stay paused
    if (gate.state === "suspended") {
      setPaused({ message: String(gate.message ?? "").slice(0, 300) });
      return;
    }
    pausedRef.current = false;
    setPaused(null);
    await refresh();
  }
  async function logout() {
    await captureChain.current.catch(() => {});
    if (syncLock.current || lock.current)
      throw new Error("Wait for the save to finish.");
    if (
      !demo &&
      queueRef.current.some(
        (r) => r.employeeId === (actor?.id ?? phone?.profileId),
      )
    )
      throw new Error(
        "Saved work has not been sent yet. Connect to the internet and wait for it to send before logging out.",
      );
    if (!demo) await supabase?.auth.signOut();
    if (!demo) await savePhone(null);
    if (phone)
      await AsyncStorage.removeItem(`crewgrain-phone-cache-${phone.profileId}`);
    setPhone(null);
    setAdminId(null);
    setError("");
    pausedRef.current = false;
    setPaused(null);
    qc.clear();
  }
  // After a save the app reloads its data. Wait for that, but never longer than
  // a few seconds: the save is already done and the reload finishes on its own.
  const refreshSoon = () =>
    Promise.race([
      refresh(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  async function idle() {
    for (let i = 0; i < 30 && (lock.current || syncLock.current); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (lock.current || syncLock.current)
      throw new Error("Saving. Try again in a moment.");
  }
  async function act(a: Action) {
    if (!actor) throw new Error("Open your workspace first.");
    if (
      actor.role !== "admin" &&
      !(
        actor.role === "captain" &&
        ["request_employee", "submit_report"].includes(a.type)
      )
    )
      throw new Error("This action is not available for your role.");
    await idle();
    lock.current = true;
    setBusy(true);
    try {
      if (demo)
        await saveDemo(demoAction(full.current, actor, a, Crypto.randomUUID()));
      else {
        if (phone) await gateway("action", a);
        else {
          const r = await supabase!.rpc("app_action", { p_action: a });
          if (r.error) throw rpcFailure(r.error);
        }
        await refreshSoon();
        if (a.type === "request_employee")
          void notifyEvent("request_submitted");
        else if (a.type === "submit_report")
          void notifyEvent("report_submitted");
      }
    } catch (e) {
      reportFailure(e, a.type);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function dailyAct(a: DailyAction) {
    if (!actor) throw new Error("Open your workspace first.");
    await idle();
    lock.current = true;
    setBusy(true);
    try {
      if (demo)
        await saveDemo(
          applyDailyAction(full.current, actor, a, Crypto.randomUUID()),
        );
      else {
        if (phone) await gateway("action", a);
        else {
          const r = await supabase!.rpc("app_action", { p_action: a });
          if (r.error) throw rpcFailure(r.error);
        }
        await refreshSoon();
        if (a.type === "approve_day") {
          void notifyEvent("day_approved", { employeeId: a.employeeId });
          // Admins hear about captain checks only; the server re-verifies it.
          if (actor.role === "captain") {
            void notifyEvent("admin_day_checked");
            void notifyEvent("line_check_complete");
          }
          if (a.tasks.some((task) => task.reason?.trim()))
            void notifyEvent("count_change_pending");
        }
      }
    } catch (e) {
      reportFailure(e, a.type);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function adminAdjustCount(input: AdminCountFix) {
    if (!actor || actor.role !== "admin")
      throw new Error("Only an admin can correct an approved count.");
    if (demo)
      throw new Error("Count corrections are not available in sample mode.");
    if (phone) throw new Error("Sign in as admin to correct a count.");
    await idle();
    lock.current = true;
    setBusy(true);
    try {
      const r = await supabase!.rpc("admin_adjust_count", {
        p_action: input,
      });
      if (r.error) throw rpcFailure(r.error);
      await refreshSoon();
    } catch (e) {
      reportFailure(e, "admin_adjust_count");
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const directRpc: string[] = [
    "save_style",
    "add_operations",
    "set_rate_settings",
    "set_style_pricing",
    "set_task_pricing",
    "set_day_plan",
  ];
  const unitTypes: string[] = [
    "add_line",
    "rename_line",
    "remove_line",
    "rename_unit",
  ];
  async function workspaceAct(a: WorkspaceAction) {
    if (!actor) throw new Error("Open your workspace first.");
    await idle();
    lock.current = true;
    setBusy(true);
    try {
      if (demo)
        await saveDemo(
          applyWorkspaceAction(full.current, actor, a, Crypto.randomUUID()),
        );
      else {
        if (phone) await gateway("action", a);
        else {
          const r = await supabase!.rpc(
            directRpc.includes(a.type)
              ? a.type
              : unitTypes.includes(a.type)
                ? "unit_action"
                : "app_action",
            { p_action: a },
          );
          if (r.error) throw rpcFailure(r.error);
        }
        await refreshSoon();
      }
    } catch (e) {
      reportFailure(e, a.type);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function change(
    assignmentId: string,
    delta: number,
    source: CountCapture["source"] = delta > 0 ? "add" : "subtract",
  ): Promise<void> {
    const wall = Date.now(),
      monotonic = performance.now(),
      capturedAt = new Date(wall).toISOString();
    const task = captureChain.current
      .catch(() => {})
      .then(async () => {
        if (!actor || actor.role !== "worker" || !data)
          throw new Error("This phone is not linked to an employee.");
        const date = factoryDate(),
          assignment = operationsFor(data, actor.id, date).find(
            (a) => a.id === assignmentId,
          );
        if (!assignment || dayFor(data, actor.id, date))
          throw new Error("This task is locked. Ask your captain.");
        integer(delta, -20000, 20000, "Change");
        if (!delta) return;
        {
          const latest = demo
            ? full.current
            : (qc.getQueryData<Snapshot>(queryKey) ?? data);
          const local =
            (countFor(latest, assignmentId, date)?.quantity ?? 0) +
            queueRef.current
              .filter(
                (r) =>
                  r.employeeId === actor.id &&
                  r.assignmentId === assignmentId &&
                  r.workDate === date,
              )
              .reduce((n, r) => n + (r.delta ?? 0), 0);
          integer(local + delta, 0, 20000, "Count");
          order.current = Math.max(Date.now() * 1000, order.current + 1);
          const id = Crypto.randomUUID();
          const operation = data.operations.find(
            (o) => o.id === assignment.operationId,
          );
          const lot = data.lots.find((l) => l.id === assignment.lotId);
          const style = data.styles.find((st) => st.id === operation?.styleId);
          if (!operation || !lot || !style)
            throw new Error(
              "This task is no longer available. Ask your captain.",
            );
          const capture: CountCapture = {
            source,
            sessionId: captureSession.current,
            ...captureTiming(
              captureAnchor.current,
              assignmentId,
              source,
              monotonic,
              wall,
            ),
            context: {
              lineId: actor.unitId,
              styleId: style.id,
              styleCode: style.code,
              material:
                assignment.material || lot.material || style.material || "",
              operationCode: operationCode(operation),
              operationName: operation.name,
              standardSeconds: operation.seconds,
            },
          };
          const row: OutboxRow = {
            id,
            kind: "counter",
            employeeId: actor.id,
            assignmentId,
            operationId: assignment.operationId,
            lotId: assignment.lotId,
            quantity: Math.abs(delta),
            delta,
            workDate: date,
            capturedAt,
            capture,
            localOrder: order.current,
            state: "pending",
            attempts: 0,
            nextAttemptAt: 0,
          };
          await putOutbox(row);
          queueRef.current = [...queueRef.current, row];
          setQueue(queueRef.current);
          captureAnchor.current =
            source === "add"
              ? { id, assignmentId, monotonic, wall }
              : undefined;
        }
      });
    captureChain.current = task;
    return task;
  }
  async function retryAttention(id: string) {
    const row = (await listOutbox()).find((r) => r.id === id);
    if (!row || row.employeeId !== actor?.id) return;
    await putOutbox({
      ...row,
      state: "pending",
      error: "",
      attempts: 0,
      nextAttemptAt: 0,
    });
    await readQueue();
    await sync();
  }
  async function discardAttention(id: string) {
    const row = (await listOutbox()).find((r) => r.id === id);
    if (!row || row.employeeId !== actor?.id) return;
    await removeOutbox(id);
    await readQueue();
    if (!demo) await qc.invalidateQueries({ queryKey });
  }
  async function retry() {
    for (const row of await listOutbox())
      if (row.employeeId === actor?.id && row.state === "pending")
        await putOutbox({ ...row, nextAttemptAt: 0 });
    await sync();
  }
  async function issuePhone(profileId: string) {
    if (demo)
      throw new Error(
        "Real phone links need the Supabase project. The sample roles can be opened from the preview menu.",
      );
    const result = await invokeDevice({ operation: "issue", profileId }, null);
    const origin =
      Platform.OS === "web"
        ? window.location.origin
        : process.env.EXPO_PUBLIC_WEB_ORIGIN;
    // No web build: fall back to the app's own link (scheme in app.json).
    if (!origin) return `crewgrain://link?setup=${result.setupToken}`;
    return `${origin}/#setup=${result.setupToken}`;
  }
  const latest = useRef({
    enterDemo,
    login,
    staffLogin,
    logout,
    act,
    dailyAct,
    adminAdjustCount,
    workspaceAct,
    change,
    sync: retry,
    retryAttention,
    discardAttention,
    refresh,
    resetDemo: async () => {
      await saveDemo(seedWorkspace(seedDaily(makeDemo())));
    },
    linkPhone,
    issuePhone,
    recheckService,
  });
  useEffect(() => {
    latest.current = {
      enterDemo,
      login,
      staffLogin,
      logout,
      act,
      dailyAct,
      adminAdjustCount,
      workspaceAct,
      change,
      sync: retry,
      retryAttention,
      discardAttention,
      refresh,
      resetDemo: async () => {
        await saveDemo(seedWorkspace(seedDaily(makeDemo())));
      },
      linkPhone,
      issuePhone,
      recheckService,
    };
  });
  const fns = useMemo(
    () => ({
      enterDemo: (role: Role) => latest.current.enterDemo(role),
      login: (email: string, password: string) =>
        latest.current.login(email, password),
      staffLogin: (id: string) => latest.current.staffLogin(id),
      logout: () => latest.current.logout(),
      act: (a: Action) => latest.current.act(a),
      dailyAct: (a: DailyAction) => latest.current.dailyAct(a),
      adminAdjustCount: (input: AdminCountFix) =>
        latest.current.adminAdjustCount(input),
      workspaceAct: (a: WorkspaceAction) => latest.current.workspaceAct(a),
      change: (
        assignmentId: string,
        delta: number,
        source?: CountCapture["source"],
      ) => latest.current.change(assignmentId, delta, source),
      sync: () => latest.current.sync(),
      retryAttention: (id: string) => latest.current.retryAttention(id),
      discardAttention: (id: string) => latest.current.discardAttention(id),
      refresh: () => latest.current.refresh(),
      resetDemo: () => latest.current.resetDemo(),
      clearError: () => setError(""),
      simulateOffline: setOffline,
      linkPhone: (token: string) => latest.current.linkPhone(token),
      issuePhone: (id: string) => latest.current.issuePhone(id),
      recheckService: () => latest.current.recheckService(),
    }),
    [],
  );
  const actorId = actor?.id;
  const outbox = useMemo(
    () => queue.filter((r) => r.employeeId === actorId),
    [queue, actorId],
  );
  const loading = !ready || (!!identity && query.isLoading);
  const errorText = error || (query.error?.message ?? "");
  const value = useMemo<Context>(
    () => ({
      ...fns,
      data,
      actor,
      demo,
      loading,
      busy,
      error: errorText,
      outbox,
      syncing,
      online: demo ? !offline : online,
      paused,
      phoneLinked: !!phone,
    }),
    [
      fns,
      data,
      actor,
      demo,
      loading,
      busy,
      errorText,
      outbox,
      syncing,
      offline,
      online,
      paused,
      phone,
    ],
  );
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
const ledgerCache = new WeakMap<Snapshot, LedgerRow[]>();
/** Memoised ledger(): one computation per snapshot object, shared by all screens. */
export function cachedLedger(d: Snapshot): LedgerRow[] {
  let rows = ledgerCache.get(d);
  if (!rows) {
    rows = ledger(d);
    ledgerCache.set(d, rows);
  }
  return rows;
}
export const useDailyStore = () => useContext(Store);
