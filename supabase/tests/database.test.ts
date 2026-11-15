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
  await db.exec(readFileSync("supabase/households.sql", "utf8"));
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

let home: string,
  secondHome: string,
  houseCapsule: string,
  reviewA: string,
  reviewB: string;
const id = () => crypto.randomUUID();
async function action(action: string, args: Record<string, unknown> = {}) {
  const names = ["p_action", ...Object.keys(args)],
    values = [action, ...Object.values(args)];
  const sql =
    "select coffee_household_action(" +
    names.map((n, i) => n + " => $" + (i + 1)).join(",") +
    ") value";
  return (await db.query<{ value: any }>(sql, values)).rows[0].value;
}
async function scopedSave(
  kind: string,
  recordId: string,
  data: unknown,
  household: string | null,
  version = 0,
  deleted = false,
) {
  return (
    await db.query<{ value: any }>(
      "select coffee_save_record($1,$2,$3::jsonb,$4,$5,$6) value",
      [kind, recordId, JSON.stringify(data), version, deleted, household],
    )
  ).rows[0].value;
}
async function state() {
  return (
    await db.query<{ value: any }>("select coffee_household_state() value")
  ).rows[0].value;
}
async function visible(table: string, recordId: string) {
  return (
    await db.query("select id from " + table + " where id=$1", [recordId])
  ).rows.length;
}
async function balance(capsule: string) {
  return (
    await db.query<{ value: number }>(
      "select coalesce(sum((data->>'amount')::int),0)::int value from coffee_inventory where capsule_id=$1",
      [capsule],
    )
  ).rows[0].value;
}
describe.sequential("Haushalte, Autorenrechte und sichere Übernahme", () => {
  it("creates a household and requires invitation acceptance before granting membership", async () => {
    await as(a);
    home = (await action("create", { p_name: "Unsere Kaffeebar" })).id;
    await action("invite", { p_household: home, p_email: "b@test.invalid" });
    await as(b);
    expect(await visible("coffee_households", home)).toBe(0);
    const pending = await state();
    expect(pending.invitations).toHaveLength(1);
    await expect(
      db.query(
        "insert into coffee_household_members(household_id,user_id) values($1,$2)",
        [home, b],
      ),
    ).rejects.toThrow();
    await expect(
      action("rename", { p_household: home, p_name: "Angriff" }),
    ).rejects.toThrow();
    await action("accept", { p_invitation: pending.invitations[0].id });
    expect(await visible("coffee_households", home)).toBe(1);
    await as(c);
    secondHome = (await action("create", { p_name: "Anderer Haushalt" })).id;
    expect(await visible("coffee_households", home)).toBe(0);
  });
  it("shares catalog and stock but preserves personal review authorship", async () => {
    await as(a);
    houseCapsule = id();
    await scopedSave(
      "capsules",
      houseCapsule,
      { ...capsule, name: "Haushaltskaffee", barcodes: ["4006381333931"] },
      home,
    );
    await scopedSave(
      "inventory",
      id(),
      {
        capsule_id: houseCapsule,
        type: "opening",
        amount: 20,
        note: "Gemeinsam",
      },
      home,
    );
    reviewA = id();
    await scopedSave(
      "tastings",
      reviewA,
      { ...tasting, capsule_id: houseCapsule, overall: 9, consumed: 1 },
      home,
    );
    await as(b);
    expect(await visible("coffee_capsules", houseCapsule)).toBe(1);
    expect(await balance(houseCapsule)).toBe(19);
    reviewB = id();
    await scopedSave(
      "tastings",
      reviewB,
      { ...tasting, capsule_id: houseCapsule, overall: 6, consumed: 2 },
      home,
    );
    expect(await balance(houseCapsule)).toBe(17);
    await expect(
      scopedSave(
        "tastings",
        reviewA,
        { ...tasting, capsule_id: houseCapsule, overall: 1, consumed: 0 },
        home,
        1,
      ),
    ).rejects.toThrow("eigene");
    await scopedSave(
      "capsules",
      houseCapsule,
      { ...capsule, name: "Gemeinsam bearbeitet", barcodes: ["4006381333931"] },
      home,
      1,
    );
    const author = (
      await db.query<{ user_id: string }>(
        "select user_id from coffee_capsules where id=$1",
        [houseCapsule],
      )
    ).rows[0].user_id;
    expect(author).toBe(a);
    await expect(
      scopedSave(
        "capsules",
        houseCapsule,
        { ...capsule, name: "Archiviert" },
        home,
        2,
        true,
      ),
    ).rejects.toThrow();
    await as(c);
    expect(await visible("coffee_capsules", houseCapsule)).toBe(0);
    expect(await balance(houseCapsule)).toBe(0);
  });
  it("keeps favourites personal and prevents cross-scope references", async () => {
    await as(a);
    const pref = id();
    await scopedSave(
      "preferences",
      pref,
      { capsule_id: houseCapsule, favorite: true },
      home,
    );
    const privateId = id();
    await scopedSave(
      "capsules",
      privateId,
      { ...capsule, name: "Privat" },
      null,
    );
    await expect(
      scopedSave("tastings", id(), { ...tasting, capsule_id: privateId }, home),
    ).rejects.toThrow("Bereich");
    await as(b);
    expect(await visible("coffee_preferences", pref)).toBe(0);
    await scopedSave(
      "preferences",
      id(),
      { capsule_id: houseCapsule, favorite: false },
      home,
    );
    await expect(
      scopedSave(
        "inventory",
        id(),
        { capsule_id: houseCapsule, type: "purchase", amount: 10, note: "" },
        secondHome,
      ),
    ).rejects.toThrow();
  });
  it("does not extend profile shares to household data or let members edit others photos", async () => {
    await as(a);
    await db.query("select coffee_invite($1)", ["c@test.invalid"]);
    const photo = id();
    await scopedSave(
      "photos",
      photo,
      {
        parent_id: houseCapsule,
        path: a + "/house-photo",
        caption: "Haushalt",
      },
      home,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('coffee-photos',$1)",
      [a + "/house-photo"],
    );
    await as(b);
    expect(await visible("coffee_photos", photo)).toBe(1);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          a + "/house-photo",
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      scopedSave(
        "photos",
        photo,
        {
          parent_id: houseCapsule,
          path: a + "/house-photo",
          caption: "Andere Person",
        },
        home,
        1,
      ),
    ).rejects.toThrow();
    await expect(
      scopedSave(
        "photos",
        id(),
        {
          parent_id: reviewA,
          path: b + "/wrong-parent",
          caption: "Fremde Bewertung",
        },
        home,
      ),
    ).rejects.toThrow();
    await as(c);
    expect(await visible("coffee_capsules", houseCapsule)).toBe(0);
    expect(await visible("coffee_photos", photo)).toBe(0);
    const shared = (
      await db.query<{ value: any }>(
        "select coffee_shared_tastings($1) value",
        [a],
      )
    ).rows;
    expect(shared.some((r) => r.value.id === reviewA)).toBe(false);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          a + "/house-photo",
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects duplicate barcodes across different household authors", async () => {
    await as(b);
    await expect(
      scopedSave(
        "capsules",
        id(),
        { ...capsule, barcodes: ["4006381333931"] },
        home,
      ),
    ).rejects.toThrow("Barcode");
    await as(c);
    await scopedSave(
      "capsules",
      id(),
      { ...capsule, barcodes: ["4006381333931"] },
      secondHome,
    );
  });
  it("revokes all household access on removal while preserving attributed history", async () => {
    await as(a);
    await action("remove", { p_household: home, p_user: b });
    await as(b);
    expect(await visible("coffee_capsules", houseCapsule)).toBe(0);
    expect(await visible("coffee_tastings", reviewB)).toBe(0);
    expect(await balance(houseCapsule)).toBe(0);
    await expect(
      scopedSave(
        "tastings",
        reviewB,
        { ...tasting, capsule_id: houseCapsule, consumed: 0 },
        home,
        1,
      ),
    ).rejects.toThrow("Zugriff");
    await as(a);
    expect(await visible("coffee_tastings", reviewB)).toBe(1);
    expect(
      (await state()).households
        .find((h: any) => h.id === home)
        .authors.some((p: any) => p.user_id === b),
    ).toBe(true);
  });
  it("requires a successor before the owner can leave and transfers administration explicitly", async () => {
    await as(a);
    await expect(action("leave", { p_household: home })).rejects.toThrow(
      "übertragen",
    );
    await action("invite", { p_household: home, p_email: "b@test.invalid" });
    await as(b);
    await action("accept", { p_invitation: (await state()).invitations[0].id });
    await expect(
      action("remove", { p_household: home, p_user: a }),
    ).rejects.toThrow("Haushaltsverwaltung");
    await as(a);
    await action("transfer_owner", { p_household: home, p_user: b });
    await action("leave", { p_household: home });
    expect(await visible("coffee_households", home)).toBe(0);
    await as(b);
    await action("rename", {
      p_household: home,
      p_name: "Gemeinsames Zuhause",
    });
    expect((await state()).households[0].owner_id).toBe(b);
  });
  it("imports private reviews and transfers stock exactly once without double consumption", async () => {
    await as(c);
    const source = id(),
      sourceReview = id(),
      sourcePhoto = id();
    await scopedSave(
      "capsules",
      source,
      { ...capsule, name: "Importiert", favorite: true },
      null,
    );
    await scopedSave(
      "inventory",
      id(),
      { capsule_id: source, type: "opening", amount: 12, note: "" },
      null,
    );
    await scopedSave(
      "tastings",
      sourceReview,
      { ...tasting, capsule_id: source, consumed: 2 },
      null,
    );
    await scopedSave(
      "photos",
      sourcePhoto,
      {
        parent_id: source,
        path: c + "/import-photo",
        caption: "Privat und Haushalt",
      },
      null,
    );
    const operation = id();
    const run = async () =>
      (
        await db.query<{ value: any }>(
          "select coffee_import_household($1,$2,$3,null,1,true) value",
          [operation, source, secondHome],
        )
      ).rows[0].value;
    const result = await run();
    expect(result.transferred).toBe(10);
    expect(await balance(source)).toBe(0);
    expect(await balance(result.capsule_id)).toBe(10);
    expect(
      (
        await db.query<{ data: any }>(
          "select data from coffee_tastings where household_id=$1 and capsule_id=$2",
          [secondHome, result.capsule_id],
        )
      ).rows[0].data.consumed,
    ).toBe(0);
    expect(
      (
        await db.query("select id from coffee_tastings where id=$1", [
          sourceReview,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(await run()).toEqual(result);
    expect(await balance(result.capsule_id)).toBe(10);
    await scopedSave(
      "photos",
      sourcePhoto,
      {
        parent_id: source,
        path: c + "/import-photo",
        caption: "Privat und Haushalt",
      },
      null,
      1,
      true,
    );
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select coffee_can_delete_photo($1) allowed",
          [c + "/import-photo"],
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it("rolls back an import entirely when the source stock is negative", async () => {
    await as(c);
    const source = id();
    await scopedSave(
      "capsules",
      source,
      { ...capsule, name: "Negativer Bestand" },
      null,
    );
    await scopedSave(
      "inventory",
      id(),
      { capsule_id: source, type: "opening", amount: 0, note: "" },
      null,
    );
    await scopedSave(
      "inventory",
      id(),
      { capsule_id: source, type: "consume", amount: -1, note: "" },
      null,
    );
    const before = await count("coffee_capsules");
    await expect(
      db.query("select coffee_import_household($1,$2,$3,null,1,true)", [
        id(),
        source,
        secondHome,
      ]),
    ).rejects.toThrow("negativen");
    expect(await count("coffee_capsules")).toBe(before);
  });
});
