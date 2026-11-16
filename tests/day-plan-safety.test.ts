import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { factoryDate } from "../src/domain/rules";

const db = new PGlite();
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = factoryDate();
const UNIT = id(4);
async function as<T>(n: number, fn: () => Promise<T>) {
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
const plan = (n: number, styles: number[], unit = UNIT, workDate = today) =>
  as(n, () =>
    db.query("select public.set_day_plan($1::jsonb)", [
      JSON.stringify({
        unitId: unit,
        workDate,
        items: styles.map((s) => ({ styleId: id(s) })),
      }),
    ]),
  );
// style s has one operation, id s+1
const assign = (style: number, worker = 3) =>
  as(2, () =>
    db.query("select public.app_action($1::jsonb)", [
      JSON.stringify({
        type: "assign_operations",
        employeeId: id(worker),
        styleId: id(style),
        operationIds: [id(style + 1)],
        workDate: today,
        saveDefaults: false,
      }),
    ]),
  );
const assignmentId = async (style: number, worker = 3, active = true) =>
  (
    await db.query<{ id: string }>(
      "select id from public.assignments where employee_id=$1 and operation_id=$2 and work_date=$3 and active=$4",
      [id(worker), id(style + 1), today, active],
    )
  ).rows[0]?.id;
let tap = 1000;
async function tapCount(style: number, delta = 1, worker = 3) {
  const a = await assignmentId(style, worker);
  const lot = (
    await db.query<{ lot_id: string }>(
      "select lot_id from public.assignments where id=$1",
      [a],
    )
  ).rows[0].lot_id;
  return as(worker, () =>
    db.query("select public.change_daily_count($1::jsonb)", [
      JSON.stringify({
        id: id(tap++),
        employeeId: id(worker),
        assignmentId: a,
        operationId: id(style + 1),
        lotId: lot,
        workDate: today,
        delta,
        capturedAt: new Date().toISOString(),
      }),
    ]),
  );
}
const n = async (sql: string) =>
  Number((await db.query<{ c: number }>(sql)).rows[0].c);
const total = async () => ({
  plan: await n("select count(*) c from public.day_plan"),
  assignments: await n("select count(*) c from public.assignments"),
  active: await n("select count(*) c from public.assignments where active"),
  counts: await n(
    "select coalesce(sum(quantity),0) c from public.daily_counts",
  ),
  history: await n("select count(*) c from public.day_plan_history"),
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
    `insert into public.units(id,name,code) values('${id(4)}','Line 1','U01'),('${id(14)}','Line 2','U02');insert into public.lines(id,unit_id,name) values('${id(5)}','${id(4)}','Line 1'),('${id(15)}','${id(14)}','Line 2');`,
  );
  for (const [p, role, unit, line] of [
    [1, "admin", 4, 5],
    [2, "captain", 4, 5],
    [3, "worker", 4, 5],
    [20, "worker", 4, 5],
    [30, "captain", 14, 15],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(p)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(p), `DP-${p}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,$4)",
      [id(p), id(unit), id(line), role],
    );
  }
  for (let s = 100; s <= 200; s += 10)
    await db.exec(
      `insert into public.styles(id,name,code,material) values('${id(s)}','Style ${s}','S${s}','Cotton');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(s + 1)}','${id(s)}','Op ${s}',1,400);insert into public.operation_pricing(operation_id,seconds) values('${id(s + 1)}',50);`,
    );
}, 60000);
afterAll(() => db.close());
// Each test starts from an empty plan for the day (fixture reset, bypasses the guard).
beforeEach(async () => {
  await db.exec("delete from public.day_plan");
});

