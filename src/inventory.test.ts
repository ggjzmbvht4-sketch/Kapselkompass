import { describe, it, expect } from "vitest";
import { stock, normalizeBarcode, type LocalRow, type Tasting } from "./domain";
const row = (
  id: string,
  kind: LocalRow["kind"],
  data: unknown,
  dirty = false,
) =>
  ({
    id,
    kind,
    user_id: "u",
    data,
    dirty,
    version: 1,
    baseVersion: 1,
    deleted: false,
    updated_at: "2026-11-15T12:00:00Z",
  }) as LocalRow;
const opening = row("open", "inventory", {
  capsule_id: "c",
  amount: 10,
  type: "opening",
  note: "",
  threshold: 5,
});
const t = { capsule_id: "c", consumed: 1 } as Tasting;
describe("Private Bestandsprojektion", () => {
  it("distinguishes untracked stock from zero", () => {
    expect(stock([], "c").amount).toBeNull();
    expect(
      stock([{ ...opening, data: { ...opening.data, amount: 0 } }], "c").amount,
    ).toBe(0);
  });
  it("projects only unsynchronized consumption, edits and deletion", () => {
    const saved = row("t", "tastings", t);
    const ledger = row("ledger", "inventory", {
      capsule_id: "c",
      amount: -1,
      type: "tasting",
      note: "",
    });
    expect(stock([opening, ledger, saved], "c").amount).toBe(9);
    const edit = {
      ...saved,
      dirty: true,
      data: { ...t, consumed: 3 },
      baseData: t,
    };
    expect(stock([opening, ledger, edit], "c").amount).toBe(7);
    expect(
      stock([opening, ledger, { ...edit, deleted: true }], "c").amount,
    ).toBe(10);
  });
  it("projects unsent new records and reversed capsule assignments", () => {
    const fresh = {
      ...row("t", "tastings", { ...t, consumed: 2 }, true),
      baseVersion: 0,
    };
    expect(stock([opening, fresh], "c").amount).toBe(8);
    const moved = {
      ...fresh,
      baseData: { ...t, consumed: 1 },
      data: { ...t, capsule_id: "other", consumed: 2 },
    };
    expect(stock([opening, moved], "c").amount).toBe(11);
  });
  it("keeps negative counts visible and uses latest warning settings", () => {
    const spend = row("s", "inventory", {
      capsule_id: "c",
      amount: -12,
      type: "consume",
      note: "",
    });
    const threshold = {
      ...row("x", "inventory", {
        capsule_id: "c",
        amount: 0,
        type: "threshold",
        threshold: 3,
        note: "",
      }),
      updated_at: "2026-11-16T00:00:00Z",
    };
    expect(stock([opening, spend, threshold], "c")).toMatchObject({
      amount: -2,
      threshold: 3,
    });
  });
});
describe("Barcode-Prüfung", () => {
  it("accepts EAN8/EAN13 and normalizes UPC to EAN13", () => {
    expect(normalizeBarcode("96385074")).toBe("96385074");
    expect(normalizeBarcode("4006381333931")).toBe("4006381333931");
    expect(normalizeBarcode("036000291452")).toBe("0036000291452");
  });
  it("rejects invalid formats and checksum errors", () => {
    expect(() => normalizeBarcode("123")).toThrow();
    expect(() => normalizeBarcode("4006381333932")).toThrow("Prüfziffer");
  });
});
