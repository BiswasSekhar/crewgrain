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
    await db.query<{ app_action: { id: string } }>(
      "select public.app_action($1::jsonb)",
      [JSON.stringify(a)],
    )
  ).rows[0].app_action;
}
async function snapshot() {
  return (
    await db.query<{ get_app_snapshot: any }>(
      "select public.get_app_snapshot()",
    )
  ).rows[0].get_app_snapshot;
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
    "202611080003_app_workspace.sql",
    "202611090004_captain_lines.sql",
    "202611090005_style_categories.sql",
    "202611090006_auto_pricing.sql",
    "202611090007_day_plan.sql",
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

describe("full role workspace", () => {
  it("restricts catalog changes and settings to admin", async () => {
    await user(4, async () => {
      await expect(
        act({
          type: "save_settings",
          name: "Other",
          phone: "",
          payPeriod: "weekly",
        }),
      ).rejects.toThrow("Admin access required");
      await expect(
        act({
          type: "update_lot",
          id: id(20),
          code: "A",
          totalPieces: 400,
          status: "closed",
        }),
      ).rejects.toThrow("Admin access required");
    });
    await user(3, async () => {
      await act({
        type: "save_settings",
        name: "Crewgrain studio",
        phone: "1234567890",
        payPeriod: "monthly",
      });
      await act({
        type: "update_style",
        id: id(10),
        name: "Linen kurta",
        code: "K",
        notes: "New notes",
      });
      await act({
        type: "update_operation",
        id: id(13),
        name: "Collar finish",
        prerequisiteIds: [id(12)],
      });
      await expect(
        act({
          type: "update_operation",
          id: id(12),
          name: "Sleeves",
          prerequisiteIds: [id(13)],
        }),
      ).rejects.toThrow("earlier tasks");
      expect((await snapshot()).settings.name).toBe("Crewgrain studio");
    });
  });
  it("restores captain reports and employee intake through a linked phone, without granting admin actions", async () => {
    let requestId = "";
    await db.query(
      "insert into public.linked_phones(profile_id,token_hash) values($1,$2)",
      [
        id(4),
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      ],
    );
    await service(async () => {
      const request = await db.query<{ phone_request: any }>(
        "select public.phone_request($1,'action',$2::jsonb)",
        [
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          JSON.stringify({
            type: "request_employee",
            employeeId: "NEW-1",
            name: "Nisha",
            unitId: id(1),
            operation: "Stitching",
          }),
        ],
      );
      const rid = request.rows[0].phone_request.id;
      requestId = rid;
      await expect(
        db.query("select public.phone_request($1,'action',$2::jsonb)", [
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          JSON.stringify({
            type: "review_request",
            id: rid,
            decision: "approved",
            reason: "Verified",
          }),
        ]),
      ).rejects.toThrow("Admin access required");
      await db.query("select public.phone_request($1,'action',$2::jsonb)", [
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        JSON.stringify({
          type: "submit_report",
          unitId: id(1),
          workDate: today,
          completed: 8,
          packed: 6,
          scheduled: 2,
          present: 1,
          blockers: "Thread",
          notes: "One absent",
        }),
      ]);
      await expect(
        db.query("select public.phone_request($1,'action',$2::jsonb)", [
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          JSON.stringify({
            type: "set_rate",
            id: id(12),
            ratePaise: 1,
            reason: "No",
          }),
        ]),
      ).rejects.toThrow("not available");
    });
    await user(3, async () => {
      const d = await snapshot();
      expect(d.reports[0].present).toBe(1);
      expect(d.requests.find((r: any) => r.id === requestId).status).toBe(
        "pending",
      );
      expect(d.employees.some((e: any) => e.name === "Nisha")).toBe(false);
      await act({
        type: "review_request",
        id: requestId,
        decision: "approved",
        reason: "Verified by admin",
      });
      expect(
        (await snapshot()).employees.some((e: any) => e.name === "Nisha"),
      ).toBe(true);
    });
  });
  it("keeps approved counts immutable and records a correction as a separately reviewed adjustment", async () => {
    await user(5, async () => {
      await count(101, 10);
    });
    await user(4, async () => {
      await act({
        type: "approve_day",
        employeeId: id(5),
        workDate: today,
        attendance: "present",
        tasks: [
          {
            assignmentId: id(15),
            quantity: 10,
            expectedVersion: 1,
            reason: "",
          },
        ],
      });
    });
    let requestId = "";
    await user(5, async () => {
      requestId = (
        await act({
          type: "request_correction",
          assignmentId: id(15),
          workDate: today,
          quantity: 12,
          reason: "Two pieces missed",
        })
      ).id;
      await expect(
        act({
          type: "request_correction",
          assignmentId: id(15),
          workDate: today,
          quantity: 13,
          reason: "Again",
        }),
      ).rejects.toThrow();
      await expect(
        act({
          type: "review_correction",
          id: requestId,
          decision: "accepted",
          note: "",
        }),
      ).rejects.toThrow("Admin access required");
    });
    await user(3, async () => {
      await act({
        type: "review_correction",
        id: requestId,
        decision: "accepted",
        note: "Count verified",
      });
      const d = await snapshot();
      expect(d.adjustments[0].quantityDelta).toBe(2);
      expect(d.adjustments[0].amountPaise).toBe(800);
      expect(d.days[0].tasks[0].enteredQuantity).toBe(10);
      expect(d.days[0].tasks[0].finalQuantity).toBe(10);
      await expect(
        act({
          type: "review_correction",
          id: requestId,
          decision: "accepted",
          note: "",
        }),
      ).rejects.toThrow("already been reviewed");
    });
    await user(4, async () => {
      const d = await snapshot();
      expect(d.adjustments[0].amountPaise).toBe(0);
      expect(d.adjustments[0].ratePaise).toBe(0);
    });
    await user(7, async () => {
      const d = await snapshot();
      expect(d.corrections).toHaveLength(0);
      expect(d.adjustments).toHaveLength(0);
    });
    await expect(
      db.exec(
        "update public.wage_adjustments set quantity_delta=3,amount_paise=1200",
      ),
    ).rejects.toThrow();
  });
  it("allows removing only unrecorded tasks in the captain unit", async () => {
    let assignment = "";
    await user(3, async () => {
      assignment = (
        await act({
          type: "assign_task",
          employeeId: id(7),
          operationId: id(13),
          lotId: id(21),
          workDate: today,
        })
      ).id;
    });
    await user(4, async () => {
      await expect(
        act({
          type: "deactivate_assignment",
          id: assignment,
          reason: "Wrong task",
        }),
      ).rejects.toThrow("Unit access denied");
      await expect(
        act({
          type: "deactivate_assignment",
          id: id(15),
          reason: "Wrong task",
        }),
      ).rejects.toThrow("Recorded or checked");
    });
    await user(6, async () => {
      await act({
        type: "deactivate_assignment",
        id: assignment,
        reason: "Wrong task",
      });
      expect(
        (await snapshot()).assignments.find((a: any) => a.id === assignment)
          .active,
      ).toBe(false);
    });
  });
});

describe("captain line and unit management", () => {
  const unitAct = async (a: unknown) =>
    (
      await db.query<{ unit_action: { id: string } }>(
        "select public.unit_action($1::jsonb)",
        [JSON.stringify(a)],
      )
    ).rows[0].unit_action;
  it("lets a captain add, rename and remove lines in their own unit only", async () => {
    let lineId = "";
    await user(4, async () => {
      lineId = (await unitAct({ type: "add_line", unitId: id(1), name: "C" }))
        .id;
      await expect(
        unitAct({ type: "add_line", unitId: id(1), name: "C" }),
      ).rejects.toThrow("already exists");
      await unitAct({ type: "rename_line", id: lineId, name: "C2" });
      await unitAct({ type: "rename_unit", id: id(1), name: "Unit A renamed" });
      await expect(
        unitAct({ type: "add_line", unitId: id(2), name: "X" }),
      ).rejects.toThrow("Unit access denied");
      await expect(
        unitAct({ type: "rename_unit", id: id(2), name: "Nope" }),
      ).rejects.toThrow("Unit access denied");
      await unitAct({ type: "remove_line", id: lineId });
    });
    expect(
      (await db.query("select 1 from public.lines where id=$1", [lineId])).rows,
    ).toHaveLength(0);
  });
  it("denies employees and other units' captains, and allows admin anywhere", async () => {
    await user(5, async () => {
      await expect(
        unitAct({ type: "add_line", unitId: id(1), name: "W" }),
      ).rejects.toThrow("Unit access denied");
    });
    await user(6, async () => {
      await expect(unitAct({ type: "remove_line", id: id(8) })).rejects.toThrow(
        "Unit access denied",
      );
    });
    await user(3, async () => {
      const made = await unitAct({
        type: "add_line",
        unitId: id(2),
        name: "Admin line",
      });
      await unitAct({ type: "remove_line", id: made.id });
    });
  });
});

describe("style categories and quick tasks", () => {
  const call = async (fn: string, a: unknown) =>
    (
      await db.query<Record<string, { id: string; count?: number }>>(
        `select public.${fn}($1::jsonb) as r`,
        [JSON.stringify(a)],
      )
    ).rows[0] as unknown as { r: { id: string; count?: number } };
  it("lets admin save a categorised style and add many tasks, and denies captains", async () => {
    let styleId = "";
    await user(3, async () => {
      styleId = (
        await call("save_style", {
          type: "save_style",
          name: "Sleepsuit with cap",
          code: "Z3006",
          category: "Sleepsuit",
          notes: "",
        })
      ).r.id;
      await expect(
        call("save_style", {
          type: "save_style",
          name: "Other",
          code: "Z3006",
          category: "",
          notes: "",
        }),
      ).rejects.toThrow("already exists");
      const added = await call("add_operations", {
        type: "add_operations",
        styleId,
        tasks: [
          { name: "Zipper fly O/L", ratePaise: 180 },
          { name: "Shoulder joint O/L", ratePaise: 120 },
        ],
      });
      expect(added.r.count).toBe(2);
      await expect(
        call("add_operations", { type: "add_operations", styleId, tasks: [] }),
      ).rejects.toThrow("between 1 and 60");
      const style = (await snapshot()).styles.find(
        (x: { id: string }) => x.id === styleId,
      );
      expect(style.category).toBe("Sleepsuit");
    });
    const ops = await db.query(
      "select name,sequence,rate_paise from public.operations where style_id=$1 order by sequence",
      [styleId],
    );
    expect(ops.rows).toEqual([
      { name: "Zipper fly O/L", sequence: 1, rate_paise: 180 },
      { name: "Shoulder joint O/L", sequence: 2, rate_paise: 120 },
    ]);
    await user(4, async () => {
      await expect(
        call("save_style", {
          type: "save_style",
          name: "X",
          code: "X1",
          category: "",
          notes: "",
        }),
      ).rejects.toThrow("Admin access required");
    });
  });
});

describe("automatic pricing from seconds", () => {
  const call = async (fn: string, a: unknown) =>
    (
      await db.query<{ r: any }>(`select public.${fn}($1::jsonb) as r`, [
        JSON.stringify(a),
      ])
    ).rows[0].r;
  const asService = async <T>(fn: () => Promise<T>) => {
    let out!: T;
    await service(async () => {
      out = await fn();
    });
    return out;
  };
  const rates = (style: string) =>
    asService(async () =>
      Object.fromEntries(
        (
          await db.query<{ name: string; rate_paise: number }>(
            "select name,rate_paise from public.operations where style_id=$1",
            [style],
          )
        ).rows.map((r) => [r.name, r.rate_paise]),
      ),
    );
  it("prices tasks at seconds / 60 x rate, with factory, style and task overrides", async () => {
    let style = "";
    let first = "";
    await user(3, async () => {
      style = (
        await call("save_style", {
          type: "save_style",
          name: "Pricing test",
          code: "P1",
          category: "",
          notes: "",
        })
      ).id;
      await call("add_operations", {
        type: "add_operations",
        styleId: style,
        tasks: [{ name: "No price yet" }],
      });
      expect((await rates(style))["No price yet"]).toBe(0);
      await asService(() =>
        db.query(
          "delete from public.operations where style_id=$1 and name='No price yet'",
          [style],
        ),
      );
      await call("add_operations", {
        type: "add_operations",
        styleId: style,
        tasks: [
          { name: "A", seconds: 18 },
          { name: "B", seconds: 39 },
          { name: "C", seconds: 30, ratePaise: 500 },
        ],
      });
      expect(await rates(style)).toEqual({ A: 105, B: 228, C: 500 });
      first = await asService(
        async () =>
          (
            await db.query<{ id: string }>(
              "select id from public.operations where style_id=$1 and name='A'",
              [style],
            )
          ).rows[0].id,
      );
      expect(
        (
          await call("set_rate_settings", {
            type: "set_rate_settings",
            perMinutePaise: 400,
          })
        ).updated,
      ).toBeGreaterThanOrEqual(2);
      expect(await rates(style)).toEqual({ A: 120, B: 260, C: 500 });
      await call("set_style_pricing", {
        type: "set_style_pricing",
        styleId: style,
        perMinutePaise: 500,
      });
      expect(await rates(style)).toEqual({ A: 150, B: 325, C: 500 });
      await call("set_style_pricing", {
        type: "set_style_pricing",
        styleId: style,
        perMinutePaise: null,
      });
      expect(await rates(style)).toEqual({ A: 120, B: 260, C: 500 });
      await call("set_task_pricing", {
        type: "set_task_pricing",
        id: first,
        ratePaise: 99,
      });
      await call("set_rate_settings", {
        type: "set_rate_settings",
        perMinutePaise: 300,
      });
      expect((await rates(style)).A).toBe(99);
      await call("set_task_pricing", {
        type: "set_task_pricing",
        id: first,
        ratePaise: null,
      });
      expect((await rates(style)).A).toBe(90);
      const snap = await snapshot();
      expect(snap.rateSettings.perMinutePaise).toBe(300);
      expect(
        snap.operations.find((o: { id: string }) => o.id === first),
      ).toMatchObject({ seconds: 18, manual: false });
      await call("set_rate_settings", {
        type: "set_rate_settings",
        perMinutePaise: 350,
      });
    });
    await user(4, async () => {
      await expect(
        call("set_rate_settings", {
          type: "set_rate_settings",
          perMinutePaise: 1,
        }),
      ).rejects.toThrow("Admin access required");
      expect((await snapshot()).rateSettings).toBeUndefined();
    });
  });
});

describe("daily style plan", () => {
  const plan = async (unitId: string, items: unknown[], day = today) =>
    db.query("select public.set_day_plan($1::jsonb)", [
      JSON.stringify({ type: "set_day_plan", unitId, workDate: day, items }),
    ]);
  it("lets a captain pick styles in order with optional counts, creating hidden batches", async () => {
    let second = "";
    await user(3, async () => {
      second = (
        await db.query<{ r: { id: string } }>(
          "select public.save_style($1::jsonb) as r",
          [
            JSON.stringify({
              type: "save_style",
              name: "Cap",
              code: "Z3010",
              category: "Cap",
              notes: "",
            }),
          ],
        )
      ).rows[0].r.id;
    });
    await user(4, async () => {
      await plan(id(1), [{ styleId: second, count: 120 }, { styleId: id(10) }]);
      const snap = await snapshot();
      expect(
        snap.dayPlan.map((x: any) => [x.styleId, x.position, x.count]),
      ).toEqual([
        [second, 0, 120],
        [id(10), 1, null],
      ]);
      expect(
        snap.lots.some((l: any) => l.styleId === second && l.unitId === id(1)),
      ).toBe(true);
      await plan(id(1), [{ styleId: id(10) }, { styleId: second, count: 80 }]);
      expect((await snapshot()).dayPlan[0].styleId).toBe(id(10));
      await expect(
        plan(id(1), [{ styleId: second }, { styleId: second }]),
      ).rejects.toThrow("added once");
      await expect(plan(id(2), [{ styleId: second }])).rejects.toThrow(
        "Unit access denied",
      );
    });
    await user(5, async () => {
      await expect(plan(id(1), [{ styleId: second }])).rejects.toThrow(
        "Unit access denied",
      );
    });
    await user(3, async () => {
      await plan(id(2), [{ styleId: second }]);
      expect((await snapshot()).dayPlan.length).toBeGreaterThanOrEqual(3);
    });
  });
});
