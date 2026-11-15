import { describe, expect, it, vi } from "vitest";
import { lookupBarcode } from "./barcodeLookup";
import { catalogBarcode, catalogBarcodes } from "./catalog";
import { barcode } from "./core";

const missing = () => ({
  response: new Response(null, { status: 404 }),
  text: "",
});
const json = (value: unknown) => ({
  response: Response.json(value),
  text: JSON.stringify(value),
});

describe("Exact barcode product search", () => {
  it("finds the reported Mövenpick barcode even when public databases do not list it", async () => {
    const read = vi.fn();
    const result = await lookupBarcode("4006581061030", read);
    expect(result).toMatchObject({
      outcome: "found",
      suggestions: [
        {
          name: "Crema Lungo",
          brand: "Mövenpick",
          pack_size: 10,
          system: "Original",
          barcodes: ["4006581061030"],
        },
      ],
    });
    expect(read).not.toHaveBeenCalled();
    expect(result.suggestions[0].price).toBeUndefined();
    expect(result.suggestions[0].intensity).toBeUndefined();
  });
  it("keeps verified consumer pack codes separate from shipping cartons", () => {
    for (const code of catalogBarcodes) {
      expect(barcode(code)).toBe(code);
      expect(catalogBarcode(code)?.pack_size).toBe(10);
    }
    expect(catalogBarcode("4006581804736")).toBeUndefined();
  });
  it("tries the additional provider after a genuine Open Food Facts miss", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(
        json({
          code: "OK",
          items: [
            {
              ean: "4006381333931",
              title: "Kaffeekapseln für Nespresso",
              brand: "Test",
            },
          ],
        }),
      );
    expect(await lookupBarcode("4006381333931", read)).toMatchObject({
      outcome: "found",
      suggestions: [
        {
          name: "Kaffeekapseln für Nespresso",
          system: "Original",
          barcodes: ["4006381333931"],
          source: { name: "UPCitemdb" },
        },
      ],
    });
    expect(read.mock.calls[1][0]).toBe(
      "https://api.upcitemdb.com/prod/trial/lookup?upc=4006381333931",
    );
  });
  it("uses an Open Food Facts hit without unnecessary fallback requests", async () => {
    const read = vi
      .fn()
      .mockResolvedValue(
        json({
          product: {
            code: "4006381333931",
            product_name_de: "Testkaffee",
            brands: "Test",
          },
        }),
      );
    expect(await lookupBarcode("4006381333931", read)).toMatchObject({
      outcome: "found",
      suggestions: [{ name: "Testkaffee" }],
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not present blank products or a mismatched EAN as a hit", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(json({ product: { brands: "Only brand" } }))
      .mockResolvedValueOnce(
        json({
          code: "OK",
          items: [{ ean: "4006581061030", title: "Wrong product" }],
        }),
      );
    expect(await lookupBarcode("4006381333931", read)).toMatchObject({
      outcome: "not_found",
      suggestions: [],
    });
  });
  it("distinguishes provider outages and rate limits from a missing product", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce({
        response: new Response(null, { status: 429 }),
        text: "",
      });
    const result = await lookupBarcode("4006381333931", read);
    expect(result).toMatchObject({ outcome: "unavailable", suggestions: [] });
    expect(result.message).toContain("Anfragelimit");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("can find a fallback product when the first provider times out", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(Error("Timeout"))
      .mockResolvedValueOnce(
        json({ code: "OK", items: [{ upc: "036000291452", title: "Coffee" }] }),
      );
    expect(await lookupBarcode("0036000291452", read)).toMatchObject({
      outcome: "found",
      suggestions: [{ name: "Coffee" }],
    });
  });
  it("rejects a bad check digit before contacting any provider", async () => {
    const read = vi.fn();
    await expect(lookupBarcode("4006581061031", read)).rejects.toThrow(
      "Prüfziffer",
    );
    expect(read).not.toHaveBeenCalled();
  });
});
