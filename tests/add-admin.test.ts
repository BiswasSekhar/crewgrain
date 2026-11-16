import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const add = (n: number, code: string, name = "Second Admin") =>
  db.query("select public.add_admin($1,$1,$2,$3)", [id(n), code, name]);

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  for (const n of [1, 2, 3, 4])
    await db.query("insert into auth.users values($1)", [id(n)]);
}, 60000);
afterAll(() => db.close());

describe("adding another admin", () => {
  it("needs the first admin to exist already", async () => {
    await expect(add(2, "A002")).rejects.toThrow(/first admin/);
    await db.query(
      "select public.bootstrap_admin($1,$1,'A001','First Admin','Main Factory')",
      [id(1)],
    );
  });
  it("adds an admin with a unit membership and an audit row", async () => {
    await add(2, "a002");
    const row = (
      await db.query<{ role: string; employee_id: string; member: string }>(
        "select p.role,p.employee_id,m.role member from public.profiles p join public.unit_memberships m on m.profile_id=p.id where p.id=$1",
        [id(2)],
      )
    ).rows[0];
    expect(row).toEqual({ role: "admin", employee_id: "A002", member: "admin" });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.audit_log where action='add_admin' and entity_id=$1",
          [id(2)],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects a repeated or invalid ID and a blank name", async () => {
    await expect(add(3, "A002")).rejects.toThrow(/already used/);
    await expect(add(3, "bad id!")).rejects.toThrow(/valid ID/);
    await expect(add(3, "A003", "   ")).rejects.toThrow(/valid ID and name/);
  });
  it("cannot be called by a signed-in user", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id(1),
    ]);
    await db.exec("set role authenticated");
    try {
      await expect(add(4, "A004")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
