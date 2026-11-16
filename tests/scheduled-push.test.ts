import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { factoryDate } from "../src/domain/rules";

const db = new PGlite();
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tok = (s: string) => `ExponentPushToken[${s}]`;
const today = factoryDate();

// 1 admin+token, 2 admin no token, 3 captain U1, 4 captain U2 (has plan),
// 5 captain U3 (no token), 6 captain U4, 7..10 workers.
const people: [number, string, string][] = [
  [1, "admin", "A1"],
  [2, "admin", "A2"],
  [3, "captain", "C1"],
  [4, "captain", "C2"],
  [5, "captain", "C3"],
  [6, "captain", "C4"],
  [7, "worker", "W1"],
  [8, "worker", "W2"],
  [9, "worker", "W3"],
  [10, "worker", "W4"],
];
const unitOf: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4 };
const workerUnit: Record<number, number> = { 7: 1, 8: 1, 9: 2, 10: 4 };

async function sched(kind: string, now = new Date()) {
  const r = await db.query<{ r: string[] }>(
    "select public.scheduled_push_recipients($1,$2) r",
    [kind, now.toISOString()],
  );
  return r.rows[0].r;
}
async function recipients(event: string, caller: number) {
  const r = await db.query<{ r: string[] }>(
    "select public.push_recipients($1,$2) r",
    [event, id(caller)],
  );
  return r.rows[0].r;
}
const check = (worker: number, captain: number) =>
  db.query(
    "insert into public.day_checks(employee_id,unit_id,work_date,captain_id,attendance,status,tasks) values($1,$2,$3,$4,'present','approved','[{}]'::jsonb)",
    [id(worker), id(100 + workerUnit[worker]), today, id(captain)],
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
  for (const [n, role, code] of people) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), code, role],
    );
  }
  for (const u of [1, 2, 3, 4]) {
    await db.query("insert into public.units(id,name,code) values($1,$2,$3)", [
      id(100 + u),
      `Line ${u}`,
      `U0${u}`,
    ]);
    await db.query(
      "insert into public.lines(id,unit_id,name) values($1,$2,$3)",
      [id(110 + u), id(100 + u), `Line ${u}`],
    );
  }
  for (const [p, u] of Object.entries(unitOf))
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,'captain')",
      [id(Number(p)), id(100 + u)],
    );
  for (const [p, u] of Object.entries(workerUnit))
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,'worker')",
      [id(Number(p)), id(100 + u)],
    );
  await db.query(
    "insert into public.styles(id,name,code,material) values($1,'Kurta','K','Cotton')",
    [id(120)],
  );
  await db.query(
    "insert into public.operations(id,style_id,name,sequence,rate_paise) values($1,$2,'Sleeves',1,400)",
    [id(121), id(120)],
  );
  await db.query(
    "insert into public.day_plan(unit_id,work_date,style_id,position) values($1,$2,$3,0)",
    [id(102), today, id(120)],
  );
  // Counts above zero for W1, W2 (line 1), W3 (line 2), W4 (line 4).
  for (const w of [7, 8, 9, 10]) {
    const u = workerUnit[w];
    await db.query(
      "insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values($1,$2,$3,$4,$5,500)",
      [id(130 + w), id(120), id(100 + u), id(110 + u), `L${w}`],
    );
    await db.query(
      "insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values($1,$2,$3,$4,$5)",
      [id(140 + w), id(w), id(121), id(130 + w), id(100 + u)],
    );
    await db.query(
      "insert into public.daily_counts(assignment_id,employee_id,unit_id,work_date,quantity,rate_paise) values($1,$2,$3,$4,5,400)",
      [id(140 + w), id(w), id(100 + u), today],
    );
  }
  // Tokens: admin 1, captains 3,4,6 (not 5), one worker.
  for (const [n, t] of [
    [1, "admin1"],
    [3, "cap1"],
    [4, "cap2"],
    [6, "cap4"],
    [7, "work1"],
  ] as const)
    await db.query(
      "insert into public.push_tokens(profile_id,token) values($1,$2)",
      [id(n), tok(t)],
    );
}, 60000);
afterAll(() => db.close());

describe("scheduled push reminders", () => {
  it("is closed to anon and signed-in users", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.query("select public.scheduled_push_recipients('morning_plan')"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select private.run_scheduled_push('morning_plan')"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select * from public.push_config"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select * from public.push_reminder_log"),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    }
  });
  it("does nothing when the cron settings are missing", async () => {
    // No net extension in PGlite: it must return before reaching net.http_post.
    await db.query("select private.run_scheduled_push('morning_plan')");
  });
  it("rejects unknown kinds", async () => {
    expect(await sched("nope")).toEqual([]);
  });

  it("morning: captains with a token and no day plan only", async () => {
    // C1 (line 1): no plan -> yes. C2 (line 2): has plan -> no.
    // C3 (line 3): no plan but no token -> no. C4 (line 4): no plan -> yes.
    const got = await sched("morning_plan");
    expect(got.sort()).toEqual([tok("cap1"), tok("cap4")].sort());
  });
  it("morning: a second run for the same date sends nobody", async () => {
    expect(await sched("morning_plan")).toEqual([]);
  });

  it("evening: captains with counted, unchecked workers only", async () => {
    // W3 (line 2) and W4 (line 4) are checked, so C2 and C4 are skipped.
    await check(9, 4);
    await check(10, 6);
    expect(await sched("evening_check")).toEqual([tok("cap1")]);
  });
  it("evening: dedupes and the kinds do not share a log", async () => {
    expect(await sched("evening_check")).toEqual([]);
    const rows = await db.query<{ c: string }>(
      "select count(*) c from public.push_reminder_log where work_date=$1",
      [today],
    );
    expect(Number(rows.rows[0].c)).toBe(3);
  });
  it("prunes log rows older than 30 days", async () => {
    await db.query(
      "insert into public.push_reminder_log(kind,work_date,profile_id) values('morning_plan',$1,$2)",
      [new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10), id(3)],
    );
    await sched("morning_plan");
    const old = await db.query<{ c: string }>(
      "select count(*) c from public.push_reminder_log where work_date<$1",
      [new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10)],
    );
    expect(Number(old.rows[0].c)).toBe(0);
  });
});

describe("admin events from captain checks", () => {
  it("sends nothing before any check exists", async () => {
    expect(await recipients("admin_day_checked", 3)).toEqual([]);
    expect(await recipients("line_check_complete", 3)).toEqual([]);
  });
  it("tells admins with tokens when a captain checks a day", async () => {
    await check(7, 3);
    expect(await recipients("admin_day_checked", 3)).toEqual([tok("admin1")]);
  });
  it("ignores admins and workers as the actor", async () => {
    expect(await recipients("admin_day_checked", 1)).toEqual([]);
    expect(await recipients("admin_day_checked", 7)).toEqual([]);
    expect(await recipients("line_check_complete", 1)).toEqual([]);
  });
  it("does not fire line complete while a worker is unchecked", async () => {
    expect(await recipients("line_check_complete", 3)).toEqual([]);
  });
  it("fires line complete once when the last worker is checked", async () => {
    await check(8, 3);
    expect(await recipients("line_check_complete", 3)).toEqual([tok("admin1")]);
    expect(await recipients("line_check_complete", 3)).toEqual([]);
  });
  it("keeps the existing employee notice", async () => {
    const r = await db.query<{ r: string[] }>(
      "select public.push_recipients('day_approved',$1,$2) r",
      [id(3), id(7)],
    );
    expect(r.rows[0].r).toEqual([tok("work1")]);
  });
});
