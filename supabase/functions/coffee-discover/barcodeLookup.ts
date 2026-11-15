import {
  barcode,
  cleanSuggestion,
  limitedFetch,
  type Suggestion,
} from "./core.ts";
import { catalogBarcode } from "./catalog.ts";

export type BarcodeResult = {
  suggestions: Suggestion[];
  outcome: "found" | "not_found" | "unavailable";
  message?: string;
};
type ReadProduct = (
  url: string,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; text: string }>;
const agent =
  "Kapselkompass/3.0.4 (https://github.com/ggjzmbvht4-sketch/Kapselkompass)";

function sameCode(value: unknown, code: string) {
  try {
    return barcode(String(value)) === code;
  } catch {
    return false;
  }
}
function systemFrom(title: string) {
  if (/\bVertuo\b/i.test(title)) return "Vertuo";
  if (/Dolce\s*Gusto/i.test(title)) return "Dolce Gusto";
  if (/\bTassimo\b/i.test(title)) return "Tassimo";
  if (/\bCafissimo\b/i.test(title)) return "Cafissimo";
  if (/\bNespresso\b/i.test(title)) return "Original";
  return undefined;
}

export async function lookupBarcode(
  value: string,
  read: ReadProduct = limitedFetch,
): Promise<BarcodeResult> {
  const code = barcode(value);
  const catalog = catalogBarcode(code);
  if (catalog) return { suggestions: [catalog], outcome: "found" };
  let incomplete = false;
  try {
    const { response, text } = await read(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_de,brands`,
      {
        headers: { "User-Agent": agent, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
      500000,
    );
    if (response.status !== 404) {
      if (!response.ok) throw Error("Open Food Facts unavailable");
      const data = JSON.parse(text);
      const p = data.product;
      if (p && (p.code === undefined || sameCode(p.code, code))) {
        const product = cleanSuggestion({
          name: p.product_name_de || p.product_name,
          brand: p.brands,
        });
        if (product.name)
          return {
            outcome: "found",
            suggestions: [
              {
                ...product,
                barcodes: [code],
                source: {
                  name: "Open Food Facts (ODbL)",
                  url: `https://world.openfoodfacts.org/product/${code}`,
                  imported_at: new Date().toISOString(),
                },
                explanation:
                  "Exakte Barcode-Suche. Produktangaben bitte mit der Packung vergleichen.",
              },
            ],
          };
      }
    }
  } catch {
    incomplete = true;
  }

  // The documented free endpoint needs no API key or paid subscription.
  // Limits (including shared-IP limits) are reported as an incomplete search,
  // never as proof that a product does not exist. No automatic retries.
  try {
    const { response, text } = await read(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`,
      {
        headers: { "User-Agent": agent, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
      500000,
    );
    if (response.status !== 404) {
      if (!response.ok) throw Error("UPCitemdb unavailable");
      const data = JSON.parse(text);
      if (data.code !== "OK" || !Array.isArray(data.items))
        throw Error("Invalid product response");
      for (const item of data.items) {
        if (
          !item ||
          ![item.ean, item.upc, item.gtin].some((v) => sameCode(v, code))
        )
          continue;
        const product = cleanSuggestion({
          name: item.title,
          brand: item.brand,
        });
        if (!product.name) continue;
        return {
          outcome: "found",
          suggestions: [
            {
              ...product,
              system: systemFrom(product.name),
              barcodes: [code],
              source: {
                name: "UPCitemdb",
                url: `https://www.upcitemdb.com/upc/${code}`,
                imported_at: new Date().toISOString(),
              },
              explanation:
                "Exakte EAN-Zuordnung aus der zusätzlichen Produktsuche. Name und Kapselsystem vor dem Übernehmen prüfen. Preise und Packungsgrößen werden nicht geschätzt.",
            },
          ],
        };
      }
    }
  } catch {
    incomplete = true;
  }
  return {
    suggestions: [],
    outcome: incomplete ? "unavailable" : "not_found",
    message: incomplete
      ? "Die Produktsuche konnte nicht vollständig abgeschlossen werden. Eine Quelle ist gerade nicht erreichbar oder hat ihr Anfragelimit erreicht. Bitte später erneut versuchen oder den Code manuell zuordnen."
      : "Zu diesem Barcode wurde in den verfügbaren Produktquellen kein Eintrag gefunden. Du kannst den Code für eine neue Sorte übernehmen oder einer vorhandenen Sorte zuordnen.",
  };
}
