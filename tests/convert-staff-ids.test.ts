import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const convert = () =>
  db.exec(
    readFileSync(
      new URL("../supabase/data/convert-staff-ids.sql", import.meta.url),
      "utf8",
    ),
  );
const ids = async () =>
  Object.fromEntries(
    (
      await db.query<{ name: string; employee_id: string }>(
        "select name,employee_id from public.profiles order by name",
      )
    ).rows.map((r) => [r.name, r.employee_id]),
  );

const staff: [number, string, string, string, boolean][] = [
  [1, "Crewgrain", "A001", "admin", false],
  [2, "Crewgrain Admin", "A002", "admin", false],
  [3, "K Worker", "1001", "worker", true],
  [4, "J Captain", "1002", "captain", false],
  [5, "S Worker One", "1005", "worker", false],
  [6, "S Worker Two", "1006", "worker", false],
  [7, "S Worker Three", "1008", "worker", false],
  [8, "രവി", "1010", "worker", false],
  [9, "M Example", "M123", "worker", false],
];

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  for (const [n, name, code, role, deleted] of staff) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role,deleted_at,active) values($1,$1,$2,$3,$4,$5,$6)",
      [id(n), code, name, role, deleted ? new Date() : null, !deleted],
    );
  }
}, 60000);
afterAll(() => db.close());

describe("converting staff to the new ID format", () => {
  it("gives every four-digit staff ID a letter and three digits", async () => {
    await convert();
    const now = await ids();
    expect(now["K Worker"]).toMatch(/^K\d{3}$/);
    expect(now["J Captain"]).toMatch(/^J\d{3}$/);
    expect(now["S Worker One"]).toMatch(/^S\d{3}$/);
    expect(now["S Worker Two"]).toMatch(/^S\d{3}$/);
    expect(now["S Worker Three"]).toMatch(/^S\d{3}$/);
    // A name with no A-Z letter uses E.
    expect(now["രവി"]).toMatch(/^E\d{3}$/);
  });
  it("leaves admins and already-converted staff alone", async () => {
    const now = await ids();
    expect(now["Crewgrain"]).toBe("A001");
    expect(now["Crewgrain Admin"]).toBe("A002");
    expect(now["M Example"]).toBe("M123");
  });
  it("never repeats an ID, deleted staff included", async () => {
    const all = Object.values(await ids());
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((v) => /^[A-Z0-9-]{2,24}$/.test(v))).toBe(true);
  });
  it("changes nothing when run again", async () => {
    const before = await ids();
    await convert();
    expect(await ids()).toEqual(before);
  });
});
