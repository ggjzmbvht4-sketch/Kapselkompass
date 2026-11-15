import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shopUrl,
  extractShop,
  cleanSuggestion,
  barcode,
  limitedFetch,
} from "./core";
afterEach(() => vi.unstubAllGlobals());
const html = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
describe("Discovery boundary and extraction", () => {
  it("restricts fetches to supported HTTPS shops", () => {
    expect(shopUrl("https://kaffek.de/kaffee.html").hostname).toBe("kaffek.de");
    expect(
      shopUrl("https://www.nespresso.com/de/de/order/capsules/original/test")
        .hostname,
    ).toBe("www.nespresso.com");
    for (const s of [
      "http://kaffek.de/a",
      "https://127.0.0.1/a",
      "https://kaffek.de.evil.test/a",
      "https://user:pass@kaffek.de/a",
      "https://kaffek.de:8443/a",
      "https://www.nespresso.com/us/en/test",
    ])
      expect(() => shopUrl(s)).toThrow();
  });
  it("extracts pack size, system and per-capsule EUR price from structured metadata", () => {
    const result = extractShop(
      html({
        "@type": "Product",
        name: "Lungo Strong",
        brand: { name: "KaffeK" },
        description: "50 Kapseln für Nespresso. Intensität: 7/10",
        gtin13: "4006381333931",
        offers: { price: "8.59", priceCurrency: "EUR" },
      }),
      "https://kaffek.de/lungo.html",
    );
    expect(result).toMatchObject({
      name: "Lungo Strong",
      brand: "KaffeK",
      system: "Original",
      pack_size: 50,
      intensity: 7,
      price: 0.1718,
      barcodes: ["4006381333931"],
    });
  });
  it("does not mistake a pack price for a capsule price or infer a missing pack size", () => {
    const result = extractShop(
      html({
        "@graph": [
          {
            "@type": "Product",
            name: "Kaffee",
            offers: { price: 5, priceCurrency: "EUR" },
          },
        ],
      }),
      "https://kaffek.de/test.html",
    );
    expect(result.price).toBeUndefined();
    expect(result.pack_size).toBeUndefined();
    expect(result.explanation).toContain("Preis gefunden");
  });
  it("preserves explicitly priced individual capsules instead of dividing twice", () => {
    const result = extractShop(
      html({
        "@type": "Product",
        name: "10 Kapseln Ristretto",
        brand: "Nespresso",
        offers: {
          priceCurrency: "EUR",
          price: 0.49,
          priceSpecification: {
            referenceQuantity: { value: 1, unitText: "Kapsel" },
          },
        },
      }),
      "https://www.nespresso.com/de/de/order/capsules/original/ristretto",
    );
    expect(result.price).toBe(0.49);
    expect(result.pack_size).toBe(10);
  });
  it("fails gracefully when shops return no product metadata", () => {
    expect(() =>
      extractShop(
        "<html>Bitte JavaScript aktivieren</html>",
        "https://kaffek.de/test",
      ),
    ).toThrow("manuell");
  });
  it("bounds and validates untrusted AI suggestions", () => {
    expect(
      cleanSuggestion({
        name: "<script>X</script>Ristretto",
        intensity: 99,
        pack_size: -1,
        price: -2,
        confidence: "certain",
      }),
    ).toEqual({ name: "X Ristretto" });
    expect(cleanSuggestion(null)).toEqual({});
    expect(barcode("036000291452")).toBe("0036000291452");
  });
  it("does not follow redirects implicitly and limits response size", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("too long"));
    vi.stubGlobal("fetch", mock);
    await expect(limitedFetch("https://kaffek.de", {}, 2)).rejects.toThrow(
      "zu groß",
    );
    expect(mock.mock.calls[0][1].redirect).toBe("manual");
  });
});
