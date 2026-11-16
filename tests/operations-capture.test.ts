import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { factoryDate } from "../src/domain/rules";
const db = new PGlite();
const id = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
    [20, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `ZV-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,$4)",
      [id(n), id(4), id(5), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code,material) values('${id(6)}','Kurta','K','Cotton');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(7)}','${id(6)}','Sleeves',1,400),('${id(9)}','${id(6)}','Neck',2,250);insert into public.operation_pricing(operation_id,seconds) values('${id(7)}',50),('${id(9)}',29);insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(8)}','${id(6)}','${id(4)}','${id(5)}','A',500);insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values('${id(10)}','${id(3)}','${id(7)}','${id(8)}','${id(4)}');`,
  );
}, 60000);
afterAll(() => db.close());
describe("operations and capture database contracts", () => {
  it("assigns a dated selection and saves defaults without changing quantities", async () => {
    await as(2, () =>
      act({
        type: "assign_operations",
        employeeId: id(3),
        styleId: id(6),
        operationIds: [id(7), id(9)],
        workDate: today,
        saveDefaults: true,
      }),
    );
    expect(
      (await db.query("select * from public.operation_defaults")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.assignments")).rows,
    ).toHaveLength(2);
    await as(3, async () =>
      expect(
        act({
          type: "assign_operations",
          employeeId: id(3),
          styleId: id(6),
          operationIds: [id(9)],
          workDate: today,
          saveDefaults: false,
        }),
      ).rejects.toThrow(),
    );
  });
  it("preserves OP groups and blocks employee edits to the catalog", async () => {
    await as(1, () =>
      act({
        type: "save_operation_details",
        id: id(7),
        code: "OP1",
        steps: ["Sleeve hem", "Front panel hem"],
      }),
    );
    expect(
      (
        await db.query<{ code: string; steps: string[] }>(
          "select code,steps from public.operations where id=$1",
          [id(7)],
        )
      ).rows[0],
    ).toEqual({ code: "OP1", steps: ["Sleeve hem", "Front panel hem"] });
    await as(2, async () =>
      expect(
        act({ type: "save_material", styleId: id(6), material: "Silk" }),
      ).rejects.toThrow(),
    );
  });
  it("chooses a free OP code when a custom code occupies the next sequence", async () => {
    await as(1, () =>
      act({
        type: "save_operation_details",
        id: id(9),
        code: "OP3",
        steps: [],
      }),
    );
    await as(1, () =>
      db.query("select public.add_operations($1::jsonb)", [
        JSON.stringify({
          type: "add_operations",
          styleId: id(6),
          tasks: [{ name: "Bottom hem", seconds: 68 }],
        }),
      ]),
    );
    expect(
      (
        await db.query<{ code: string }>(
          "select code from public.operations where name='Bottom hem'",
        )
      ).rows[0].code,
    ).toBe("OP4");
  });
  it("captures every addition with immutable context and approximate intervals", async () => {
    const capture = {
      source: "add",
      sessionId: "session-a",
      timing: "first",
      context: { material: "Cotton", operationCode: "OP1" },
    };
    await as(3, () =>
      db.query("select public.change_daily_counts($1::jsonb)", [
        JSON.stringify([
          change(30, { capture }),
          change(31, {
            capture: {
              ...capture,
              timing: "between_additions",
              previousEventId: id(30),
              intervalMs: 47000,
            },
          }),
        ]),
      ]),
    );
    const metadata = (
      await db.query<{
        interval_ms: number;
        server_context: Record<string, unknown>;
      }>("select * from public.count_event_context where event_id=$1", [id(31)])
    ).rows[0];
    expect(metadata.interval_ms).toBe(47000);
    expect(metadata.server_context).toMatchObject({
      material: "Cotton",
      standardSeconds: 50,
      operationCode: "OP1",
      ratePaise: 400,
    });
    await as(3, () =>
      db.query("select public.change_daily_count($1::jsonb)", [
        JSON.stringify(
          change(31, {
            capture: { ...capture, context: { material: "Fake" } },
          }),
        ),
      ]),
    );
    expect(
      (
        await db.query<{ quantity: number }>(
          "select quantity from public.daily_counts where assignment_id=$1",
          [id(10)],
        )
      ).rows[0].quantity,
    ).toBe(2);
    expect(
      (
        await db.query<{ server_context: Record<string, unknown> }>(
          "select server_context from public.count_event_context where event_id=$1",
          [id(31)],
        )
      ).rows[0].server_context.material,
    ).toBe("Cotton");
    await expect(
      db.query("update public.count_event_context set timing='fake'"),
    ).rejects.toThrow("immutable");
    await as(2, async () =>
      expect(
        db.query("select * from public.count_event_context"),
      ).rejects.toThrow("permission denied"),
    );
  });
  it("stops a batch after a failed delta and preserves later events for retry", async () => {
    const result = await as(3, () =>
      db.query<{ change_daily_counts: { id: string; error?: string }[] }>(
        "select public.change_daily_counts($1::jsonb)",
        [JSON.stringify([change(32, { delta: -100 }), change(33)])],
      ),
    );
    expect(
      (result as { rows: { change_daily_counts: { error?: string }[] }[] })
        .rows[0].change_daily_counts,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from public.count_events where id=$1", [
          id(33),
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("applies a line’s defaults to another day without duplicating assignments", async () => {
    const yesterday = new Date(Date.parse(today + "T12:00:00Z") - 86400000)
      .toISOString()
      .slice(0, 10);
    await as(2, () =>
      db.query("select public.set_day_plan($1::jsonb)", [
        JSON.stringify({
          type: "set_day_plan",
          unitId: id(4),
          workDate: yesterday,
          items: [{ styleId: id(6) }],
        }),
      ]),
    );
    await as(2, () =>
      act({ type: "apply_line_defaults", unitId: id(4), workDate: yesterday }),
    );
    const before = (await db.query("select * from public.assignments")).rows
      .length;
    await as(2, () =>
      act({ type: "apply_line_defaults", unitId: id(4), workDate: yesterday }),
    );
    expect(
      (await db.query("select * from public.assignments")).rows,
    ).toHaveLength(before);
    expect(
      (
        await db.query("select * from public.assignments where work_date=$1", [
          yesterday,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("archives and restores an employee without removing history", async () => {
    await as(1, () =>
      act({
        type: "set_employee_active",
        id: id(3),
        active: false,
        reason: "Archived",
      }),
    );
    expect(
      (
        await db.query(
          "select * from public.daily_counts where employee_id=$1",
          [id(3)],
        )
      ).rows,
    ).toHaveLength(1);
    await as(1, () =>
      act({
        type: "set_employee_active",
        id: id(3),
        active: true,
        reason: "Restored",
      }),
    );
    expect(
      (
        await db.query<{ active: boolean }>(
          "select active from public.profiles where id=$1",
          [id(3)],
        )
      ).rows[0].active,
    ).toBe(true);
  });
  it("changes captain atomically and prevents a second captain", async () => {
    await as(1, async () =>
      expect(
        act({
          type: "manage_employee",
          id: id(20),
          unitId: id(4),
          role: "captain",
        }),
      ).rejects.toThrow(),
    );
    await as(1, () =>
      act({ type: "set_line_captain", unitId: id(4), employeeId: id(20) }),
    );
    expect(
      (
        await db.query<{ role: string }>(
          "select role from public.profiles where id=$1",
          [id(2)],
        )
      ).rows[0].role,
    ).toBe("worker");
    expect(
      (
        await db.query(
          "select * from public.unit_memberships where role='captain' and status='active'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("deletes access without deleting production or pay history", async () => {
    await as(1, async () =>
      expect(act({ type: "delete_employee", id: id(3) })).rejects.toThrow(
        "Approve pending counts",
      ),
    );
    await as(1, async () =>
      expect(
        act({
          type: "manage_employee",
          id: id(3),
          role: "captain",
          unitId: id(4),
        }),
      ).rejects.toThrow("Approve pending counts"),
    );
    const tasks = (
      await db.query<{
        assignmentId: string;
        quantity: number;
        expectedVersion: number;
        reason: string;
      }>(
        'select a.id as "assignmentId",coalesce(c.quantity,0) as quantity,coalesce(c.version,0) as "expectedVersion",\'\' as reason from public.assignments a left join public.daily_counts c on c.assignment_id=a.id and c.work_date=$1 where a.employee_id=$2 and a.active and (a.work_date is null or a.work_date=$1)',
        [today, id(3)],
      )
    ).rows;
    await as(20, () =>
      act({
        type: "approve_day",
        employeeId: id(3),
        workDate: today,
        attendance: "present",
        tasks,
      }),
    );
    await as(1, () => act({ type: "delete_employee", id: id(3) }));
    expect(
      (
        await db.query(
          "select * from public.daily_counts where employee_id=$1",
          [id(3)],
        )
      ).rows,
    ).toHaveLength(1);
    await as(3, async () =>
      expect(
        db.query("select public.change_daily_count($1::jsonb)", [
          JSON.stringify(change(34)),
        ]),
      ).rejects.toThrow(),
    );
    await as(1, async () =>
      expect(
        act({
          type: "set_employee_active",
          id: id(3),
          active: true,
          reason: "restore",
        }),
      ).rejects.toThrow(),
    );
    await as(1, async () =>
      expect(act({ type: "delete_employee", id: id(1) })).rejects.toThrow(),
    );
  });
});

describe("history growth controls", () => {
  beforeAll(async () => {
    await db.query("insert into auth.users values($1)", [id(60)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,'ZV-60','ZV-60','worker')",
      [id(60)],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,'worker')",
      [id(60), id(4), id(5)],
    );
    await db.query(
      "insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id,work_date,assigned_by,valid_from,valid_to) values($1,$2,$3,$4,$5,$6,$7,$6,$6)",
      [id(61), id(60), id(7), id(8), id(4), today, id(1)],
    );
  });
  it("keeps every tap in count history without copying it into the audit log", async () => {
    const before = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.audit_log where action='count_change'",
      )
    ).rows[0].n;
    await as(60, () =>
      db.query("select public.change_daily_counts($1::jsonb)", [
        JSON.stringify(
          [901, 902, 903].map((n) =>
            change(n, { employeeId: id(60), assignmentId: id(61) }),
          ),
        ),
      ]),
    );
    const events = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.count_events where id in ($1,$2,$3)",
        [id(901), id(902), id(903)],
      )
    ).rows[0].n;
    const after = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.audit_log where action='count_change'",
      )
    ).rows[0].n;
    expect(events).toBe(3);
    expect(after).toBe(before);
  });
  it("windows old dated rows but always keeps rows still waiting for review", async () => {
    const old = "2020-01-01";
    const rows = JSON.stringify([
      { id: "old", workDate: old },
      { id: "old-pending", workDate: old, status: "pending" },
      { id: "old-needs-admin", workDate: old, status: "needs_admin" },
      { id: "recent", workDate: today },
      { id: "undated" },
    ]);
    const kept = (
      await db.query<{ r: { id: string }[] }>(
        "select private.window_rows($1::jsonb,(now() at time zone 'Asia/Kolkata')::date-62) as r",
        [rows],
      )
    ).rows[0].r.map((x) => x.id);
    expect(kept).toEqual([
      "old-pending",
      "old-needs-admin",
      "recent",
      "undated",
    ]);
  });
  it("sends only recent counts in the snapshot", async () => {
    await db.query(
      "insert into public.daily_counts(assignment_id,employee_id,unit_id,work_date,quantity,rate_paise) values($1,$2,$3,'2020-01-01',5,100) on conflict do nothing",
      [id(10), id(3), id(4)],
    );
    const snapshot = (await as(1, () =>
      db.query<{ s: { counts: { workDate: string }[] } }>(
        "select public.get_app_snapshot() as s",
      ),
    )) as { rows: { s: { counts: { workDate: string }[] } }[] };
    const dates = snapshot.rows[0].s.counts.map((c) => c.workDate);
    expect(dates).not.toContain("2020-01-01");
    expect(dates).toContain(today);
  });
});
