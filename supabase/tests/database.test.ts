import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003";
const cap = "10000000-0000-4000-8000-000000000001",
  taste = "20000000-0000-4000-8000-000000000001",
  pic = "30000000-0000-4000-8000-000000000001";
const capsule = {
  name: "Testkaffee",
  brand: "Testmarke",
  system: "Original",
  favorite: false,
};
const tasting = {
  capsule_id: cap,
  date: "2026-11-15",
  method: "Espresso",
  notes: "",
  tags: [],
  rebuy: "yes",
  aroma: 4,
  intensity: 5,
  acidity: 6,
  bitterness: 7,
  body: 8,
  overall: 9,
};
async function as(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function save(
  kind: string,
  id: string,
  data: unknown,
  version = 0,
  deleted = false,
) {
  return db.query<{ r: any }>(
    "select public.coffee_save_record($1,$2,$3::jsonb,$4,$5) r",
    [kind, id, JSON.stringify(data), version, deleted],
  );
}
async function count(table: string) {
  return (await db.query<{ n: number }>(`select count(*)::int n from ${table}`))
    .rows[0].n;
}
beforeAll(async () => {
  await db.exec(
    `create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  await db.exec(readFileSync("supabase/extension.sql", "utf8"));
  await db.query(
    "insert into auth.users values($1,'a@test.invalid',now()),($2,'b@test.invalid',now()),($3,'c@test.invalid',now())",
    [a, b, c],
  );
}, 30000);
afterAll(() => db.close());
describe.sequential("Postgres RLS, Freigaben und Offline-CAS", () => {
  it("creates private profiles and isolates owners", async () => {
    await as(a);
    expect(await count("coffee_profiles")).toBe(1);
    await save("capsules", cap, capsule);
    await as(b);
    expect(await count("coffee_capsules")).toBe(0);
  });
  it("blocks writes to another owner and cross-owner foreign keys", async () => {
    await as(b);
    await expect(
      save("capsules", cap, { ...capsule, name: "Angriff" }),
    ).rejects.toThrow();
    await expect(save("tastings", taste, tasting)).rejects.toThrow();
  });
  it("enforces complete integer ratings in SQL", async () => {
    await as(a);
    await expect(
      save("tastings", taste, { ...tasting, aroma: 0 }),
    ).rejects.toThrow();
    await expect(
      save("tastings", taste, { ...tasting, overall: 5.5 }),
    ).rejects.toThrow();
    await expect(
      save("tastings", taste, { ...tasting, body: undefined }),
    ).rejects.toThrow();
    await save("tastings", taste, tasting);
  });
  it("retries inserts idempotently and rejects stale overwrites", async () => {
    await as(a);
    expect((await save("capsules", cap, capsule)).rows[0].r.version).toBe(1);
    expect(
      (await save("capsules", cap, { ...capsule, name: "Neu" }, 1)).rows[0].r
        .version,
    ).toBe(2);
    expect(
      (await save("capsules", cap, { ...capsule, name: "Neu" }, 1)).rows[0].r
        .version,
    ).toBe(2);
    await expect(
      save("capsules", cap, { ...capsule, name: "Veraltet" }, 1),
    ).rejects.toThrow("Versionskonflikt");
  });
  it("allows exact-email invitations and only read access", async () => {
    await as(a);
    await db.query("select coffee_invite($1)", ["B@test.invalid"]);
    await as(b);
    expect(await count("coffee_capsules")).toBe(1);
    expect(await count("coffee_tastings")).toBe(0);
    const shared = await db.query<{ value: any }>(
      "select coffee_shared_tastings($1) value",
      [a],
    );
    expect(shared.rows).toHaveLength(1);
    expect(shared.rows[0].value.data).not.toHaveProperty("consumed");
    expect(await count("coffee_profiles")).toBe(2);
    expect(
      (
        await db.query(
          "update coffee_capsules set version=version+1 returning id",
        )
      ).rows,
    ).toHaveLength(0);
    await as(c);
    expect(await count("coffee_capsules")).toBe(0);
  });
  it("authorizes photos by owner path and explicit share", async () => {
    await as(a);
    await save("photos", pic, {
      parent_id: cap,
      path: a + "/picture",
      caption: "Foto",
    });
    await db.query(
      "insert into storage.objects(bucket_id,name) values('coffee-photos',$1)",
      [a + "/picture"],
    );
    await as(b);
    expect(await count("storage.objects")).toBe(1);
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values('coffee-photos',$1)",
        [a + "/injected"],
      ),
    ).rejects.toThrow();
    await as(c);
    expect(await count("storage.objects")).toBe(0);
  });
  it("revokes data and image access immediately", async () => {
    await as(a);
    await db.query("delete from coffee_shares where owner_id=$1", [a]);
    await as(b);
    expect(await count("coffee_capsules")).toBe(0);
    expect(await count("storage.objects")).toBe(0);
    expect(
      (await db.query("select coffee_shared_tastings($1)", [a])).rows,
    ).toHaveLength(0);
    expect(await count("coffee_profiles")).toBe(1);
  });
  it("keeps stock immutable and private even when a profile is shared", async () => {
    await as(a);
    await save("inventory", "40000000-0000-4000-8000-000000000001", {
      capsule_id: cap,
      type: "opening",
      amount: 10,
      note: "Anfangsbestand",
      threshold: 5,
    });
    await db.query("select coffee_invite($1)", ["b@test.invalid"]);
    await as(b);
    expect(await count("coffee_capsules")).toBe(1);
    expect(await count("coffee_inventory")).toBe(0);
    await expect(
      save("inventory", "40000000-0000-4000-8000-000000000002", {
        capsule_id: cap,
        type: "purchase",
        amount: 5,
        note: "",
      }),
    ).rejects.toThrow();
    await as(a);
    await expect(
      db.query("update coffee_inventory set data=data"),
    ).rejects.toThrow();
    await expect(db.query("delete from coffee_inventory")).rejects.toThrow();
  });
  it("books tasting changes and reversals atomically without duplicate retries", async () => {
    await as(a);
    const balance = async () =>
      (
        await db.query<{ n: number }>(
          "select sum((data->>'amount')::int)::int n from coffee_inventory where capsule_id=$1",
          [cap],
        )
      ).rows[0].n;
    await save("tastings", taste, { ...tasting, consumed: 1 }, 1);
    expect(await balance()).toBe(9);
    await save("tastings", taste, { ...tasting, consumed: 1 }, 1);
    expect(await balance()).toBe(9);
    await save("tastings", taste, { ...tasting, consumed: 3 }, 2);
    expect(await balance()).toBe(7);
    await expect(
      save("tastings", taste, { ...tasting, consumed: 9 }, 2),
    ).rejects.toThrow();
    expect(await balance()).toBe(7);
    await save("tastings", taste, { ...tasting, consumed: 3 }, 3, true);
    expect(await balance()).toBe(10);
    await save("tastings", taste, { ...tasting, consumed: 3 }, 3, true);
    expect(await balance()).toBe(10);
  });
  it("rejects forged tasting ledger entries and a second opening balance", async () => {
    await as(a);
    await expect(
      save("inventory", "40000000-0000-4000-8000-000000000004", {
        capsule_id: cap,
        type: "tasting",
        amount: 5,
        note: "",
      }),
    ).rejects.toThrow();
    await expect(
      save("inventory", "40000000-0000-4000-8000-000000000005", {
        capsule_id: cap,
        type: "opening",
        amount: 5,
        note: "",
      }),
    ).rejects.toThrow();
    await expect(
      save("inventory", "40000000-0000-4000-8000-000000000006", {
        capsule_id: cap,
        type: "purchase",
        amount: 2.5,
        note: "",
      }),
    ).rejects.toThrow();
  });
  it("normalizes barcodes and prevents duplicate assignments within an owner", async () => {
    await as(a);
    const id = "10000000-0000-4000-8000-000000000002";
    await save("capsules", id, { ...capsule, barcodes: ["036000291452"] });
    const r = await db.query<{ data: any }>(
      "select data from coffee_capsules where id=$1",
      [id],
    );
    expect(r.rows[0].data.barcodes).toEqual(["0036000291452"]);
    await expect(
      save("capsules", "10000000-0000-4000-8000-000000000003", {
        ...capsule,
        barcodes: ["0036000291452"],
      }),
    ).rejects.toThrow();
    await expect(
      save("capsules", "10000000-0000-4000-8000-000000000004", {
        ...capsule,
        barcodes: ["0036000291453"],
      }),
    ).rejects.toThrow();
    await expect(
      save("tastings", "20000000-0000-4000-8000-000000000009", {
        ...tasting,
        capsule_id: id,
        consumed: 1,
      }),
    ).rejects.toThrow("Anfangsbestand");
    expect(
      (
        await db.query("select id from coffee_tastings where id=$1", [
          "20000000-0000-4000-8000-000000000009",
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("keeps discovery quotas server-only and enforces the daily per-user limit", async () => {
    await as(a);
    await expect(
      db.query("select coffee_reserve_discovery($1,$2)", [a, "ai"]),
    ).rejects.toThrow();
    await db.exec("reset role;set role service_role;");
    for (let i = 0; i < 10; i++)
      await db.query("select coffee_reserve_discovery($1,$2)", [a, "ai"]);
    await expect(
      db.query("select coffee_reserve_discovery($1,$2)", [a, "ai"]),
    ).rejects.toThrow("Tageslimit");
    await db.query("select coffee_reserve_discovery($1,$2)", [b, "ai"]);
  });
  it("supports tombstones and rejects new tastings of deleted capsules", async () => {
    await as(a);
    await save("capsules", cap, { ...capsule, name: "Neu" }, 2, true);
    await expect(
      save("tastings", "20000000-0000-4000-8000-000000000002", tasting),
    ).rejects.toThrow();
  });
  it("denies anonymous table and RPC access", async () => {
    await db.exec("reset role;set role anon;");
    await expect(db.query("select * from coffee_capsules")).rejects.toThrow();
    await expect(
      db.query("select coffee_invite('a@test.invalid')"),
    ).rejects.toThrow();
  });
});
