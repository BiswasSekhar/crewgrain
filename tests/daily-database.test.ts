import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { factoryDate } from "../src/domain/rules";
const db = new PGlite();
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = factoryDate();
async function user(n: number, fn: () => Promise<void>) {
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
async function service(fn: () => Promise<void>) {
  await db.exec("set role service_role");
  try {
    await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function act(a: unknown) {
  return (
    await db.query<{ daily_action: { id: string } }>(
      "select public.daily_action($1::jsonb)",
      [JSON.stringify(a)],
    )
  ).rows[0].daily_action;
}
async function snapshot() {
  return (
    await db.query<{ get_daily_snapshot: any }>(
      "select public.get_daily_snapshot()",
    )
  ).rows[0].get_daily_snapshot;
}
async function count(event: number, delta: number, assignment = id(15)) {
  return (
    await db.query<{ change_daily_count: any }>(
      "select public.change_daily_count($1::jsonb)",
      [
        JSON.stringify({
          id: id(event),
          employeeId: id(5),
          assignmentId: assignment,
          operationId: assignment === id(15) ? id(12) : id(13),
          lotId: id(20),
          workDate: today,
          delta,
          capturedAt: new Date().toISOString(),
        }),
      ],
    )
  ).rows[0].change_daily_count;
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of [
    "202611070001_foundation.sql",
    "202611070002_daily_workflow.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into public.units(id,name,code) values('${id(1)}','Unit A','A'),('${id(2)}','Unit B','B');insert into public.lines(id,unit_id,name) values('${id(8)}','${id(1)}','A'),('${id(9)}','${id(2)}','B');`,
  );
  for (const [n, role, unit] of [
    [3, "admin", 1],
    [4, "captain", 1],
    [5, "worker", 1],
    [6, "captain", 2],
    [7, "worker", 2],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `ZV-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,$3)",
      [id(n), id(unit), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code) values('${id(10)}','Kurta','K');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(12)}','${id(10)}','Sleeves',1,400),('${id(13)}','${id(10)}','Collar',2,300),('${id(14)}','${id(10)}','Panels',3,500);insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(20)}','${id(10)}','${id(1)}','${id(8)}','A',500),('${id(21)}','${id(10)}','${id(2)}','${id(9)}','B',500);insert into public.assignments(id,employee_id,operation_id,lot_id,unit_id) values('${id(15)}','${id(5)}','${id(12)}','${id(20)}','${id(1)}');`,
  );
}, 30000);
afterAll(async () => db.close());
describe("daily work and linked-phone security", () => {
  it("lets a captain and admin assign several tasks, while denying another unit", async () => {
    await user(4, async () => {
      await act({
        type: "assign_task",
        employeeId: id(5),
        operationId: id(13),
        lotId: id(20),
        workDate: today,
      });
      await expect(
        act({
          type: "assign_task",
          employeeId: id(7),
          operationId: id(13),
          lotId: id(21),
          workDate: today,
        }),
      ).rejects.toThrow("Unit access denied");
    });
    await user(3, async () => {
      await act({
        type: "assign_task",
        employeeId: id(5),
        operationId: id(14),
        lotId: id(20),
        workDate: today,
      });
      expect(
        (await snapshot()).assignments.filter(
          (a: any) => a.employeeId === id(5),
        ),
      ).toHaveLength(3);
    });
    await user(5, async () => {
      await expect(
        act({
          type: "assign_task",
          employeeId: id(5),
          operationId: id(14),
          lotId: id(20),
          workDate: today,
        }),
      ).rejects.toThrow("Unit access denied");
    });
  });
  it("saves additive counts and subtracts without duplicate retries or negative quantities", async () => {
    await user(5, async () => {
      await count(40, 10);
      await count(41, -2);
      const retry = await count(41, -2);
      expect(retry.duplicate).toBe(true);
      expect(retry.count.quantity).toBe(8);
      expect(retry.count.version).toBe(2);
      await expect(count(41, -1)).rejects.toThrow("already used");
      await expect(count(42, -9)).rejects.toThrow("between 0");
    });
    expect(
      (await db.query("select count(*)::int as n from public.count_events"))
        .rows[0],
    ).toMatchObject({ n: 2 });
  });
  it("requires a current version and a reason for changed counts", async () => {
    await user(4, async () => {
      const snap = await snapshot();
      const tasks = snap.assignments
        .filter((a: any) => a.employeeId === id(5))
        .map((a: any) => ({
          assignmentId: a.id,
          quantity: a.id === id(15) ? 6 : 0,
          expectedVersion: a.id === id(15) ? 1 : 0,
          reason: "Recounted",
        }));
      await expect(
        act({
          type: "approve_day",
          employeeId: id(5),
          workDate: today,
          attendance: "present",
          tasks,
        }),
      ).rejects.toThrow("count changed");
      tasks.find((t: any) => t.assignmentId === id(15)).expectedVersion = 2;
      tasks.find((t: any) => t.assignmentId === id(15)).reason = "";
      await expect(
        act({
          type: "approve_day",
          employeeId: id(5),
          workDate: today,
          attendance: "present",
          tasks,
        }),
      ).rejects.toThrow("reason");
    });
  });
  it("preserves employee originals and sends captain changes to admin before wages", async () => {
    await user(4, async () => {
      const snap = await snapshot();
      const tasks = snap.assignments
        .filter((a: any) => a.employeeId === id(5))
        .map((a: any) => ({
          assignmentId: a.id,
          quantity: a.id === id(15) ? 6 : 0,
          expectedVersion: a.id === id(15) ? 2 : 0,
          reason: a.id === id(15) ? "Two pieces needed rework" : "",
        }));
      await act({
        type: "approve_day",
        employeeId: id(5),
        workDate: today,
        attendance: "present",
        tasks,
      });
      const result = await snapshot();
      expect(result.days[0].status).toBe("needs_admin");
      expect(
        result.days[0].tasks.find((t: any) => t.assignmentId === id(15)),
      ).toMatchObject({ enteredQuantity: 8, captainQuantity: 6, ratePaise: 0 });
      await expect(
        act({
          type: "approve_day",
          employeeId: id(5),
          workDate: today,
          attendance: "present",
          tasks,
        }),
      ).rejects.toThrow("already been approved");
    });
    expect(
      (
        await db.query(
          "select quantity,rate_paise from public.daily_counts where assignment_id=$1",
          [id(15)],
        )
      ).rows[0],
    ).toMatchObject({ quantity: 8, rate_paise: 400 });
    await user(5, async () => {
      await expect(count(43, 1)).rejects.toThrow("already been approved");
    });
  });
  it("allows only the admin to restore the employee count, preserving the captain decision", async () => {
    const day = (
      await db.query<{ id: string }>("select id from public.day_checks")
    ).rows[0].id;
    await user(4, async () => {
      await expect(
        act({
          type: "admin_decide_day",
          id: day,
          decision: "employee",
          note: "Keep original",
        }),
      ).rejects.toThrow("Admin access");
    });
    await user(3, async () => {
      await act({
        type: "admin_decide_day",
        id: day,
        decision: "employee",
        note: "Verified physical work",
      });
      const result = (await snapshot()).days[0];
      expect(result).toMatchObject({
        status: "admin_approved",
        adminDecision: "employee",
      });
      expect(
        result.tasks.find((t: any) => t.assignmentId === id(15)),
      ).toMatchObject({
        enteredQuantity: 8,
        captainQuantity: 6,
        finalQuantity: 8,
        ratePaise: 400,
      });
      await expect(
        act({
          type: "admin_decide_day",
          id: day,
          decision: "captain",
          note: "",
        }),
      ).rejects.toThrow("already been reviewed");
    });
    await expect(
      db.query("update public.count_events set delta=1"),
    ).rejects.toThrow("immutable");
  });
  it("denies a forged device identity in a normal authenticated request", async () => {
    await user(7, async () => {
      await db.query("select set_config('crewgrain.device_profile',$1,false)", [
        id(3),
      ]);
      const snap = await snapshot();
      expect(snap.actorId).toBe(id(7));
      expect(snap.units.map((u: any) => u.id)).toEqual([id(2)]);
      await expect(
        db.query("select public.phone_request($1,$2,$3)", [
          "a".repeat(64),
          "snapshot",
          "{}",
        ]),
      ).rejects.toThrow("permission denied");
    });
  });
  it("redeems a setup link once and scopes password-free phone access to its profile", async () => {
    await service(async () => {
      await db.query("select public.create_phone_setup($1,$2,$3)", [
        id(3),
        id(4),
        "a".repeat(64),
      ]);
      await db.query("select public.redeem_phone_setup($1,$2)", [
        "a".repeat(64),
        "b".repeat(64),
      ]);
      await expect(
        db.query("select public.redeem_phone_setup($1,$2)", [
          "a".repeat(64),
          "c".repeat(64),
        ]),
      ).rejects.toThrow("expired or was already used");
      const phone = (
        await db.query<{ phone_request: any }>(
          "select public.phone_request($1,$2,$3)",
          ["b".repeat(64), "snapshot", "{}"],
        )
      ).rows[0].phone_request;
      expect(phone.actorId).toBe(id(4));
      expect(phone.units.map((u: any) => u.id)).toEqual([id(1)]);
      expect(phone.devices).toEqual([]);
      expect(phone.days[0].tasks.every((t: any) => t.ratePaise === 0)).toBe(
        true,
      );
      await expect(
        db.query("select public.phone_request($1,$2,$3)", [
          "b".repeat(64),
          "action",
          JSON.stringify({
            type: "admin_decide_day",
            id: id(99),
            decision: "captain",
          }),
        ]),
      ).rejects.toThrow("not available");
    });
  });
  it("revokes phone access immediately without changing original work records", async () => {
    const device = (
      await db.query<{ id: string }>("select id from public.linked_phones")
    ).rows[0].id;
    await user(3, async () => {
      await act({ type: "revoke_device", id: device });
    });
    await service(async () => {
      await expect(
        db.query("select public.phone_request($1,$2,$3)", [
          "b".repeat(64),
          "snapshot",
          "{}",
        ]),
      ).rejects.toThrow("not linked");
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from public.count_events",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("allows unchanged captain approvals without an admin gate and preserves rate snapshots", async () => {
    let assignmentId = "";
    await user(6, async () => {
      assignmentId = (
        await act({
          type: "assign_task",
          employeeId: id(7),
          operationId: id(12),
          lotId: id(21),
          workDate: today,
        })
      ).id;
    });
    await user(7, async () => {
      await db.query("select public.change_daily_count($1::jsonb)", [
        JSON.stringify({
          id: id(70),
          employeeId: id(7),
          assignmentId,
          operationId: id(12),
          lotId: id(21),
          workDate: today,
          delta: 5,
          capturedAt: new Date().toISOString(),
        }),
      ]);
    });
    await user(3, async () => {
      await db.query("select public.perform_action($1::jsonb)", [
        JSON.stringify({
          type: "set_rate",
          id: id(12),
          ratePaise: 900,
          reason: "New rate",
        }),
      ]);
    });
    await user(6, async () => {
      await act({
        type: "approve_day",
        employeeId: id(7),
        workDate: today,
        attendance: "present",
        tasks: [{ assignmentId, quantity: 5, expectedVersion: 1, reason: "" }],
      });
    });
    await user(3, async () => {
      const day = (await snapshot()).days.find(
        (d: any) => d.employeeId === id(7),
      );
      expect(day.status).toBe("approved");
      expect(day.tasks[0]).toMatchObject({
        enteredQuantity: 5,
        captainQuantity: 5,
        finalQuantity: 5,
        ratePaise: 400,
      });
    });
  });
});
