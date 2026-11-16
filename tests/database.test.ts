import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function asUser(n: number, fn: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
  try {
    await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function action(data: unknown) {
  return db.query<{ perform_action: { id: string } }>(
    "select public.perform_action($1::jsonb)",
    [JSON.stringify(data)],
  );
}
async function snapshot() {
  return (await db.query<{ get_snapshot: any }>("select public.get_snapshot()"))
    .rows[0].get_snapshot;
}
async function record(n: number, quantity = 20) {
  return db.query("select public.record_production($1::jsonb)", [
    JSON.stringify({
      id: id(n),
      employeeId: id(5),
      operationId: id(12),
      lotId: id(20),
      quantity,
      workDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      capturedAt: new Date().toISOString(),
    }),
  ]);
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611070001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `insert into public.units(id,name,code) values('${id(1)}','Unit A','A'),('${id(2)}','Unit B','B');insert into public.lines(id,unit_id,name) values('${id(8)}','${id(1)}','Line A'),('${id(9)}','${id(2)}','Line B');`,
  );
  for (const [n, role, name, unit] of [
    [3, "admin", "Admin", 1],
    [4, "captain", "Captain A", 1],
    [5, "worker", "Worker A", 1],
    [6, "captain", "Captain B", 2],
    [7, "worker", "Worker B", 2],
  ] as const) {
    await db.query("insert into auth.users(id) values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$3,$4)",
      [id(n), `ZV-${n}`, name, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,$3)",
      [id(n), id(unit), role],
    );
  }
  await db.exec(
    `insert into public.styles(id,name,code) values('${id(10)}','Test kurta','S1');insert into public.operations(id,style_id,name,sequence,rate_paise) values('${id(11)}','${id(10)}','Panels',1,350),('${id(12)}','${id(10)}','Sleeves',2,425);insert into public.operation_prereqs values('${id(12)}','${id(11)}');insert into public.lots(id,style_id,unit_id,line_id,code,total_pieces) values('${id(20)}','${id(10)}','${id(1)}','${id(8)}','LOT-A',600),('${id(21)}','${id(10)}','${id(2)}','${id(9)}','LOT-B',600);insert into public.assignments(employee_id,operation_id,lot_id,unit_id) values('${id(5)}','${id(12)}','${id(20)}','${id(1)}');insert into public.employee_onboarding_requests(id,unit_id,requested_by,proposed_employee_id,name) values('${id(30)}','${id(2)}','${id(6)}','ZV-NEWB','New B'),('${id(31)}','${id(1)}','${id(4)}','ZV-NEWA','New A');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Postgres authorization and integrity", () => {
  it("enables RLS on every application table and denies anonymous RPC calls", async () => {
    const rows = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        "select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'",
      )
    ).rows;
    expect(rows.length).toBe(16);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    await db.exec("set role anon");
    try {
      await expect(snapshot()).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("prevents captain A from listing, approving or reporting for unit B", async () => {
    await asUser(4, async () => {
      const s = await snapshot();
      expect(s.units.map((u: any) => u.id)).toEqual([id(1)]);
      expect(s.employees.every((e: any) => e.unitId === id(1))).toBe(true);
      expect(s.requests.some((r: any) => r.id === id(30))).toBe(false);
      expect(
        (await db.query("select * from public.employee_onboarding_requests"))
          .rows,
      ).toHaveLength(1);
      await expect(
        action({
          type: "review_request",
          id: id(30),
          decision: "approved",
          reason: "",
        }),
      ).rejects.toThrow("Unit access denied");
      await expect(
        action({
          type: "submit_report",
          unitId: id(2),
          workDate: "2026-11-07",
          completed: 0,
          packed: 0,
          scheduled: 1,
          present: 1,
        }),
      ).rejects.toThrow("Unit access denied");
      await expect(
        db.query("select rate_paise from public.operations"),
      ).rejects.toThrow("permission denied");
    });
  });
  it("activates a captain-approved employee in one transaction without credentials", async () => {
    await asUser(4, async () => {
      await action({
        type: "review_request",
        id: id(31),
        decision: "approved",
        reason: "",
      });
      const s = await snapshot(),
        employee = s.employees.find((e: any) => e.employeeId === "ZV-NEWA");
      expect(employee).toMatchObject({
        active: true,
        authReady: false,
        unitId: id(1),
      });
    });
    expect(
      (await db.query("select count(*)::int as n from public.audit_log"))
        .rows[0],
    ).toMatchObject({ n: 1 });
  });
  it("lets an admin directly add an employee; rejects cross-role escalation", async () => {
    await asUser(3, async () => {
      await action({
        type: "add_employee",
        employeeId: "ZV-DIRECT",
        name: "Direct employee",
        unitId: id(2),
        role: "worker",
        operation: "Packing",
      });
      const s = await snapshot();
      expect(
        s.employees.find((e: any) => e.employeeId === "ZV-DIRECT"),
      ).toMatchObject({ active: true, unitId: id(2) });
      await expect(
        action({
          type: "add_employee",
          employeeId: "ZV-ADMIN2",
          name: "Unauthorized admin",
          unitId: id(2),
          role: "admin",
        }),
      ).rejects.toThrow("controlled owner setup");
    });
  });
  it("captures the server rate, retries exactly once and raises a flow flag without rejecting", async () => {
    await asUser(5, async () => {
      await record(40);
      await record(40);
      await expect(record(40, 21)).rejects.toThrow("different work");
      const s = await snapshot();
      expect(s.entries.filter((e: any) => e.id === id(40))).toHaveLength(1);
      expect(s.entries.find((e: any) => e.id === id(40))).toMatchObject({
        quantity: 20,
        ratePaise: 425,
        status: "pending",
      });
      expect(s.employees).toHaveLength(1);
    });
    const flags = (await db.query("select * from public.review_flags")).rows;
    expect(flags).toHaveLength(1);
    await asUser(4, async () => {
      const s = await snapshot();
      expect(s.entries.every((e: any) => e.ratePaise === 0)).toBe(true);
      await expect(
        db.query("select * from public.production_entries"),
      ).rejects.toThrow("permission denied");
    });
  });
  it("preserves historical rates and locks approved production", async () => {
    await asUser(3, async () => {
      await action({
        type: "set_rate",
        id: id(12),
        ratePaise: 900,
        reason: "New rate",
      });
      expect(
        (await snapshot()).entries.find((e: any) => e.id === id(40)).ratePaise,
      ).toBe(425);
      await action({
        type: "review_entry",
        id: id(40),
        decision: "approved",
        reason: "Checked",
      });
      await expect(
        action({
          type: "edit_entry",
          id: id(40),
          quantity: 21,
          reason: "Changed",
        }),
      ).rejects.toThrow("immutable");
    });
  });
  it("enforces the edit window using server time", async () => {
    await asUser(5, async () => {
      await record(41);
    });
    await db.exec(
      `alter table public.production_entries disable trigger entry_immutable;update public.production_entries set created_at=now()-interval '2 hours' where id='${id(41)}';alter table public.production_entries enable trigger entry_immutable;`,
    );
    await asUser(5, async () => {
      await expect(
        action({
          type: "edit_entry",
          id: id(41),
          quantity: 30,
          reason: "Phone clock changed",
        }),
      ).rejects.toThrow("Edit window closed");
    });
  });
  it("rejects invalid attendance and retains report revision/review events", async () => {
    let reportId = "";
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await asUser(4, async () => {
      await expect(
        action({
          type: "submit_report",
          unitId: id(1),
          workDate: date,
          completed: 20,
          packed: 10,
          scheduled: 2,
          present: 3,
        }),
      ).rejects.toThrow("check constraint");
      const result = await action({
        type: "submit_report",
        unitId: id(1),
        workDate: date,
        completed: 20,
        packed: 10,
        scheduled: 2,
        present: 1,
        notes: "Machine issue",
      });
      reportId = result.rows[0].perform_action.id;
    });
    await asUser(3, async () => {
      await action({
        type: "review_report",
        id: reportId,
        decision: "changes_requested",
        reason: "Check packed count",
      });
    });
    await asUser(4, async () => {
      await action({
        type: "submit_report",
        unitId: id(1),
        workDate: date,
        completed: 20,
        packed: 12,
        scheduled: 2,
        present: 1,
        notes: "Corrected",
      });
      expect((await snapshot()).reports[0].revision).toBe(2);
    });
    await asUser(3, async () => {
      await action({
        type: "review_report",
        id: reportId,
        decision: "reviewed",
        reason: "Checked",
      });
    });
    await asUser(4, async () => {
      await expect(
        action({
          type: "submit_report",
          unitId: id(1),
          workDate: date,
          completed: 20,
          packed: 12,
          scheduled: 2,
          present: 1,
        }),
      ).rejects.toThrow("locked");
    });
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.captain_report_events",
        )
      ).rows[0],
    ).toMatchObject({ n: 4 });
  });
  it("denies inactive accounts even while an old token still identifies the user", async () => {
    await asUser(3, async () => {
      await action({
        type: "set_employee_active",
        id: id(7),
        active: false,
        reason: "Left unit",
      });
    });
    await asUser(7, async () => {
      await expect(snapshot()).rejects.toThrow("Active employee");
    });
  });
  it("preserves historical unit/rate ownership when an admin reassigns a worker", async () => {
    await asUser(3, async () => {
      await action({
        type: "update_employee",
        id: id(5),
        name: "Worker A",
        unitId: id(2),
        lineId: id(9),
        operation: "Finishing",
        reason: "Transfer to finishing",
      });
    });
    const row = (
      await db.query<{ unit_id: string; rate_paise: number }>(
        "select unit_id,rate_paise from public.production_entries where id=$1",
        [id(40)],
      )
    ).rows[0];
    expect(row).toMatchObject({ unit_id: id(1), rate_paise: 425 });
    await asUser(5, async () => {
      const s = await snapshot();
      expect(s.employees[0].unitId).toBe(id(2));
      expect(s.lots.some((l: any) => l.id === id(20))).toBe(true);
      expect(s.entries.some((e: any) => e.id === id(40))).toBe(true);
      await expect(record(42)).rejects.toThrow("not assigned");
    });
    await asUser(4, async () => {
      expect(
        (await snapshot()).employees.some((e: any) => e.id === id(5)),
      ).toBe(false);
    });
  });
  it("locks login attempts after five reservations and allows a service reset", async () => {
    await db.exec("set role service_role");
    try {
      for (let i = 0; i < 5; i++)
        expect(
          (
            await db.query<{ reserve_login_attempt: boolean }>(
              "select public.reserve_login_attempt('ZV-TEST')",
            )
          ).rows[0].reserve_login_attempt,
        ).toBe(true);
      expect(
        (
          await db.query<{ reserve_login_attempt: boolean }>(
            "select public.reserve_login_attempt('ZV-TEST')",
          )
        ).rows[0].reserve_login_attempt,
      ).toBe(false);
      await db.query("select public.clear_login_attempts('ZV-TEST')");
      expect(
        (
          await db.query<{ reserve_login_attempt: boolean }>(
            "select public.reserve_login_attempt('ZV-TEST')",
          )
        ).rows[0].reserve_login_attempt,
      ).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });
});
