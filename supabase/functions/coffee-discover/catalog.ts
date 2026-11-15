// Exact consumer-pack GTINs, checked 2026-11-15 against the Mövenpick
// sales sheet (EAN Code CU, not EAN Code TU):
// https://www.s-ge.com/system/files/downloads/2024_12_Kaffee%20DE%20Kapseln%20Salesblatt.pdf
// Names, compatibility and pack sizes are also published by the manufacturer:
const manufacturer =
  "https://professional.darboven.com/de-de/produkte/marken/moevenpick/einzelhandels-sortiment";
const products: Readonly<Record<string, string>> = {
  "4006581061030": "Crema Lungo",
  "4006581061047": "Classico Lungo",
  "4006581061054": "Der Himmlische Lungo",
  "4006581061078": "Gusto Italiano Lungo",
};

export function catalogBarcode(code: string) {
  const name = products[code];
  if (!name) return undefined;
  return {
    name,
    brand: "Mövenpick",
    system: "Original",
    pack_size: 10,
    barcodes: [code],
    source: {
      name: "Mövenpick / J.J. Darboven – geprüfter Kapselkatalog",
      url: manufacturer,
      imported_at: "2026-11-15T00:00:00.000Z",
    },
    explanation:
      "Exakte EAN-Zuordnung aus dem geprüften Kapselkatalog. Bitte mit deiner Packung vergleichen. Herstellerintensität und Preis bei Bedarf ergänzen.",
  };
}

export const catalogBarcodes = Object.keys(products);
