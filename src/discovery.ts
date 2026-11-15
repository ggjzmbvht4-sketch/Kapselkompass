import { supabase } from "./backend";
import { normalizeBarcode, type Capsule, type LocalRow } from "./domain";
export type Suggestion = Partial<Capsule> & {
  confidence?: "high" | "medium" | "low";
  explanation?: string;
  existing_id?: string;
};
export type BarcodeResult = {
  suggestions: Suggestion[];
  outcome: "found" | "not_found" | "unavailable";
  message?: string;
};
export async function discover(
  body: Record<string, unknown>,
): Promise<Suggestion[]> {
  return (await requestDiscovery(body))?.suggestions || [];
}
async function requestDiscovery(body: Record<string, unknown>) {
  if (!navigator.onLine)
    throw Error(
      "Die externe Erkennung benötigt Internet. Eigene Barcodes und die manuelle Erfassung funktionieren offline.",
    );
  if (!supabase) throw Error("Bitte zuerst anmelden.");
  const { data, error } = await supabase.functions.invoke("coffee-discover", {
    body,
  });
  if (error) {
    let message = "Die Erkennung ist momentan nicht erreichbar.";
    try {
      const value = await error.context?.json();
      if (value?.error) message = value.error;
    } catch {
      /* Network errors have no JSON body. */
    }
    throw Error(message);
  }
  if (data?.error) throw Error(data.error);
  return data;
}
export async function discoverBarcode(code: string): Promise<BarcodeResult> {
  const data = await requestDiscovery({ mode: "barcode", code });
  // Older deployed functions returned an empty product as a "suggestion".
  const suggestions: Suggestion[] = (data?.suggestions || []).filter(
    (s: Suggestion) => typeof s.name === "string" && s.name.trim(),
  );
  return {
    suggestions,
    outcome: suggestions.length
      ? "found"
      : data?.outcome === "unavailable"
        ? "unavailable"
        : "not_found",
    message: data?.message,
  };
}
export function ownBarcode(rows: LocalRow[], value: string) {
  const code = normalizeBarcode(value);
  return rows.find(
    (r) =>
      r.kind === "capsules" &&
      !r.deleted &&
      (r.data as Capsule).barcodes?.some((b) => {
        try {
          return normalizeBarcode(b) === code;
        } catch {
          return false;
        }
      }),
  );
}
export async function prepareImage(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Bitte JPEG, PNG oder WebP bis 10 MB wählen.");
  const object = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = object;
    await image.decode();
    const ratio = Math.min(
      1,
      1024 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Bildverarbeitung wird nicht unterstützt.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    if (data.length > 2_900_000)
      throw Error("Das Foto ist nach der Verkleinerung noch zu groß.");
    return data;
  } finally {
    URL.revokeObjectURL(object);
  }
}