describe("safe style removal from a day plan", () => {
  it("removing an unused style archives the plan row, deactivates that day's assignments and deletes nothing", async () => {
    await plan(2, [100, 110]);
    await assign(100);
    await assign(110);
    const before = await total();
    await plan(2, [110]);
    const after = await total();
    expect(after.plan).toBe(before.plan - 1);
    expect(after.history).toBe(before.history + 1);
    expect(after.assignments).toBe(before.assignments);
    expect(after.active).toBe(before.active - 1);
    expect(await assignmentId(100)).toBeUndefined();
    expect(await assignmentId(100, 3, false)).toBeDefined();
    expect(await assignmentId(110)).toBeDefined();
    const h = (
      await db.query<{ style_id: string; removed_by: string }>(
        "select style_id,removed_by from public.day_plan_history where style_id=$1",
        [id(100)],
      )
    ).rows;
    expect(h).toEqual([{ style_id: id(100), removed_by: id(2) }]);
    expect(
      await n(
        "select count(*) c from public.audit_log where action='remove_style_from_day'",
      ),
    ).toBe(1);
  });

  it("a style with only a zero count is removable and keeps its count rows", async () => {
    await plan(2, [120]);
    await assign(120);
    await tapCount(120, 1);
    await tapCount(120, -1);
    const before = await total();
    await plan(2, []);
    const after = await total();
    expect(after.counts).toBe(before.counts);
    expect(after.history).toBe(before.history + 1);
    expect(
      await n("select count(*) c from public.daily_counts where quantity=0"),
    ).toBeGreaterThan(0);
    expect(await assignmentId(120)).toBeUndefined();
  });

  it("refuses to remove a style with recorded counts and changes nothing", async () => {
    await plan(2, [130]);
    await assign(130);
    await tapCount(130);
    const before = await total();
    await expect(plan(2, [])).rejects.toThrow(
      "Work is already recorded for this style today, so it cannot be removed.",
    );
    expect(await total()).toEqual(before);
    expect(await assignmentId(130)).toBeDefined();
    await plan(2, [130]);
  });

  it("refuses to remove a style that is part of an approved day", async () => {
    await plan(2, [140]);
    await assign(140, 20);
    const a = await assignmentId(140, 20);
    await db.query(
      "insert into public.day_checks(employee_id,unit_id,work_date,captain_id,attendance,status,tasks) values($1,$2,$3,$4,'absent','approved',$5::jsonb)",
      [
        id(20),
        UNIT,
        today,
        id(2),
        JSON.stringify([
          {
            assignmentId: a,
            enteredQuantity: 0,
            captainQuantity: 0,
            finalQuantity: 0,
            ratePaise: 400,
            reason: "",
          },
        ]),
      ],
    );
    const before = await total();
    await expect(plan(2, [])).rejects.toThrow(
      "This style is already part of an approved day, so it cannot be removed.",
    );
    expect(await total()).toEqual(before);
  });

  it("is all or nothing when two styles are removed and one is blocked", async () => {
    await plan(2, [150, 160]);
    await assign(150);
    await assign(160);
    await tapCount(160);
    const before = await total();
    await expect(plan(2, [])).rejects.toThrow("already recorded");
    expect(await total()).toEqual(before);
    expect(await assignmentId(150)).toBeDefined();
    expect(
      await n(
        `select count(*) c from public.day_plan where style_id in ('${id(150)}','${id(160)}')`,
      ),
    ).toBe(2);
  });

  it("allows re-adding a removed style and assigning it afresh", async () => {
    await plan(2, [170]);
    await assign(170);
    const old = await assignmentId(170);
    await plan(2, []);
    expect(await assignmentId(170)).toBeUndefined();
    await plan(2, [170]);
    await assign(170);
    const fresh = await assignmentId(170);
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(old);
    await tapCount(170);
    expect(
      await n(
        `select quantity c from public.daily_counts where assignment_id='${fresh}'`,
      ),
    ).toBe(1);
  });

  it("a removed style rejects a late phone tap and leaves standing assignments alone", async () => {
    await plan(2, [180]);
    await assign(180);
    const a = await assignmentId(180);
    const lot = (
      await db.query<{ lot_id: string }>(
        "select lot_id from public.assignments where id=$1",
        [a],
      )
    ).rows[0].lot_id;
    await db.query(
      "insert into public.assignments(employee_id,operation_id,lot_id,unit_id,work_date) values($1,$2,$3,$4,null)",
      [id(20), id(181), lot, UNIT],
    );
    await plan(2, []);
    await expect(
      as(3, () =>
        db.query("select public.change_daily_count($1::jsonb)", [
          JSON.stringify({
            id: id(tap++),
            employeeId: id(3),
            assignmentId: a,
            operationId: id(181),
            lotId: lot,
            workDate: today,
            delta: 1,
            capturedAt: new Date().toISOString(),
          }),
        ]),
      ),
    ).rejects.toThrow("Task is not assigned to this employee");
    expect(
      await n(
        `select count(*) c from public.assignments where employee_id='${id(20)}' and operation_id='${id(181)}' and work_date is null and active`,
      ),
    ).toBe(1);
  });

  it("denies a captain of another line, allows an admin, rejects an invalid date", async () => {
    await plan(2, [190]);
    await expect(plan(30, [], UNIT)).rejects.toThrow("Unit access denied");
    expect(
      await n(
        `select count(*) c from public.day_plan where style_id='${id(190)}'`,
      ),
    ).toBe(1);
    await plan(1, []);
    expect(
      await n(
        `select count(*) c from public.day_plan_history where style_id='${id(190)}'`,
      ),
    ).toBe(1);
    await expect(plan(2, [], UNIT, "2020-01-01")).rejects.toThrow(
      "Choose a day from yesterday to next week",
    );
  });

  it("keeps the history table unreadable for signed-in users", async () => {
    for (const who of [1, 2, 3])
      await expect(
        as(who, () => db.query("select * from public.day_plan_history")),
      ).rejects.toThrow(/permission denied/);
  });
});
