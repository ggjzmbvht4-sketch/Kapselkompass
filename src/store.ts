import { openDB } from "idb";
import { supabase, sessionClient } from "./backend";
import { emptyHouseholds, type HouseholdState } from "./households";
import type { Kind, LocalRow, RecordData, Row } from "./domain";
const STORE = "records_scoped";
const db = openDB("kapselkompass", 2, {
  upgrade(db, oldVersion, _new, tx) {
    if (oldVersion < 1) db.createObjectStore("records", { keyPath: "id" });
    if (oldVersion < 2) {
      const next = db.createObjectStore(STORE, { keyPath: "cache_key" });
      db.createObjectStore("context", { keyPath: "user" });
      void tx
        .objectStore("records")
        .getAll()
        .then((rows) => {
          for (const row of rows)
            void next.put({
              ...row,
              cache_user: row.user_id,
              cache_key: row.user_id + ":" + row.id,
            });
        });
    }
  },
});
const key = (user: string, id: string) => user + ":" + id;
const cached = (row: LocalRow | Row, user: string) => ({
  ...row,
  cache_user: user,
  cache_key: key(user, row.id),
});
export const events = new EventTarget();
const generations = new Map<string, number>();
function changed() {
  events.dispatchEvent(new Event("change"));
}
export async function list(user: string): Promise<LocalRow[]> {
  return (await (await db).getAll(STORE)).filter(
    (r: LocalRow) => r.cache_user === user,
  );
}
export async function context(user: string): Promise<HouseholdState> {
  return (await (await db).get("context", user))?.data || emptyHouseholds;
}
export async function clear(user: string) {
  generations.set(user, (generations.get(user) || 0) + 1);
  const d = await db,
    tx = d.transaction([STORE, "context", "records"], "readwrite");
  for (const r of await tx.objectStore(STORE).getAll())
    if (r.cache_user === user) await tx.objectStore(STORE).delete(r.cache_key);
  for (const r of await tx.objectStore("records").getAll())
    if (r.user_id === user) await tx.objectStore("records").delete(r.id);
  await tx.objectStore("context").delete(user);
  await tx.done;
  changed();
}
async function preferenceId(user: string, capsule: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(user + ":" + capsule),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}
export async function save(
  user: string,
  kind: Kind,
  data: RecordData,
  previous?: LocalRow,
  blob?: Blob,
  household: string | null = null,
) {
  if (previous?.conflict)
    throw Error("Bitte zuerst den Änderungskonflikt lösen.");
  const scope = previous ? previous.household_id || null : household;
  if (kind === "capsules" && scope)
    data = { ...data, favorite: false } as RecordData;
  const row: LocalRow = {
    id:
      previous?.id ||
      (kind === "preferences"
        ? await preferenceId(user, (data as { capsule_id: string }).capsule_id)
        : crypto.randomUUID()),
    user_id: previous?.user_id || user,
    household_id: scope,
    kind,
    data,
    version: previous?.version || 0,
    baseVersion: previous?.baseVersion || 0,
    deleted: previous?.deleted || false,
    updated_at: new Date().toISOString(),
    dirty: true,
    baseData: previous?.dirty ? previous.baseData : previous?.data,
    baseDeleted: previous?.dirty ? previous.baseDeleted : previous?.deleted,
    blob: blob || previous?.blob,
  };
  await (await db).put(STORE, cached(row, user));
  changed();
  return cached(row, user) as LocalRow;
}
export async function remove(row: LocalRow) {
  const user = row.cache_user || row.user_id;
  await (
    await db
  ).put(
    STORE,
    cached(
      {
        ...row,
        dirty: true,
        deleted: true,
        baseData: row.dirty ? row.baseData : row.data,
        baseDeleted: row.dirty ? row.baseDeleted : row.deleted,
      },
      user,
    ),
  );
  changed();
}
export async function resolve(row: LocalRow, choice: "local" | "remote") {
  if (!row.conflict) return;
  const r =
    choice === "local"
      ? {
          ...row,
          id: row.conflict.id,
          baseVersion: row.conflict.version,
          baseData: row.conflict.data,
          baseDeleted: row.conflict.deleted,
          version: row.conflict.version,
          conflict: undefined,
          error: undefined,
          dirty: true,
        }
      : { ...row.conflict, kind: row.kind, baseVersion: row.conflict.version };
  const cacheUser = row.cache_user || row.user_id,
    d = await db,
    tx = d.transaction(STORE, "readwrite");
  if (r.id !== row.id) await tx.store.delete(key(cacheUser, row.id));
  await tx.store.put(cached(r, cacheUser));
  await tx.done;
  changed();
}
const running = new Map<string, Promise<void>>();
export function sync(user: string) {
  const previous = running.get(user);
  if (previous) return previous;
  const task = perform(user).finally(() => {
    running.delete(user);
    changed();
  });
  running.set(user, task);
  return task;
}
async function refreshContext(
  user: string,
  valid: () => boolean,
  client: NonNullable<typeof supabase>,
) {
  const { data, error } = await client.rpc("coffee_household_state");
  if (error) throw error;
  if (!valid()) return null;
  const state: HouseholdState = data || emptyHouseholds;
  const allowed = new Set(state.households.map((h) => h.id));
  const d = await db;
  if (!valid()) return null;
  const tx = d.transaction([STORE, "context"], "readwrite");
  let removed = false;
  for (const row of await tx.objectStore(STORE).getAll())
    if (
      row.cache_user === user &&
      row.household_id &&
      !allowed.has(row.household_id)
    ) {
      await tx.objectStore(STORE).delete(row.cache_key);
      removed = true;
    }
  await tx.objectStore("context").put({
    user,
    data: {
      ...state,
      ...(removed
        ? {
            warning:
              "Ein Haushaltszugriff ist beendet. Die dazugehörigen lokalen Daten und ausstehenden Änderungen wurden von diesem Gerät entfernt.",
          }
        : {}),
    },
  });
  await tx.done;
  return allowed;
}
async function perform(user: string) {
  if (!supabase || !navigator.onLine) return;
  const generation = generations.get(user) || 0,
    valid = () => generation === (generations.get(user) || 0),
    d = await db;
  const client = await sessionClient(user);
  if (!valid()) return;
  const allowed = await refreshContext(user, valid, client);
  if (!allowed || !valid()) return;
  for (const kind of [
    "capsules",
    "inventory",
    "tastings",
    "photos",
    "preferences",
    "inventory",
  ] as Kind[]) {
    for (const row of (await list(user))
      .filter((r) => r.kind === kind && r.dirty && !r.conflict)
      .sort((a, b) =>
        kind === "inventory"
          ? Number((b.data as { type?: string }).type === "opening") -
              Number((a.data as { type?: string }).type === "opening") ||
            a.updated_at.localeCompare(b.updated_at)
          : 0,
      )) {
      if (!valid()) return;
      if (row.household_id && !allowed.has(row.household_id)) continue;
      try {
        if (kind === "photos" && row.blob && !row.deleted) {
          const { error } = await client.storage
            .from("coffee-photos")
            .upload((row.data as { path: string }).path, row.blob, {
              upsert: true,
              contentType: row.blob.type,
            });
          if (error) throw error;
          if (!valid()) return;
        }
        const { data, error } = await client.rpc("coffee_save_record", {
          p_kind: kind,
          p_id: row.id,
          p_data: row.data,
          p_expected: row.baseVersion,
          p_deleted: row.deleted,
          p_household: row.household_id || null,
        });
        if (!valid()) return;
        if (error) {
          if (error.code === "40001") {
            const query = client.from("coffee_" + kind).select("*");
            const remote =
              kind === "preferences"
                ? await query
                    .eq("user_id", user)
                    .eq(
                      "capsule_id",
                      (row.data as { capsule_id: string }).capsule_id,
                    )
                    .single()
                : await query.eq("id", row.id).single();
            if (remote.error) throw remote.error;
            if (!valid()) return;
            await d.put(
              STORE,
              cached(
                {
                  ...row,
                  conflict: remote.data,
                  baseData: remote.data.data,
                  baseDeleted: remote.data.deleted,
                  error: "Auf einem anderen Gerät geändert.",
                },
                user,
              ),
            );
            continue;
          }
          throw error;
        }
        if (kind === "photos" && row.deleted) {
          // Several scopes may intentionally reference the same photo after an import.
          // Keep bytes until no visible, nondeleted metadata refers to them.
          const path = (row.data as { path: string }).path;
          const { data: unused, error: refError } = await client.rpc(
            "coffee_can_delete_photo",
            { p_path: path },
          );
          if (refError) throw refError;
          if (unused) {
            const { error: storageError } = await client.storage
              .from("coffee-photos")
              .remove([path]);
            if (storageError) throw storageError;
          }
        }
        if (!valid()) return;
        const ledger = data._inventory || [];
        delete data._inventory;
        const tx = d.transaction(STORE, "readwrite");
        for (const movement of ledger)
          await tx.store.put(
            cached(
              { ...movement, kind: "inventory", baseVersion: movement.version },
              user,
            ),
          );
        const current: LocalRow | undefined = await tx.store.get(
          key(user, row.id),
        );
        if (current) {
          const edited =
            JSON.stringify(current.data) !== JSON.stringify(row.data) ||
            current.deleted !== row.deleted;
          await tx.store.put(
            cached(
              edited
                ? {
                    ...current,
                    version: data.version,
                    baseData: data.data,
                    baseDeleted: data.deleted,
                    baseVersion: data.version,
                    dirty: true,
                  }
                : {
                    ...data,
                    kind,
                    baseVersion: data.version,
                    blob: row.deleted ? undefined : row.blob,
                  },
              user,
            ),
          );
        }
        await tx.done;
      } catch (e) {
        if (!valid()) return;
        const current = await d.get(STORE, key(user, row.id));
        if (current)
          await d.put(STORE, {
            ...current,
            error:
              e instanceof Error
                ? e.message
                : String((e as { message?: string }).message || e),
          });
      }
    }
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client
        .from("coffee_" + kind)
        .select("*")
        .order("id")
        .range(offset, offset + 499);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data?.length || 0) < 500) break;
    }
    if (!valid()) return;
    for (const remote of rows) {
      if (
        remote.household_id
          ? !allowed.has(remote.household_id)
          : remote.user_id !== user
      )
        continue;
      const tx = d.transaction(STORE, "readwrite"),
        local: LocalRow | undefined = await tx.store.get(key(user, remote.id));
      if (!local?.dirty)
        await tx.store.put(
          cached(
            {
              ...remote,
              kind,
              baseVersion: remote.version,
              blob: remote.deleted ? undefined : local?.blob,
            },
            user,
          ),
        );
      await tx.done;
    }
  }
}
export async function addPhotos(
  user: string,
  parent: string,
  files: File[],
  household: string | null = null,
) {
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw Error("Bitte JPEG, PNG oder WebP verwenden.");
    if (file.size > 10 * 1024 * 1024)
      throw Error("Ein Foto darf höchstens 10 MB groß sein.");
    await save(
      user,
      "photos",
      {
        parent_id: parent,
        path: `${user}/${crypto.randomUUID()}`,
        caption: file.name,
      },
      undefined,
      file,
      household,
    );
  }
}
export async function photoUrl(row: LocalRow, shared = false) {
  if (row.blob && !shared) return URL.createObjectURL(row.blob);
  if (!supabase) return "";
  const { data, error } = await supabase.storage
    .from("coffee-photos")
    .download((row.data as { path: string }).path);
  if (error) throw error;
  if (!shared) {
    const d = await db,
      tx = d.transaction(STORE, "readwrite"),
      cacheUser = row.cache_user || row.user_id;
    const current = await tx.store.get(key(cacheUser, row.id));
    if (current && !current.deleted)
      await tx.store.put({ ...current, blob: data });
    await tx.done;
  }
  return URL.createObjectURL(data);
}
export async function discardPending(row: LocalRow) {
  if (row.kind !== "inventory" || !row.dirty || row.baseVersion !== 0)
    throw Error(
      "Nur nicht bestätigte Bestandsbuchungen können verworfen werden.",
    );
  await (await db).delete(STORE, key(row.cache_user || row.user_id, row.id));
  changed();
}
