import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { factoryDate } from "../src/domain/rules";

const db = new PGlite();
const id = (n: number) =>
  `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = factoryDate();
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
const act = (a: unknown) =>
  db.query("select public.app_action($1::jsonb)", [JSON.stringify(a)]);
const adjust = (a: unknown) =>
  db.query<{ admin_adjust_count: any }>(
    "select public.admin_adjust_count($1::jsonb)",
    [JSON.stringify(a)],
  );
const change = (n: number, extra = {}) => ({
  id: id(n),
  employeeId: id(3),
  assignmentId: id(10),
  operationId: id(7),
  lotId: id(8),
  workDate: today,
  delta: 1,
  capturedAt: new Date().toISOString(),
  ...extra,
});
const one = (c: unknown) =>
  db.query<{ change_daily_count: any }>(
    "select public.change_daily_count($1::jsonb)",
    [JSON.stringify(c)],
  );
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
    `insert into public.units(id,name,code) values('${id(4)}','Line 1','U01'),('${id(14)}','Line 2','U02');insert into public.lines(id,unit_id,name) values('${id(5)}','${id(4)}','Line 1'),('${id(15)}','${id(14)}','Line 2');`,
  );
  for (const [n, role] of [
    [1, "admin"],
    [2, "captain"],
    [3, "worker"],
    [20, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `HV-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,$4)",
      [id(n), id(4), id(5), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code,material) values('${id(6)}','Kurta','K','Cotton');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(7)}','${id(6)}','Sleeves',1,400);insert into public.operation_pricing(operation_id,seconds) values('${id(7)}',50);insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(8)}','${id(6)}','${id(4)}','${id(5)}','A',500);insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values('${id(10)}','${id(3)}','${id(7)}','${id(8)}','${id(4)}');`,
  );
}, 60000);
afterAll(() => db.close());

describe("count capture hardening", () => {
  it("clamps future, ancient and unparseable capturedAt to the server clock", async () => {
    const cases: [number, string][] = [
      [100, new Date(Date.now() + 3600e3).toISOString()],
      [101, new Date(Date.now() - 5 * 86400e3).toISOString()],
      [102, "not a time"],
      [103, "infinity"],
    ];
    for (const [n, capturedAt] of cases)
      await as(3, () => one(change(n, { capturedAt })));
    const rows = (
      await db.query<{ ok: boolean; clamped: boolean }>(
        "select e.captured_at between now()-interval '1 minute' and now()+interval '1 minute' ok,(c.server_context->>'capturedAtClamped')::boolean clamped from public.count_events e join public.count_event_context c on c.event_id=e.id where e.id = any($1::uuid[])",
        [cases.map(([n]) => id(n))],
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.ok && r.clamped)).toBe(true);
  });
  it("keeps an honest recent timestamp and slightly skewed clocks", async () => {
    const at = new Date(Date.now() - 90e3).toISOString();
    await as(3, () => one(change(110, { capturedAt: at })));
    const row = (
      await db.query<{ same: boolean }>(
        "select abs(extract(epoch from e.captured_at-$2::timestamptz))<1 same from public.count_events e where id=$1",
        [id(110), at],
      )
    ).rows[0];
    expect(row.same).toBe(true);
  });
  it("a malformed optional UUID no longer fails the change or the batch", async () => {
    const capture = {
      source: "add",
      sessionId: "s",
      timing: "between_additions",
      previousEventId: "-".repeat(36),
      intervalMs: 1000,
    };
    const bad = change(120, { capture });
    const next = change(121, {
      capture: { ...capture, previousEventId: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz" },
    });
    const result = (await as(3, () =>
      db.query<{ r: any[] }>(
        "select public.change_daily_counts($1::jsonb) r",
        [JSON.stringify([bad, next])],
      ),
    )) as { rows: { r: any[] }[] };
    expect(result.rows[0].r).toHaveLength(2);
    expect(result.rows[0].r.every((x) => !x.error)).toBe(true);
    const ctx = (
      await db.query<{ timing: string; previous_event_id: string | null }>(
        "select timing,previous_event_id from public.count_event_context where event_id=$1",
        [id(120)],
      )
    ).rows[0];
    expect(ctx.previous_event_id).toBeNull();
  });
  it("is idempotent for retries and blocks implausible tap rates", async () => {
    await as(3, () => one(change(130)));
    const again = await as(3, () => one(change(130)));
    expect(
      (again as { rows: any[] }).rows[0].change_daily_count.duplicate,
    ).toBe(true);
    const events = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.count_events where id=$1",
        [id(130)],
      )
    ).rows[0].n;
    expect(events).toBe(1);
    // A fresh minute of capture time that already holds the limit.
    const stamp = new Date(Date.now() - 600e3);
    await db.query(
      `insert into public.count_events(id,assignment_id,employee_id,unit_id,work_date,delta,before_quantity,after_quantity,captured_at)
       select gen_random_uuid(),$1,$2,$3,$4,1,0,0,$5::timestamptz+(g||' milliseconds')::interval from generate_series(1,300) g`,
      [id(10), id(3), id(4), today, stamp.toISOString()],
    );
    await as(3, async () => {
      await expect(
        one(change(131, { capturedAt: new Date(stamp.getTime() + 500).toISOString() })),
      ).rejects.toThrow(/Too many counts/);
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.count_events where id=$1",
          [id(131)],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("try_uuid returns null instead of raising", async () => {
    const r = (
      await db.query<{ a: string | null; b: string | null; c: string | null }>(
        "select private.try_uuid('"+"-".repeat(36)+"') a,private.try_uuid('x') b,private.try_uuid($1) c",
        [id(1)],
      )
    ).rows[0];
    expect(r).toEqual({ a: null, b: null, c: id(1) });
  });
});

describe("admin count correction", () => {
  const approve = async () => {
    // Clear the synthetic rate-test rows' effect: approve using the recorded count.
    const counts = (
      await db.query<{ quantity: number; version: number }>(
        "select quantity,version from public.daily_counts where assignment_id=$1 and work_date=$2",
        [id(10), today],
      )
    ).rows[0];
    await as(2, () =>
      act({
        type: "approve_day",
        employeeId: id(3),
        workDate: today,
        attendance: "present",
        tasks: [
          {
            assignmentId: id(10),
            quantity: counts.quantity,
            expectedVersion: counts.version,
            reason: "",
          },
        ],
      }),
    );
    return counts.quantity;
  };
  it("requires an approved day, a reason and admin access", async () => {
    await as(1, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 5, reason: "x" }),
      ).rejects.toThrow(/Approve the day first/);
    });
    const recorded = await approve();
    expect(recorded).toBeGreaterThan(0);
    await as(2, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 5, reason: "x" }),
      ).rejects.toThrow(/Admin access required/);
    });
    await as(3, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 5, reason: "x" }),
      ).rejects.toThrow(/Admin access required/);
    });
    await as(1, async () => {
      for (const bad of [
        { quantity: 5, reason: "  " },
        { quantity: -1, reason: "r" },
        { quantity: 20001, reason: "r" },
        { quantity: "abc", reason: "r" },
        { quantity: recorded, reason: "r" },
        { quantity: 5, reason: "r", assignmentId: "not-a-uuid" },
      ])
        await expect(
          adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, ...bad }),
        ).rejects.toThrow();
    });
  });
  it("writes an immutable audited adjustment that the snapshot and totals show", async () => {
    const recorded = (
      await db.query<{ q: number }>(
        "select quantity q from public.daily_counts where assignment_id=$1 and work_date=$2",
        [id(10), today],
      )
    ).rows[0].q;
    const result = (await as(1, () =>
      adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 7, reason: "Counter was tapped by mistake" }),
    )) as { rows: { admin_adjust_count: any }[] };
    const out = result.rows[0].admin_adjust_count;
    expect(out.finalQuantity).toBe(7);
    expect(out.quantityDelta).toBe(7 - recorded);
    expect(out.amountPaise).toBe((7 - recorded) * 400);
    // Immutable and audited.
    await expect(
      db.query("update public.wage_adjustments set quantity_delta=0"),
    ).rejects.toThrow(/immutable/);
    await expect(db.query("delete from public.day_checks")).rejects.toThrow();
    await expect(db.query("delete from public.count_events")).rejects.toThrow();
    const audit = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.audit_log where action='admin_adjust_count' and entity_id=$1 and new_record->>'reason'='Counter was tapped by mistake'",
        [out.id],
      )
    ).rows[0].n;
    expect(audit).toBe(1);
    // The worker's own count is untouched.
    expect(
      (
        await db.query<{ q: number }>(
          "select quantity q from public.daily_counts where assignment_id=$1 and work_date=$2",
          [id(10), today],
        )
      ).rows[0].q,
    ).toBe(recorded);
    const snap = (await as(1, () =>
      db.query<{ s: any }>("select public.get_app_snapshot() s"),
    )) as { rows: { s: any }[] };
    const adj = snap.rows[0].s.adjustments.find((a: any) => a.id === out.id || a.requestId === out.requestId);
    expect(adj).toBeTruthy();
    expect(adj.quantityDelta).toBe(7 - recorded);
    // Second correction builds on the first and cannot repeat a no-op.
    await as(1, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 7, reason: "again" }),
      ).rejects.toThrow(/already matches/);
      const second = (await adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 9, reason: "recount" })).rows[0].admin_adjust_count;
      expect(second.quantityDelta).toBe(2);
    });
  });
  it("rejects another employee's task and a task from a different line", async () => {
    await db.query(
      "insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values($1,$2,$3,$4,$5)",
      [id(30), id(20), id(7), id(8), id(4)],
    );
    await as(1, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(30), workDate: today, quantity: 1, reason: "r" }),
      ).rejects.toThrow(/not found for this employee/);
    });
    // Same employee, assignment moved to another unit than the approved day.
    await db.query("update public.assignments set unit_id=$1 where id=$2", [id(14), id(10)]);
    await as(1, async () => {
      await expect(
        adjust({ employeeId: id(3), assignmentId: id(10), workDate: today, quantity: 1, reason: "r" }),
      ).rejects.toThrow(/different line/);
    });
    await db.query("update public.assignments set unit_id=$1 where id=$2", [id(4), id(10)]);
  });
  it("accepting an employee correction goes through the task lock once and cannot be repeated", async () => {
    const total = async () =>
      (
        await db.query<{ n: number }>(
          "select coalesce(sum(quantity_delta),0)::int n from public.wage_adjustments where assignment_id=$1 and work_date=$2",
          [id(10), today],
        )
      ).rows[0].n;
    const before = await total();
    await as(3, () =>
      act({
        type: "request_correction",
        assignmentId: id(10),
        workDate: today,
        quantity: 40,
        reason: "Counted again at the table",
      }),
    );
    const request = (
      await db.query<{ id: string }>(
        "select id from public.correction_requests where status='pending' and assignment_id=$1",
        [id(10)],
      )
    ).rows[0];
    await as(2, async () => {
      await expect(
        act({ type: "review_correction", id: request.id, decision: "accepted", note: "" }),
      ).rejects.toThrow(/Admin access required/);
    });
    await as(1, async () => {
      await act({ type: "review_correction", id: request.id, decision: "accepted", note: "" });
      await expect(
        act({ type: "review_correction", id: request.id, decision: "accepted", note: "" }),
      ).rejects.toThrow(/already been reviewed/);
    });
    const finalTotal = (
      await db.query<{ q: number }>(
        "select (t->>'finalQuantity')::int q from public.day_checks d, jsonb_array_elements(d.tasks) t where d.employee_id=$1 and d.work_date=$2 and t->>'assignmentId'=$3",
        [id(3), today, id(10)],
      )
    ).rows[0].q;
    expect(finalTotal + (await total())).toBe(40);
    expect((await total()) - before).not.toBe(0);
  });
});

describe("staff sign-in abuse limits", () => {
  const hash = (n: number) => n.toString(16).padStart(64, "0");
  it("keeps only the five newest active phones and one audit row per hour", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++)
      ids.push(
        (
          await db.query<{ staff_sign_in: string }>(
            "select public.staff_sign_in('hv-20',$1)",
            [hash(i)],
          )
        ).rows[0].staff_sign_in,
      );
    const active = (
      await db.query<{ id: string }>(
        "select id from public.linked_phones where profile_id=$1 and revoked_at is null",
        [id(20)],
      )
    ).rows.map((r) => r.id);
    expect(active).toHaveLength(5);
    expect(active).not.toContain(ids[0]);
    expect(active).toContain(ids[7]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.audit_log where actor_id=$1 and action='staff_signed_in'",
          [id(20)],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("purges stale throttle rows when a new login is reserved", async () => {
    const stale = "STAFF-" + "a".repeat(64);
    const fresh = "STAFF-" + "b".repeat(64);
    await db.query(
      "insert into public.login_attempts(employee_id,attempts,window_start) values($1,3,now()-interval '2 days')",
      [stale],
    );
    await db.query("select public.reserve_staff_login($1)", [fresh]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.login_attempts where employee_id=$1",
          [stale],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

describe("history retention", () => {
  it("prunes only old context and throttle rows, never count events", async () => {
    const before = (
      await db.query<{ n: number }>("select count(*)::int n from public.count_events")
    ).rows[0].n;
    await db.query(
      `insert into public.count_event_context(event_id,source,timing,server_context,received_at)
       select id,'legacy','unknown','{}',now()-interval '200 days' from public.count_events e
       where not exists(select 1 from public.count_event_context c where c.event_id=e.id) limit 5`,
    );
    await db.query(
      "update public.count_event_context set received_at=received_at where false",
    );
    // Context rows are immutable for everyone else.
    await expect(
      db.query("delete from public.count_event_context"),
    ).rejects.toThrow(/immutable/);
    await db.query(
      "insert into public.login_attempts(employee_id,attempts,window_start) values('STAFF-'||repeat('c',64),1,now()-interval '3 days')",
    );
    const result = (
      await db.query<{ r: any }>("select private.prune_history(90) r")
    ).rows[0].r;
    expect(result.countContextDeleted).toBeGreaterThanOrEqual(5);
    expect(result.loginAttemptsDeleted).toBeGreaterThanOrEqual(1);
    expect(
      (
        await db.query<{ n: number }>("select count(*)::int n from public.count_events")
      ).rows[0].n,
    ).toBe(before);
    await expect(db.query("select private.prune_history(5)")).rejects.toThrow(/30 days/);
    // After pruning the table is immutable again.
    await expect(
      db.query("delete from public.count_event_context"),
    ).rejects.toThrow(/immutable/);
  });
  it("is not callable by app roles", async () => {
    await as(1, async () => {
      await expect(db.query("select private.prune_history(90)")).rejects.toThrow();
    });
    await db.exec("set role anon");
    await expect(db.query("select public.admin_adjust_count('{}')")).rejects.toThrow();
    await db.exec("reset role");
  });
});
