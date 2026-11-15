export type Suggestion = {
  name?: string;
  brand?: string;
  system?: string;
  intensity?: number;
  price?: number;
  pack_size?: number;
  barcodes?: string[];
  shop_url?: string;
  source?: { name: string; url: string; imported_at: string };
  confidence?: "high" | "medium" | "low";
  explanation?: string;
  existing_id?: string;
};
export function barcode(value: string) {
  const code = value.replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code))
    throw Error("Ungültiges Barcode-Format");
  const ds = [...code].map(Number),
    check = ds.pop()!,
    sum = ds.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== check)
    throw Error("Ungültige Barcode-Prüfziffer");
  return code.length === 12 ? "0" + code : code;
}
export function shopUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash)
    throw Error("Bitte einen öffentlichen HTTPS-Produktlink verwenden.");
  if (
    ![
      "kaffek.de",
      "www.kaffek.de",
      "nespresso.com",
      "www.nespresso.com",
    ].includes(u.hostname)
  )
    throw Error("Unterstützt werden nespresso.com und kaffek.de.");
  if (u.hostname.endsWith("nespresso.com") && !u.pathname.startsWith("/de/"))
    throw Error("Bitte einen Link aus dem deutschen Nespresso-Shop verwenden.");
  return u;
}
export async function limitedFetch(
  url: string,
  init: RequestInit = {},
  maxBytes = 2_000_000,
): Promise<{ response: Response; text: string }> {
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const reader = response.body?.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          throw Error("Antwort zu groß");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return { response, text: new TextDecoder().decode(all) };
}
function text(v: unknown, max = 120) {
  return typeof v === "string"
    ? v
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .trim()
        .slice(0, max)
    : undefined;
}
export function cleanSuggestion(value: unknown): Suggestion {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: Suggestion = {};
  for (const key of [
    "name",
    "brand",
    "system",
    "explanation",
    "existing_id",
  ] as const) {
    const t = text(v[key], key === "explanation" ? 500 : 120);
    if (t) out[key] = t;
  }
  for (const key of ["intensity", "pack_size", "price"] as const) {
    const n =
      typeof v[key] === "number"
        ? v[key]
        : typeof v[key] === "string"
          ? Number(v[key].replace(",", "."))
          : NaN;
    if (
      Number.isFinite(n) &&
      n >= 0 &&
      (key === "price"
        ? n <= 1000
        : Number.isInteger(n) &&
          n >= 1 &&
          n <= (key === "intensity" ? 20 : 10000))
    )
      out[key] = n;
  }
  if (["high", "medium", "low"].includes(String(v.confidence)))
    out.confidence = v.confidence as Suggestion["confidence"];
  return out;
}
export function extractShop(html: string, url: string): Suggestion {
  const products: any[] = [];
  function walk(value: any) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];
    if (types.includes("Product")) products.push(value);
    if (value["@graph"]) walk(value["@graph"]);
    if (value.mainEntity) walk(value.mainEntity);
  }
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* Some shops publish malformed optional metadata. */
    }
  }
  const p = products[0];
  if (!p)
    throw Error(
      "Keine lesbaren Produktdaten gefunden. Bitte die Angaben manuell ergänzen.",
    );
  const attrs: Record<string, string> = {};
  for (const row of html.matchAll(
    /<tr[^>]*class=["']attribute[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi,
  )) {
    const label = row[1].match(
        /class=["'][^"']*attribute-label[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
      ),
      value = row[1].match(
        /class=["'][^"']*attribute-value[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
      );
    if (label && value)
      attrs[text(label[1], 100) || ""] = text(value[1], 200) || "";
  }
  const brand =
    attrs["Marke"] ||
    (new URL(url).hostname.includes("kaffek.de")
      ? p.manufacturer?.name
      : undefined) ||
    (typeof p.brand === "string" ? p.brand : p.brand?.name);
  const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  const description = text(p.description, 6000) || "";
  const name = text(p.name) || "";
  const extra = [
    ...(Array.isArray(p.additionalProperty) ? p.additionalProperty : []),
    ...(Array.isArray(p.additionalProperties) ? p.additionalProperties : []),
  ];
  const props = extra.map((v: any) => `${v.name}: ${v.value}`).join(" ");
  const full = `${name} ${description} ${props}`;
  const pack = full.match(
    /(?:Packungsinhalt|Anzahl|Inhalt)[^\d]{0,25}(\d{1,4})\s*(?:Kapseln|Stück)|\b(\d{1,4})\s*(?:Kapseln|Kaffeekapseln)\b/i,
  );
  const pack_size =
    attrs["Anzahl Kapseln"] && /^\d+$/.test(attrs["Anzahl Kapseln"])
      ? Number(attrs["Anzahl Kapseln"])
      : pack
        ? Number(pack[1] || pack[2])
        : undefined;
  const intensity =
    attrs["Intensität"]?.match(/(\d{1,2})/) ||
    full.match(
      /(?:Intensität|Intensitaet|Stärke)\s*[:\-]?\s*(\d{1,2})(?:\s*\/\s*\d+)?/i,
    );
  let system: string | undefined;
  if (/Dolce\s*Gusto/i.test(full)) system = "Dolce Gusto";
  else if (/Vertuo/i.test(full) || /\/vertuo\//.test(url)) system = "Vertuo";
  else if (/Tassimo/i.test(full)) system = "Tassimo";
  else if (/Cafissimo/i.test(full)) system = "Cafissimo";
  else if (/Nespresso|\/original\//i.test(full + " " + url))
    system = "Original";
  const price =
    offer?.priceCurrency === "EUR"
      ? Number(String(offer.price).replace(",", "."))
      : undefined;
  const isKaffeK = new URL(url).hostname.includes("kaffek.de");
  const specs = Array.isArray(offer?.priceSpecification)
    ? offer.priceSpecification
    : [offer?.priceSpecification];
  const perCapsule = specs.some(
    (spec: any) =>
      spec &&
      Number(spec.referenceQuantity?.value) === 1 &&
      /kapsel|capsule/i.test(
        String(spec.referenceQuantity?.unitText || spec.unitText || ""),
      ),
  );
  const unitPrice =
    price !== undefined
      ? perCapsule
        ? price
        : isKaffeK && pack_size
          ? Math.round((price / pack_size) * 10000) / 10000
          : undefined
      : undefined;
  const result = cleanSuggestion({
    name: name
      .replace(/^[^|]+\|\s*/, "")
      .replace(/\s*[-–]\s*\d+\s*Kapseln.*$/i, ""),
    brand:
      brand ||
      (/nespresso\.com/.test(new URL(url).hostname) ? "Nespresso" : undefined),
    system,
    pack_size,
    intensity: intensity ? Number(intensity[1]) : undefined,
    price: unitPrice,
  });
  const barcodes: string[] = [];
  for (const key of ["gtin", "gtin8", "gtin12", "gtin13"])
    if (p[key])
      try {
        barcodes.push(barcode(String(p[key])));
      } catch {
        /* Ignore invalid source codes. */
      }
  return {
    ...result,
    barcodes: [...new Set(barcodes)],
    shop_url: url,
    source: {
      name: new URL(url).hostname.includes("kaffek") ? "KaffeK" : "Nespresso",
      url,
      imported_at: new Date().toISOString(),
    },
    explanation:
      price !== undefined && unitPrice === undefined
        ? "Preis gefunden, aber Verkaufseinheit oder Kapselanzahl sind nicht eindeutig. Preis je Kapsel bitte ergänzen."
        : "Bitte alle übernommenen Angaben und die Packungsgröße prüfen.",
  };
}
