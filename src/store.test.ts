import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
const remote = vi.hoisted(() => new Map<string, any>());
const controls = vi.hoisted(() => ({
  fail: false,
  uploads: [] as { body: unknown; type: string }[],
  onSave: null as null | (() => Promise<void>),
  households: [] as {
    id: string;
    name: string;
    owner_id: string;
    members: never[];
    invitations: never[];
  }[],
}));
vi.mock("./backend", () => {
  const supabase = {
    storage: {
      from: () => ({
        upload: async (
          _path: string,
          body: unknown,
          options: { contentType: string },
        ) => {
          controls.uploads.push({ body, type: options.contentType });
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    rpc: async (_name: string, p: any) => {
      if (_name === "coffee_household_state")
        return {
          data: { households: controls.households, invitations: [] },
          error: null,
        };
      if (_name === "coffee_can_delete_photo")
        return { data: true, error: null };
      if (controls.onSave) {
        const f = controls.onSave;
        controls.onSave = null;
        await f();
      }
      if (controls.fail)
        return { data: null, error: { message: "Verbindung unterbrochen" } };
      const old = remote.get(p.p_id);
      if (old && old.version !== p.p_expected)
        return { error: { code: "40001" }, data: null };
      const data = {
        id: p.p_id,
        user_id: "test",
        household_id: p.p_household,
        version: (old?.version || 0) + 1,
        deleted: p.p_deleted,
        data: p.p_data,
        updated_at: new Date().toISOString(),
      };
      remote.set(p.p_id, { ...data, kind: p.p_kind });
      return { data, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          range: async (start: number, end: number) => ({
            data: [...remote.values()]
              .filter((r) => r.kind === table.replace("coffee_", ""))
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(start, end + 1),
            error: null,
          }),
        }),
        eq: (_field: string, value: string) => ({
          then: (f: any) =>
            Promise.resolve({
              data: [...remote.values()].filter(
                (r) =>
                  r.kind === table.replace("coffee_", "") &&
                  r.user_id === value,
              ),
              error: null,
            }).then(f),
          order: () => ({
            range: async (start: number, end: number) => ({
              data: [...remote.values()]
                .filter(
                  (r) =>
                    r.kind === table.replace("coffee_", "") &&
                    r.user_id === value,
                )
                .sort((a, b) => a.id.localeCompare(b.id))
                .slice(start, end + 1),
              error: null,
            }),
          }),
          single: async () => ({ data: remote.get(value), error: null }),
        }),
      }),
    }),
  };
  return { supabase, sessionClient: async () => supabase };
});
import * as store from "./store";
const capsule = {
  name: "Offline",
  brand: "Test",
  system: "Original",
  favorite: false,
};
beforeEach(async () => {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
  controls.fail = false;
  controls.uploads = [];
  controls.onSave = null;
  controls.households = [];
  remote.clear();
  await store.clear("test");
  await store.clear("other");
});
describe.sequential("Offline-Warteschlange", () => {
  it("persists offline and isolates accounts", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    await store.save("test", "capsules", capsule);
    await store.sync("test");
    expect(remote.size).toBe(0);
    expect((await store.list("test"))[0].dirty).toBe(true);
    expect(await store.list("other")).toHaveLength(0);
  });
  it("retains failures and retries without duplicate records", async () => {
    await store.save("test", "capsules", capsule);
    controls.fail = true;
    await store.sync("test");
    expect((await store.list("test"))[0].error).toContain("unterbrochen");
    controls.fail = false;
    await store.sync("test");
    await store.sync("test");
    expect(remote.size).toBe(1);
    expect((await store.list("test"))[0].dirty).toBeFalsy();
  });
  it("keeps edits made during an in-flight upload queued", async () => {
    const row = await store.save("test", "capsules", capsule);
    controls.onSave = async () => {
      await store.save(
        "test",
        "capsules",
        { ...capsule, name: "Während Upload geändert" },
        row,
      );
    };
    await store.sync("test");
    const local = (await store.list("test"))[0];
    expect(local.dirty).toBe(true);
    expect(local.baseVersion).toBe(1);
    await store.sync("test");
    expect(remote.get(row.id).data.name).toBe("Während Upload geändert");
  });
  it("retains both sides of a conflict until explicitly resolved", async () => {
    const row = await store.save("test", "capsules", capsule);
    await store.sync("test");
    const local = (await store.list("test"))[0];
    remote.set(row.id, {
      ...remote.get(row.id),
      version: 2,
      data: { ...capsule, name: "Anderes Gerät" },
    });
    await store.save(
      "test",
      "capsules",
      { ...capsule, name: "Mein Gerät" },
      local,
    );
    await store.sync("test");
    const conflict = (await store.list("test"))[0];
    expect(conflict.conflict?.version).toBe(2);
    expect(conflict.data).toMatchObject({ name: "Mein Gerät" });
    await store.resolve(conflict, "local");
    await store.sync("test");
    expect(remote.get(row.id).data.name).toBe("Mein Gerät");
  });
  it("does not restore private cache after logout during synchronization", async () => {
    await store.save("test", "capsules", capsule);
    controls.onSave = async () => {
      await store.clear("test");
    };
    await store.sync("test");
    expect(await store.list("test")).toHaveLength(0);
  });
  it("isolates two account caches for the same household record", async () => {
    controls.households = [
      {
        id: "house",
        name: "Test",
        owner_id: "test",
        members: [],
        invitations: [],
      },
    ];
    const shared = await store.save(
      "test",
      "capsules",
      capsule,
      undefined,
      undefined,
      "house",
    );
    await store.sync("test");
    await store.sync("other");
    expect((await store.list("other")).some((r) => r.id === shared.id)).toBe(
      true,
    );
    await store.clear("other");
    expect((await store.list("test")).some((r) => r.id === shared.id)).toBe(
      true,
    );
  });
  it("purges revoked household data and queued edits before attempting uploads", async () => {
    controls.households = [
      {
        id: "house",
        name: "Test",
        owner_id: "test",
        members: [],
        invitations: [],
      },
    ];
    const row = await store.save(
      "test",
      "capsules",
      capsule,
      undefined,
      undefined,
      "house",
    );
    await store.sync("test");
    const current = (await store.list("test"))[0];
    await store.save(
      "test",
      "capsules",
      { ...capsule, name: "Nicht übertragen" },
      current,
    );
    controls.households = [];
    await store.sync("test");
    expect(await store.list("test")).toHaveLength(0);
    expect(remote.get(row.id).data.name).toBe("Offline");
    expect((await store.context("test")).warning).toContain("beendet");
  });
  it("does not cache private profile shares belonging to someone else", async () => {
    remote.set("private-shared", {
      id: "private-shared",
      user_id: "other",
      kind: "capsules",
      household_id: null,
      data: capsule,
      version: 1,
      deleted: false,
      updated_at: "",
    });
    await store.sync("test");
    expect(await store.list("test")).toHaveLength(0);
  });
  it("uploads queued photos as nonempty binary data instead of multipart Blob bodies", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const row = await store.save(
      "test",
      "photos",
      { parent_id: "c", path: "test/photo", caption: "Foto" },
      undefined,
      new Blob([bytes], { type: "image/jpeg" }),
    );
    await store.sync("test");
    expect(controls.uploads).toHaveLength(1);
    expect(controls.uploads[0].body).toBeInstanceOf(Uint8Array);
    expect([...(controls.uploads[0].body as Uint8Array)]).toEqual([...bytes]);
    expect(controls.uploads[0].type).toBe("image/jpeg");
    expect(
      (await store.list("test")).find((r) => r.id === row.id)?.dirty,
    ).toBeFalsy();
  });
  it("keeps an unreadable queued photo local and lets a replacement retry under the same record ID", async () => {
    const row = await store.save(
      "test",
      "photos",
      { parent_id: "c", path: "test/photo", caption: "Alt" },
      undefined,
      new Blob([], { type: "image/jpeg" }),
    );
    await store.sync("test");
    const pending = (await store.list("test"))[0];
    expect(pending.dirty).toBe(true);
    expect(pending.error).toContain("erneut auswählen");
    expect(controls.uploads).toHaveLength(0);
    expect(remote.has(row.id)).toBe(false);
    await store.replacePendingPhoto(
      pending,
      new File([new Uint8Array([1, 2, 3])], "Neu.jpg", { type: "image/jpeg" }),
    );
    await store.sync("test");
    const saved = (await store.list("test"))[0];
    expect(saved.id).toBe(row.id);
    expect(saved.dirty).toBeFalsy();
    expect(saved.data).toMatchObject({
      caption: "Neu.jpg",
      path: "test/photo",
    });
  });
});
