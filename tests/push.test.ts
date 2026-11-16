import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pushTarget, pushTokenPattern, scrub } from "../src/lib/push-core";

const db = new PGlite();
const id = (n: number) =>
  `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tok = (s: string) => `ExponentPushToken[${s}]`;
async function as(n: number | null, role: string, fn: () => Promise<unknown>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    n ? id(n) : "",
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const register = (t: string, p = "android") =>
  db.query("select public.register_push_token($1,$2)", [t, p]);
const count = async (n: number) =>
  Number(
    (
      await db.query<{ c: string }>(
        "select count(*) c from public.push_tokens where profile_id=$1",
        [id(n)],
      )
    ).rows[0].c,
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
  for (const [n, role] of [
    [1, "admin"],
    [2, "captain"],
    [3, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `ZV-${n}`, role],
    );
  }
}, 60000);
afterAll(() => db.close());

describe("push token storage", () => {
  it("closes the tables to anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"])
      for (const sql of [
        "select * from public.push_tokens",
        "insert into public.push_tokens(profile_id,token) values('" +
          id(1) +
          "','" +
          tok("abc") +
          "')",
        "delete from public.push_tokens",
        "select * from public.push_rate",
      ])
        await as(1, role, async () =>
          expect(db.query(sql)).rejects.toThrow(/permission denied/),
        );
  });
  it("keeps the service functions away from signed-in users", async () => {
    await as(1, "authenticated", async () => {
      await expect(
        db.query("select public.push_recipients('report_submitted',$1)", [
          id(2),
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select public.service_register_push_token($1,$2,'android')", [
          id(3),
          tok("x"),
        ]),
      ).rejects.toThrow(/permission denied/);
    });
    await as(null, "anon", async () =>
      expect(register(tok("anon1"))).rejects.toThrow(),
    );
  });
  it("validates the token format and platform", async () => {
    await as(1, "authenticated", async () => {
      for (const bad of [
        "",
        "abc",
        "ExponentPushToken[]",
        "ExponentPushToken[a b]",
        "ExpoPushToken[abc]",
      ])
        await expect(register(bad)).rejects.toThrow(/Invalid push token/);
      await expect(register(tok("ok1"), "toaster")).rejects.toThrow(
        /Invalid platform/,
      );
      await register(tok("ok1"));
    });
    expect(await count(1)).toBe(1);
  });
  it("registers only for the caller and keeps the newest three", async () => {
    await as(1, "authenticated", async () => {
      for (const s of ["a2", "a3", "a4", "a5"]) {
        await register(tok(s));
      }
    });
    expect(await count(1)).toBe(3);
    expect(await count(2)).toBe(0);
    const kept = (
      await db.query<{ token: string }>(
        "select token from public.push_tokens where profile_id=$1",
        [id(1)],
      )
    ).rows.map((r) => r.token);
    expect(kept).toContain(tok("a5"));
    expect(kept).not.toContain(tok("ok1"));
  });
  it("moves a token to the newest profile instead of duplicating it", async () => {
    await as(2, "authenticated", () => register(tok("a5")));
    expect(await count(2)).toBe(1);
    expect(await count(1)).toBe(2);
  });
  it("derives recipients on the server and removes dead tokens", async () => {
    const admins = (
      await db.query<{ r: string[] }>(
        "select public.push_recipients('report_submitted',$1) r",
        [id(2)],
      )
    ).rows[0].r;
    expect(admins.sort()).toEqual([tok("a3"), tok("a4")].sort());
    // A worker may not trigger an admin report notification.
    expect(
      (
        await db.query<{ r: string[] }>(
          "select public.push_recipients('report_submitted',$1) r",
          [id(3)],
        )
      ).rows[0].r,
    ).toEqual([]);
    // Unknown events and unapproved days notify nobody.
    expect(
      (
        await db.query<{ r: string[] }>(
          "select public.push_recipients('day_approved',$1,$2) r",
          [id(2), id(3)],
        )
      ).rows[0].r,
    ).toEqual([]);
    const removed = await db.query<{ n: number }>(
      "select public.remove_push_tokens($1) n",
      [[tok("a3")]],
    );
    expect(removed.rows[0].n).toBe(1);
  });
  it("rate limits a caller", async () => {
    let allowed = 0;
    for (let i = 0; i < 35; i++)
      if (
        (
          await db.query<{ ok: boolean }>(
            "select public.push_rate_ok($1,30) ok",
            [id(2)],
          )
        ).rows[0].ok
      )
        allowed++;
    expect(allowed).toBe(30);
  });
});

describe("client helpers", () => {
  it("matches the same token pattern as the database", () => {
    expect(pushTokenPattern.test(tok("a-b_C1"))).toBe(true);
    expect(pushTokenPattern.test("ExponentPushToken[a b]")).toBe(false);
  });
  it("only opens known screens from a notification", () => {
    expect(pushTarget({ view: "approvals" })).toEqual({ view: "approvals" });
    expect(pushTarget({ view: "../../admin" })).toBeNull();
    expect(pushTarget(null)).toBeNull();
  });
  it("scrubs personal data from monitoring text", () => {
    const text = scrub("sign in 9876543210 ZV-12 a@b.com");
    expect(text).not.toMatch(/9876543210|ZV-12|a@b\.com/);
  });
});
