import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { findStaff } from "../src/lib/staff-access";
import type { Employee } from "../src/domain/types";

const db = new PGlite();
const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let token = 1;
async function login(identifier: string) {
  return (
    await db.query<{ staff_sign_in: string | null }>(
      "select public.staff_sign_in($1,$2)",
      [identifier, (token++).toString(16).padStart(64, "0")],
    )
  ).rows[0].staff_sign_in;
}
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const file of [
    "202611070001_foundation.sql",
    "202611070002_daily_workflow.sql",
    "202611100010_staff_id_login.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.query(
    "insert into public.units(id,name,code) values($1,'Line 1','L1'),($2,'Line 2','L2')",
    [id(1), id(2)],
  );
  for (const [n, role, phone] of [
    [3, "admin", "9000000000"],
    [4, "captain", "+91 98765 43210"],
    [5, "worker", "9123456789"],
    [6, "worker", "9123456789"],
    [7, "worker", "9000000007"],
    [8, "worker", "9000000008"],
  ]) {
    await db.query(
      "insert into public.profiles(id,employee_id,name,role,phone,active) values($1,$2,$2,$3,$4,$5)",
      [id(Number(n)), `ZV-${n}`, role, phone, n !== 7],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,role) values($1,$2,$3)",
      [id(Number(n)), id(n === 8 ? 2 : 1), role],
    );
  }
  await db.query("update public.units set active=false where id=$1", [id(2)]);
}, 30000);
afterAll(() => db.close());

describe("ID or phone staff login", () => {
  it("signs in staff by case-insensitive ID and normalized Indian phone", async () => {
    const first = await login(" zv-4 ");
    expect(first).toBeTruthy();
    expect(await login("9876543210")).toBeTruthy();
    expect(await login("+91 (98765) 43210")).toBeTruthy();
    const rows = await db.query<{ profile_id: string }>(
      "select profile_id from public.linked_phones where id=$1",
      [first],
    );
    expect(rows.rows[0].profile_id).toBe(id(4));
  });
  it("rejects admin, inactive profiles, inactive lines and unknown identities", async () => {
    for (const identifier of [
      "ZV-3",
      "9000000000",
      "ZV-7",
      "9000000007",
      "ZV-8",
      "missing",
      "",
      "9".repeat(41),
    ])
      expect(await login(identifier)).toBeNull();
  });
  it("rejects shared numbers while keeping each employee ID usable", async () => {
    expect(await login("9123456789")).toBeNull();
    expect(await login("ZV-5")).toBeTruthy();
    expect(await login("ZV-6")).toBeTruthy();
  });
  it("stores only random token hashes and does not revoke other phones on login", async () => {
    const before = await db.query<{ count: number }>(
      "select count(*)::int as count from public.linked_phones where profile_id=$1 and revoked_at is null",
      [id(4)],
    );
    await login("ZV-4");
    const after = await db.query<{ count: number }>(
      "select count(*)::int as count from public.linked_phones where profile_id=$1 and revoked_at is null",
      [id(4)],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count + 1);
    expect(
      (
        await db.query(
          "select * from public.audit_log where action='staff_signed_in' and new_record::text like '%token%'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("keeps staff sign-in and throttling RPCs service-only", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(login("ZV-4")).rejects.toThrow("permission denied");
        await expect(
          db.query("select public.reserve_staff_login($1)", [
            "STAFF-" + "a".repeat(64),
          ]),
        ).rejects.toThrow("permission denied");
      } finally {
        await db.exec("reset role");
      }
    }
    await db.exec("set role service_role");
    try {
      expect(await login("ZV-4")).toBeTruthy();
    } finally {
      await db.exec("reset role");
    }
  });
  it("throttles a source after 60 attempts and resets its time window", async () => {
    const key = "STAFF-" + "a".repeat(64);
    const reserve = async () =>
      (
        await db.query<{ reserve_staff_login: boolean }>(
          "select public.reserve_staff_login($1)",
          [key],
        )
      ).rows[0].reserve_staff_login;
    for (let n = 0; n < 60; n++) expect(await reserve()).toBe(true);
    expect(await reserve()).toBe(false);
    await db.query(
      "update public.login_attempts set window_start=now()-interval '16 minutes' where employee_id=$1",
      [key],
    );
    expect(await reserve()).toBe(true);
  });
});

it("demo identity lookup follows the same staff-only matching rules", () => {
  const people = [
    {
      id: "w",
      employeeId: "0011",
      phone: "+91 98765 43210",
      active: true,
      role: "worker",
    },
    { id: "a", employeeId: "ADMIN", active: true, role: "admin" },
  ] as Employee[];
  expect(findStaff(people, "0011").id).toBe("w");
  expect(findStaff(people, "9876543210").id).toBe("w");
  expect(() => findStaff(people, "ADMIN")).toThrow();
  expect(() =>
    findStaff([...people, { ...people[0], id: "duplicate" }], "9876543210"),
  ).toThrow();
});
