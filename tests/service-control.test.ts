import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { factoryDate } from "../src/domain/rules";

const db = new PGlite();
const id = (n: number) =>
  `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = factoryDate();
const hash = "c".repeat(64);
const PAUSED = "Payment pending. Contact the vendor.";
async function as(n: number, fn: () => Promise<unknown>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
async function withRole<T>(role: string, fn: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const setState = (state: string, message = "") =>
  db.query("select private.set_service_state($1,$2) r", [state, message]);
const snapshot = (n: number) =>
  as(
    n,
    async () =>
      (await db.query<{ s: any }>("select public.get_app_snapshot() s")).rows[0]
        .s,
  ) as Promise<any>;
const tap = (n: number) =>
  db.query<{ r: any }>("select public.change_daily_count($1::jsonb) r", [
    JSON.stringify({
      id: id(n),
      employeeId: id(3),
      assignmentId: id(10),
      operationId: id(7),
      lotId: id(8),
      workDate: today,
      delta: 1,
      capturedAt: new Date().toISOString(),
    }),
  ]);
const phone = () =>
  withRole("service_role", () =>
    db.query("select public.phone_request($1,'snapshot','{}'::jsonb) r", [
      hash,
    ]),
  );
const counts = async () =>
  (
    await db.query<{ n: number }>(
      "select coalesce(sum(quantity),0)::int n from public.daily_counts",
    )
  ).rows[0].n;

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  await db.exec(
    `insert into public.units(id,name,code) values('${id(4)}','Line 1','U01');insert into public.lines(id,unit_id,name) values('${id(5)}','${id(4)}','Line 1');`,
  );
  for (const [n, role] of [
    [1, "admin"],
    [2, "captain"],
    [3, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `SC-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,$4)",
      [id(n), id(4), id(5), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code,material) values('${id(6)}','Kurta','K','Cotton');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(7)}','${id(6)}','Sleeves',1,400);insert into public.operation_pricing(operation_id,seconds) values('${id(7)}',50);insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(8)}','${id(6)}','${id(4)}','${id(5)}','A',500);insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values('${id(10)}','${id(3)}','${id(7)}','${id(8)}','${id(4)}');`,
  );
  await db.query(
    "insert into public.linked_phones(profile_id,token_hash) values($1,$2)",
    [id(3), hash],
  );
}, 60000);
afterAll(() => db.close());

describe("vendor service control", () => {
  it("is active by default and everything works", async () => {
    expect(
      (await db.query<{ g: any }>("select public.service_gate() g")).rows[0].g,
    ).toEqual({ state: "active", message: "" });
    const s = await snapshot(1);
    expect(s.service).toBeUndefined();
    await as(3, () => tap(200));
    expect(await counts()).toBe(1);
    await phone();
  });

  it("refuses every kind of caller with SERVICE_PAUSED when suspended", async () => {
    await setState("suspended", `  ${PAUSED}  `);
    const expected = new RegExp(`^SERVICE_PAUSED\\|${PAUSED}$`);
    await expect(snapshot(1)).rejects.toThrow(expected);
    await expect(snapshot(2)).rejects.toThrow(expected);
    await expect(as(3, () => tap(201))).rejects.toThrow(expected);
    await expect(
      as(2, () => db.query("select public.get_daily_snapshot()")),
    ).rejects.toThrow(expected);
    await expect(
      as(1, () =>
        db.query("select public.app_action($1::jsonb)", [
          JSON.stringify({
            type: "review_correction",
            id: id(99),
            decision: "accepted",
            note: "",
          }),
        ]),
      ),
    ).rejects.toThrow(expected);
    await expect(phone()).rejects.toThrow(expected);
    await expect(
      withRole("service_role", () =>
        db.query("select public.staff_sign_in('sc-3',$1)", [hash]),
      ),
    ).rejects.toThrow(expected);
    await expect(
      as(3, () => db.query("select public.touch_presence()")),
    ).rejects.toThrow(expected);
    try {
      await snapshot(1);
    } catch (e: any) {
      expect(e.code).toBe("P0001");
    }
  });

  it("keeps the gate readable by anon, authenticated and service_role", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        (
          await withRole(role, () =>
            db.query<{ g: any }>("select public.service_gate() g"),
          )
        ).rows[0].g,
      ).toEqual({ state: "suspended", message: PAUSED });
  });

  it("returns no push recipients while suspended", async () => {
    const run = (sql: string, params: unknown[]) =>
      withRole(
        "service_role",
        async () =>
          Object.values((await db.query<any>(sql, params)).rows[0])[0],
      );
    expect(
      await run("select public.push_recipients('request_submitted',$1,null)", [
        id(2),
      ]),
    ).toEqual([]);
    expect(
      await run("select public.scheduled_push_recipients('morning_plan')", []),
    ).toEqual([]);
    await db.query("select private.run_scheduled_push('morning_plan')");
  });

  it("does not touch stored data and lets the vendor's service role read it", async () => {
    expect(await counts()).toBe(1);
    expect(
      (
        await withRole("service_role", () =>
          db.query<{ n: number }>(
            "select count(*)::int n from public.profiles",
          ),
        )
      ).rows[0].n,
    ).toBe(3);
  });

  it("resumes with everything intact", async () => {
    await setState("active");
    expect(await counts()).toBe(1);
    expect((await snapshot(1)).service).toBeUndefined();
    await as(3, () => tap(202));
    expect(await counts()).toBe(2);
    await phone();
  });

  it("warning keeps everything working and adds a notice to every snapshot", async () => {
    await setState("warning", "Renewal due on 30 Nov.");
    const notice = { state: "warning", message: "Renewal due on 30 Nov." };
    expect((await snapshot(1)).service).toEqual(notice);
    expect((await snapshot(3)).service).toEqual(notice);
    await as(3, () => tap(203));
    expect(await counts()).toBe(3);
    await phone();
    await setState("active");
  });

  it("cannot be changed by authenticated, anon or service_role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await expect(
        withRole(role, () =>
          db.query("select private.set_service_state('active','')"),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withRole(role, () =>
          db.query("update public.service_status set state='active'"),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withRole(role, () =>
          db.query(
            "insert into public.service_status_log(state) values('active')",
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
    await expect(
      withRole("authenticated", () =>
        db.query("select state from public.service_status"),
      ),
    ).rejects.toThrow(/permission denied/i);
    // service_role may only read.
    await withRole("service_role", () =>
      db.query("select state from public.service_status"),
    );
    await withRole("service_role", () =>
      db.query("select count(*) from public.service_status_log"),
    );
    // An admin cannot un-pause either.
    await setState("suspended", "x");
    await expect(
      as(1, () => db.query("select private.set_service_state('active','')")),
    ).rejects.toThrow();
    await setState("active");
  });

  it("rejects an invalid state or an over-long message and keeps the old state", async () => {
    await expect(setState("paused")).rejects.toThrow(/State must be/);
    await expect(setState("active", "x".repeat(301))).rejects.toThrow(
      /300 characters/,
    );
    await setState("warning", "y".repeat(300));
    await setState("active");
    expect(
      (await db.query<{ g: any }>("select public.service_gate() g")).rows[0].g,
    ).toEqual({ state: "active", message: "" });
  });

  it("logs every change in order", async () => {
    const rows = (
      await db.query<{ state: string; message: string }>(
        "select state,message from public.service_status_log order by changed_at,state",
      )
    ).rows;
    const states = rows.map((r) => r.state);
    expect(states.filter((s) => s === "suspended").length).toBe(2);
    expect(states.filter((s) => s === "warning").length).toBe(2);
    expect(
      rows.some((r) => r.state === "suspended" && r.message === PAUSED),
    ).toBe(true);
    expect(
      rows.some((r) => r.state === "warning" && r.message === "y".repeat(300)),
    ).toBe(true);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.service_status",
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
