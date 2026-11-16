import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = "ab".repeat(32);
async function as(n: number, fn: () => Promise<unknown>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const seen = async (n: number) =>
  (
    await db.query<{ t: string }>(
      "select last_seen_at::text t from public.staff_presence where profile_id=$1",
      [id(n)],
    )
  ).rows[0]?.t;
const back = (n: number, interval: string) =>
  db.query(
    `update public.staff_presence set last_seen_at=now()-interval '${interval}' where profile_id=$1`,
    [id(n)],
  );
const clear = () => db.exec("delete from public.staff_presence");
const touch = (n: number) =>
  db.query("select private.touch_presence($1)", [id(n)]);
const snapshot = async (n: number) =>
  (
    (await as(n, () => db.query("select public.get_app_snapshot() s"))) as {
      rows: { s: any }[];
    }
  ).rows[0].s;
async function phone(hashValue: string) {
  await db.exec("set role service_role");
  try {
    return (
      await db.query<{ r: any }>(
        "select public.phone_request($1,'snapshot','{}'::jsonb) r",
        [hashValue],
      )
    ).rows[0].r;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  await db.exec(
    `insert into public.units(id,name,code) values('${id(4)}','Line 1','U01');insert into public.lines(id,unit_id,name) values('${id(5)}','${id(4)}','Line 1');`,
  );
  for (const [n, role] of [
    [1, "admin"],
    [2, "captain"],
    [3, "worker"],
    [4, "worker"],
  ] as const) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query(
      "insert into public.profiles(id,auth_user_id,employee_id,name,role) values($1,$1,$2,$2,$3)",
      [id(n), `PR-${n}`, role],
    );
    await db.query(
      "insert into public.unit_memberships(profile_id,unit_id,line_id,role) values($1,$2,$3,$4)",
      [id(n), id(4), id(5), role],
    );
  }
  await db.query(
    "insert into public.linked_phones(profile_id,token_hash) values($1,$2)",
    [id(3), hash],
  );
}, 60000);
afterAll(() => db.close());

describe("staff presence", () => {
  it("a touch writes a row", async () => {
    await clear();
    await touch(3);
    expect(await seen(3)).toBeTruthy();
  });
  it("a second touch inside a minute leaves last_seen_at alone", async () => {
    await clear();
    await touch(3);
    await back(3, "30 seconds");
    const before = await seen(3);
    await touch(3);
    expect(await seen(3)).toBe(before);
  });
  it("a touch after a minute moves it forward", async () => {
    await clear();
    await touch(3);
    await back(3, "2 minutes");
    const before = await seen(3);
    await touch(3);
    expect(await seen(3)).not.toBe(before);
    const fresh = await db.query<{ ok: boolean }>(
      "select last_seen_at>now()-interval '10 seconds' ok from public.staff_presence where profile_id=$1",
      [id(3)],
    );
    expect(fresh.rows[0].ok).toBe(true);
  });
  it("public.touch_presence works for a signed-in user and is refused for anon", async () => {
    await clear();
    await as(2, () => db.query("select public.touch_presence()"));
    expect(await seen(2)).toBeTruthy();
    await db.exec("set role anon");
    try {
      await expect(db.query("select public.touch_presence()")).rejects.toThrow(
        /permission denied/i,
      );
      await expect(
        db.query("select private.touch_presence($1)", [id(3)]),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("signed-in callers cannot read the table directly", async () => {
    await expect(
      as(1, () => db.query("select * from public.staff_presence")),
    ).rejects.toThrow(/permission denied/i);
  });
  it("phone_request still answers and records presence for the device's profile", async () => {
    await clear();
    const result = await phone(hash);
    expect(result.actorId).toBe(id(3));
    expect(result.presence).toBeUndefined();
    expect(await seen(3)).toBeTruthy();
    expect(await seen(4)).toBeUndefined();
  });
  it("an unlinked phone is still refused and records nothing", async () => {
    await clear();
    await expect(phone("cd".repeat(32))).rejects.toThrow(/not linked/i);
    expect(
      (await db.query("select 1 from public.staff_presence")).rows,
    ).toHaveLength(0);
  });
  it("a failing touch cannot break phone_request", async () => {
    await clear();
    await db.exec(
      "alter table public.staff_presence rename to staff_presence_x",
    );
    try {
      expect((await phone(hash)).actorId).toBe(id(3));
    } finally {
      await db.exec(
        "alter table public.staff_presence_x rename to staff_presence",
      );
    }
  });
  it("only admins get presence, limited to the last 7 days", async () => {
    await clear();
    for (const n of [2, 3, 4]) await touch(n);
    await back(4, "8 days");
    const admin = await snapshot(1);
    expect(admin.presence).toHaveLength(2);
    expect(admin.presence.map((p: any) => p.profileId).sort()).toEqual(
      [id(2), id(3)].sort(),
    );
    expect(admin.presence[0]).toEqual({
      profileId: expect.any(String),
      lastSeenAt: expect.any(String),
    });
    expect(admin.employees.length).toBeGreaterThan(0);
    expect((await snapshot(2)).presence).toBeUndefined();
    expect((await snapshot(3)).presence).toBeUndefined();
  });
  it("prune_history removes presence older than 30 days", async () => {
    await clear();
    for (const n of [3, 4]) await touch(n);
    await back(4, "31 days");
    const r = (await db.query<{ r: any }>("select private.prune_history(90) r"))
      .rows[0].r;
    expect(r.presenceDeleted).toBe(1);
    expect(await seen(3)).toBeTruthy();
    expect(await seen(4)).toBeUndefined();
  });
});
