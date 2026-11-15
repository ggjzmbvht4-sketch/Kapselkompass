import "fake-indexeddb/auto";
import { openDB } from "idb";
import { it, expect, vi } from "vitest";
vi.mock("./backend", () => ({
  supabase: null,
  sessionClient: async () => null,
}));
it("migrates the existing private offline cache into account-isolated keys without losing data", async () => {
  const legacy = await openDB("kapselkompass", 1, {
    upgrade(db) {
      db.createObjectStore("records", { keyPath: "id" });
    },
  });
  const row = {
    id: "existing-capsule",
    user_id: "test",
    kind: "capsules",
    data: {
      name: "Bestehender Kaffee",
      brand: "Test",
      system: "Original",
      favorite: true,
    },
    version: 1,
    baseVersion: 1,
    deleted: false,
    updated_at: "2026-11-15",
  };
  await legacy.put("records", row);
  legacy.close();
  const store = await import("./store");
  const rows = await store.list("test");
  expect(rows).toHaveLength(1);
  expect(rows[0].data).toEqual(row.data);
  expect(rows[0].cache_user).toBe("test");
  expect(await store.list("someone-else")).toHaveLength(0);
  await store.clear("test");
  expect(await store.list("test")).toHaveLength(0);
  const updated = await openDB("kapselkompass", 2);
  expect(await updated.getAll("records")).toHaveLength(0);
  updated.close();
});
