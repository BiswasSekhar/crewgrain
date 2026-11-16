import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { factoryDate, dateOffset } from "../src/domain/rules";
const db = new PGlite(),
  today = factoryDate();
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function asUser(n: number, fn: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
  try {
    await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const action = (quantity: number) => ({
  type: "approve_day",
  employeeId: id(5),
  workDate: today,
  attendance: "present",
  tasks: [
    { assignmentId: id(15), quantity, expectedVersion: 1, reason: "Recounted" },
  ],
});
const act = (payload: unknown) =>
  db.query("select public.daily_action($1::jsonb)", [JSON.stringify(payload)]);
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of [
    "202611070001_foundation.sql",
    "202611070002_daily_workflow.sql",
    "202611100009_worker_owned_counts.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.query(
    "insert into public.units(id,name,code) values($1,'Line 1','U01')",
    [id(1)],
  );
  await db.query(
    "insert into public.lines(id,unit_id,name) values($1,$2,'Line 1')",
    [id(8), id(1)],
  );
  for (const [n, role] of [
    [3, "admin"],
    [4, "captain"],
    [5, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `ZV-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,$3)",
      [id(n), id(1), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code) values('${id(10)}','Kurta','K');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(12)}','${id(10)}','Sleeves',1,400);insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(20)}','${id(10)}','${id(1)}','${id(8)}','A',500);insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values('${id(15)}','${id(5)}','${id(12)}','${id(20)}','${id(1)}');`,
  );
  await asUser(5, async () => {
    await db.query("select public.change_daily_count($1::jsonb)", [
      JSON.stringify({
        id: id(40),
        employeeId: id(5),
        assignmentId: id(15),
        operationId: id(12),
        lotId: id(20),
        workDate: today,
        delta: 10,
        capturedAt: new Date().toISOString(),
      }),
    ]);
  });
  await db.query(
    "insert into public.production_entries(id,employee_id,unit_id,operation_id,lot_id,quantity,work_date,rate_paise,captured_at) values($1,$2,$3,$4,$5,10,$6,400,now())",
    [id(41), id(5), id(1), id(12), id(20), today],
  );
}, 30000);
afterAll(() => db.close());
describe("worker-owned counts in the database", () => {
  it("blocks captain/admin quantity edits, including the older entry endpoint", async () => {
    await asUser(4, async () => {
      await expect(act(action(9))).rejects.toThrow("Only the employee");
      await expect(
        act({ ...action(10), attendance: "absent" }),
      ).rejects.toThrow("recorded work");
    });
    await asUser(3, async () => {
      await expect(act(action(9))).rejects.toThrow("captain");
      await expect(
        db.query("select public.perform_action($1::jsonb)", [
          JSON.stringify({
            type: "edit_entry",
            id: id(41),
            quantity: 9,
            reason: "Admin edit",
          }),
        ]),
      ).rejects.toThrow("Only the employee");
      await expect(
        db.query(
          "select private.perform_action_before_worker_ownership($1::jsonb)",
          [
            JSON.stringify({
              type: "edit_entry",
              id: id(41),
              quantity: 9,
              reason: "Bypass",
            }),
          ],
        ),
      ).rejects.toThrow(/permission denied/);
    });
    expect(
      (await db.query("select quantity from public.daily_counts")).rows[0],
    ).toMatchObject({ quantity: 10 });
    expect(
      (await db.query("select quantity from public.production_entries"))
        .rows[0],
    ).toMatchObject({ quantity: 10 });
  });
  it("keeps the worker's own pending-entry edit available", async () => {
    await asUser(5, async () => {
      await db.query("select public.perform_action($1::jsonb)", [
        JSON.stringify({
          type: "edit_entry",
          id: id(41),
          quantity: 11,
          reason: "Worker correction",
        }),
      ]);
    });
    expect(
      (await db.query("select quantity from public.production_entries"))
        .rows[0],
    ).toMatchObject({ quantity: 11 });
  });
  it("approves the unchanged worker value and locks it", async () => {
    await asUser(4, async () => {
      await act(action(10));
    });
    const day = (
      await db.query<{ tasks: any[]; status: string }>(
        "select tasks,status from public.day_checks",
      )
    ).rows[0];
    expect(day.status).toBe("approved");
    expect(day.tasks[0]).toMatchObject({
      enteredQuantity: 10,
      captainQuantity: 10,
      finalQuantity: 10,
    });
  });
  it("allows historical disputes to keep only the employee original", async () => {
    await db.query(
      "insert into public.day_checks(employee_id,unit_id,work_date,captain_id,attendance,status,tasks) values($2,$3,$4,$5,'present','needs_admin',$1::jsonb)",
      [
        JSON.stringify([
          {
            assignmentId: id(15),
            enteredQuantity: 10,
            captainQuantity: 6,
            finalQuantity: 6,
            ratePaise: 400,
            reason: "Historical recount",
          },
        ]),
        id(5),
        id(1),
        dateOffset(-1),
        id(4),
      ],
    );
    const day = (
      await db.query<{ id: string }>(
        "select id from public.day_checks where status='needs_admin'",
      )
    ).rows[0].id;
    await asUser(3, async () => {
      await expect(
        act({
          type: "admin_decide_day",
          id: day,
          decision: "captain",
          note: "Use altered count",
        }),
      ).rejects.toThrow("must be kept");
      await act({
        type: "admin_decide_day",
        id: day,
        decision: "employee",
        note: "Preserve worker original",
      });
    });
    const result = (
      await db.query<{ tasks: any[] }>(
        "select tasks from public.day_checks where work_date=$1",
        [dateOffset(-1)],
      )
    ).rows[0];
    expect(result.tasks[0]).toMatchObject({
      enteredQuantity: 10,
      captainQuantity: 6,
      finalQuantity: 10,
    });
  });
});
