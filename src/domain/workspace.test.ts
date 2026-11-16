import { describe, it, expect } from "vitest";
import { makeDemo } from "./demo";
import { seedDaily, applyDailyAction, tasksFor, countFor } from "./daily";
import {
  seedWorkspace,
  ledger,
  totals,
  applyWorkspaceAction,
} from "./workspace";
import { factoryDate, dateOffset, scopeSnapshot } from "./rules";
const setup = () => seedWorkspace(seedDaily(makeDemo()));
describe("role workspace and wage statements", () => {
  it("does not double count migrated daily work alongside legacy entries", () => {
    const s = setup();
    const today = ledger(s).filter(
      (r) => r.employeeId === "worker" && r.workDate === factoryDate(),
    );
    expect(today.filter((r) => r.operationId === "o2")).toHaveLength(1);
    expect(totals(today).pieces).toBe(
      s.counts!.find((c) => c.employeeId === "worker")!.quantity,
    );
  });
  it("keeps correction requests separate from originals and posts only admin-approved adjustments", () => {
    let s = setup();
    const employee = s.employees.find((e) => e.id === "worker")!,
      admin = s.employees.find((e) => e.role === "admin")!,
      captain = s.employees.find((e) => e.id === "captain")!;
    const before = ledger(s).find(
      (r) =>
        r.employeeId === employee.id &&
        r.workDate === dateOffset(-1) &&
        r.source === "daily" &&
        r.entered > 0,
    )!;
    expect(before).toBeDefined();
    const days = JSON.stringify(s.days);
    s = applyWorkspaceAction(
      s,
      employee,
      {
        type: "request_correction",
        assignmentId: before.assignmentId!,
        workDate: before.workDate,
        quantity: before.payable + 2,
        reason: "Missed two pieces",
      },
      "request",
    );
    expect(totals(ledger(s)).approved).toBe(totals(ledger(setup())).approved);
    expect(() =>
      applyWorkspaceAction(
        s,
        captain,
        {
          type: "review_correction",
          id: "request",
          decision: "accepted",
          note: "",
        },
        "review",
      ),
    ).toThrow("Admin");
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "review_correction",
        id: "request",
        decision: "accepted",
        note: "Verified",
      },
      "review",
    );
    expect(JSON.stringify(s.days)).toBe(days);
    const after = ledger(s).find((r) => r.id === before.id)!;
    expect(after.payable).toBe(before.payable + 2);
    expect(after.amountPaise - before.amountPaise).toBe(2 * before.ratePaise);
    expect(() =>
      applyWorkspaceAction(
        s,
        admin,
        {
          type: "review_correction",
          id: "request",
          decision: "accepted",
          note: "",
        },
        "again",
      ),
    ).toThrow("already");
  });
  it("hides other employees corrections and all wage amounts from captains", () => {
    let s = setup();
    const worker = s.employees.find((e) => e.id === "worker")!,
      row = ledger(s).find(
        (r) =>
          r.employeeId === worker.id &&
          r.workDate === dateOffset(-1) &&
          r.entered > 0,
      )!;
    s = applyWorkspaceAction(
      s,
      worker,
      {
        type: "request_correction",
        assignmentId: row.assignmentId!,
        workDate: row.workDate,
        quantity: row.payable + 1,
        reason: "Verify",
      },
      "r",
    );
    s = applyWorkspaceAction(
      s,
      s.employees.find((e) => e.role === "admin")!,
      { type: "review_correction", id: "r", decision: "accepted", note: "" },
      "a",
    );
    expect(
      scopeSnapshot(
        s,
        s.employees.find((e) => e.id === "w3")!,
      ).corrections,
    ).toHaveLength(0);
    const cap = scopeSnapshot(
      s,
      s.employees.find((e) => e.id === "captain")!,
    );
    expect(cap.adjustments?.[0].amountPaise).toBe(0);
    expect(cap.adjustments?.[0].ratePaise).toBe(0);
  });
  it("rejects task removal after counts or captain check and denies employee administration", () => {
    const s = setup(),
      cap = s.employees.find((e) => e.id === "captain")!,
      worker = s.employees.find((e) => e.id === "worker")!,
      date = factoryDate();
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "deactivate_assignment", id: "a0", reason: "Wrong" },
        "x",
      ),
    ).toThrow("Recorded");
    expect(() =>
      applyWorkspaceAction(
        s,
        worker,
        { type: "save_settings", name: "X", phone: "", payPeriod: "weekly" },
        "x",
      ),
    ).toThrow("Admin");
    const checked = applyDailyAction(
      s,
      cap,
      {
        type: "approve_day",
        employeeId: worker.id,
        workDate: date,
        attendance: "present",
        tasks: tasksFor(s, worker.id).map((a) => ({
          assignmentId: a.id,
          quantity: countFor(s, a.id)?.quantity ?? 0,
          expectedVersion: countFor(s, a.id)?.version ?? 0,
          reason: "",
        })),
      },
      "check",
    );
    expect(() =>
      applyWorkspaceAction(
        checked,
        cap,
        {
          type: "deactivate_assignment",
          id: tasksFor(s, worker.id)[1].id,
          reason: "Wrong",
        },
        "x",
      ),
    ).toThrow("Recorded or checked");
  });
  it("lets captains manage lines only inside their own unit", () => {
    let s = setup();
    const cap = s.employees.find((e) => e.id === "captain")!,
      worker = s.employees.find((e) => e.id === "worker")!,
      other = s.units.find((u) => u.id !== cap.unitId)!;
    s = applyWorkspaceAction(
      s,
      cap,
      { type: "add_line", unitId: cap.unitId, name: "New line" },
      "tl-new1",
    );
    const line = s.lines.find((l) => l.name === "New line")!;
    expect(line.unitId).toBe(cap.unitId);
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "add_line", unitId: cap.unitId, name: "New line" },
        "tl-new2",
      ),
    ).toThrow("already exists");
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "add_line", unitId: other.id, name: "X" },
        "tl-new3",
      ),
    ).toThrow("access");
    expect(() =>
      applyWorkspaceAction(
        s,
        worker,
        { type: "add_line", unitId: cap.unitId, name: "Y" },
        "tl-new4",
      ),
    ).toThrow("access");
    s = applyWorkspaceAction(
      s,
      cap,
      { type: "rename_unit", id: cap.unitId, name: "Renamed" },
      "tl-new5",
    );
    expect(s.units.find((u) => u.id === cap.unitId)!.name).toBe("Renamed");
    s = applyWorkspaceAction(
      s,
      cap,
      { type: "remove_line", id: line.id },
      "tl-new6",
    );
    expect(s.lines.some((l) => l.id === line.id)).toBe(false);
  });
  it("saves categorised styles and adds many tasks for admin only", () => {
    let s = setup();
    const admin = s.employees.find((e) => e.role === "admin")!,
      cap = s.employees.find((e) => e.id === "captain")!;
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "save_style",
        name: "Sleepsuit with cap",
        code: "Z3006",
        category: "Sleepsuit",
        notes: "",
      },
      "st-new",
    );
    const style = s.styles.find((x) => x.code === "Z3006")!;
    expect(style.category).toBe("Sleepsuit");
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "save_style", name: "X", code: "X", category: "", notes: "" },
        "st-x",
      ),
    ).toThrow("Admin");
    expect(() =>
      applyWorkspaceAction(
        s,
        admin,
        {
          type: "save_style",
          name: "Y",
          code: "Z3006",
          category: "",
          notes: "",
        },
        "st-y",
      ),
    ).toThrow("already exists");
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "add_operations",
        styleId: style.id,
        tasks: [
          { name: "Zipper fly O/L", ratePaise: 180 },
          { name: "Shoulder joint O/L", ratePaise: 120 },
        ],
      },
      "ops",
    );
    const ops = s.operations.filter((o) => o.styleId === style.id);
    expect(ops.map((o) => o.sequence)).toEqual([1, 2]);
    expect(ops[1].ratePaise).toBe(120);
  });
  it("prices tasks from seconds at the factory, style or task rate", () => {
    let s = setup();
    const admin = s.employees.find((e) => e.role === "admin")!;
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "save_style",
        name: "Sleepsuit",
        code: "ZP1",
        category: "",
        notes: "",
      },
      "ps",
    );
    const style = s.styles.find((x) => x.code === "ZP1")!;
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "add_operations",
        styleId: style.id,
        tasks: [
          { name: "A", seconds: 18 },
          { name: "B", seconds: 39 },
          { name: "C", seconds: 30, ratePaise: 500 },
        ],
      },
      "po",
    );
    const r = () =>
      Object.fromEntries(
        s.operations
          .filter((o) => o.styleId === style.id)
          .map((o) => [o.name, o.ratePaise]),
      );
    expect(r()).toEqual({ A: 105, B: 228, C: 500 });
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_rate_settings", perMinutePaise: 400 },
      "p1",
    );
    expect(r()).toEqual({ A: 120, B: 260, C: 500 });
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_style_pricing", styleId: style.id, perMinutePaise: 500 },
      "p2",
    );
    expect(r()).toEqual({ A: 150, B: 325, C: 500 });
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_style_pricing", styleId: style.id, perMinutePaise: null },
      "p3",
    );
    const a = s.operations.find(
      (o) => o.name === "A" && o.styleId === style.id,
    )!;
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_task_pricing", id: a.id, ratePaise: 99 },
      "p4",
    );
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_rate_settings", perMinutePaise: 300 },
      "p5",
    );
    expect(r().A).toBe(99);
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_task_pricing", id: a.id, ratePaise: null },
      "p6",
    );
    expect(r().A).toBe(90);
    const cap = s.employees.find((e) => e.id === "captain")!;
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "set_rate_settings", perMinutePaise: 1 },
        "p7",
      ),
    ).toThrow("Admin");
  });
  it("lets a task be added with no price or seconds yet", () => {
    let s = setup();
    const admin = s.employees.find((e) => e.role === "admin")!;
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "save_style",
        name: "Blank",
        code: "ZB1",
        category: "",
        notes: "",
      },
      "bs",
    );
    const style = s.styles.find((x) => x.code === "ZB1")!;
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "add_operations", styleId: style.id, tasks: [{ name: "Hem" }] },
      "bo",
    );
    const op = s.operations.find((o) => o.styleId === style.id)!;
    expect(op.ratePaise).toBe(0);
    expect(op.seconds).toBeUndefined();
    s = applyWorkspaceAction(
      s,
      admin,
      { type: "set_task_pricing", id: op.id, ratePaise: 250 },
      "bp",
    );
    expect(s.operations.find((o) => o.id === op.id)!.ratePaise).toBe(250);
  });
  it("plans styles for a line in order with counts and creates the batch behind them", () => {
    let s = setup();
    const cap = s.employees.find((e) => e.id === "captain")!,
      worker = s.employees.find((e) => e.id === "worker")!,
      admin = s.employees.find((e) => e.role === "admin")!;
    s = applyWorkspaceAction(
      s,
      admin,
      {
        type: "save_style",
        name: "Cap",
        code: "ZC1",
        category: "Cap",
        notes: "",
      },
      "cs",
    );
    const cap1 = s.styles.find((x) => x.code === "ZC1")!,
      other = s.styles.find((x) => x.id !== cap1.id)!;
    const day = factoryDate();
    s = applyWorkspaceAction(
      s,
      cap,
      {
        type: "set_day_plan",
        unitId: cap.unitId,
        workDate: day,
        items: [{ styleId: cap1.id, count: 120 }, { styleId: other.id }],
      },
      "dp",
    );
    const mine = s.dayPlan!.filter(
      (x) => x.unitId === cap.unitId && x.workDate === day,
    );
    expect(mine.map((x) => [x.styleId, x.position, x.count])).toEqual([
      [cap1.id, 0, 120],
      [other.id, 1, undefined],
    ]);
    expect(
      s.lots.some(
        (l) =>
          l.styleId === cap1.id &&
          l.unitId === cap.unitId &&
          l.status === "active",
      ),
    ).toBe(true);
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        {
          type: "set_day_plan",
          unitId: cap.unitId,
          workDate: day,
          items: [{ styleId: cap1.id }, { styleId: cap1.id }],
        },
        "d2",
      ),
    ).toThrow("added once");
    const foreign = s.units.find((u) => u.id !== cap.unitId)!;
    expect(() =>
      applyWorkspaceAction(
        s,
        cap,
        { type: "set_day_plan", unitId: foreign.id, workDate: day, items: [] },
        "d3",
      ),
    ).toThrow("access");
    expect(() =>
      applyWorkspaceAction(
        s,
        worker,
        {
          type: "set_day_plan",
          unitId: worker.unitId,
          workDate: day,
          items: [],
        },
        "d4",
      ),
    ).toThrow("access");
  });
});
