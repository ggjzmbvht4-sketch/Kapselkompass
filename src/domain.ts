export const criteria = [
  ["aroma", "Aroma", "zurückhaltend", "ausgeprägt"],
  ["intensity", "Intensität", "mild", "kräftig"],
  ["acidity", "Säure", "wenig", "viel"],
  ["bitterness", "Bitterkeit", "wenig", "viel"],
  ["body", "Körper", "leicht", "vollmundig"],
  ["overall", "Gesamtnote", "gefällt mir wenig", "ausgezeichnet"],
] as const;
export type Scores = Record<(typeof criteria)[number][0], number>;
export type Capsule = {
  name: string;
  brand: string;
  system: string;
  intensity?: number;
  price?: number;
  favorite: boolean;
  barcodes?: string[];
  pack_size?: number;
  shop_url?: string;
  source?: { name: string; url: string; imported_at: string };
};
export type Tasting = Scores & {
  capsule_id: string;
  consumed?: number;
  date: string;
  method: string;
  water?: number;
  notes: string;
  tags: string[];
  rebuy: "yes" | "no" | "maybe";
};
export type Photo = { parent_id: string; path: string; caption: string };
export type Inventory = {
  capsule_id: string;
  amount: number;
  type:
    | "opening"
    | "purchase"
    | "consume"
    | "correction"
    | "threshold"
    | "tasting";
  note: string;
  threshold?: number;
  tasting_id?: string;
  tasting_version?: number;
};
export type Kind = "capsules" | "tastings" | "photos" | "inventory";
export type RecordData = Capsule | Tasting | Photo | Inventory;
export type Row = {
  id: string;
  user_id: string;
  data: RecordData;
  version: number;
  deleted: boolean;
  updated_at: string;
};
export type LocalRow = Row & {
  kind: Kind;
  dirty?: boolean;
  baseVersion: number;
  error?: string;
  conflict?: Row;
  blob?: Blob;
  baseData?: RecordData;
  baseDeleted?: boolean;
};
export function validateTasting(t: Tasting) {
  return (
    criteria.every(
      ([k]) => Number.isInteger(t[k]) && t[k] >= 1 && t[k] <= 10,
    ) &&
    Boolean(t.capsule_id) &&
    !Number.isNaN(Date.parse(t.date)) &&
    (!t.water || t.water > 0) &&
    (t.consumed === undefined ||
      (Number.isInteger(t.consumed) && t.consumed >= 0 && t.consumed <= 1000))
  );
}
export function average(
  rows: LocalRow[],
  capsuleId: string,
  key: keyof Scores = "overall",
) {
  const values = rows
    .filter(
      (r) =>
        r.kind === "tastings" &&
        !r.deleted &&
        (r.data as Tasting).capsule_id === capsuleId,
    )
    .map((r) => (r.data as Tasting)[key]);
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
export function sameVersion(remote: Row | undefined, local: LocalRow) {
  return !remote
    ? local.baseVersion === 0
    : remote.version === local.baseVersion;
}

export function stock(rows: LocalRow[], capsuleId: string) {
  const moves = rows.filter(
    (r) =>
      r.kind === "inventory" &&
      !r.deleted &&
      (r.data as Inventory).capsule_id === capsuleId,
  );
  const opening = moves.find((r) => (r.data as Inventory).type === "opening");
  if (!opening)
    return { amount: null as number | null, threshold: 5, pending: false };
  const settings = moves
    .filter((r) => (r.data as Inventory).threshold !== undefined)
    .sort(
      (a, b) =>
        b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id),
    );
  let amount = moves.reduce((sum, r) => sum + (r.data as Inventory).amount, 0);
  // The persisted ledger already contains remote consumption. Only unsent differences are projected.
  for (const row of rows.filter((r) => r.kind === "tastings" && r.dirty)) {
    const next = row.data as Tasting,
      base = row.baseData as Tasting | undefined;
    if (!row.deleted && next.capsule_id === capsuleId)
      amount -= next.consumed || 0;
    if (!row.baseDeleted && base?.capsule_id === capsuleId)
      amount += base.consumed || 0;
  }
  return {
    amount,
    threshold: (settings[0]?.data as Inventory | undefined)?.threshold ?? 5,
    pending:
      moves.some((r) => r.dirty) ||
      rows.some(
        (r) =>
          r.kind === "tastings" &&
          r.dirty &&
          ((r.data as Tasting).capsule_id === capsuleId ||
            (r.baseData as Tasting | undefined)?.capsule_id === capsuleId),
      ),
  };
}
export function normalizeBarcode(value: string) {
  const code = value.replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code))
    throw Error("Bitte einen EAN-8-, EAN-13- oder UPC-A-Code eingeben.");
  const digits = [...code].map(Number),
    check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== check)
    throw Error(
      "Die Prüfziffer des Barcodes stimmt nicht. Bitte erneut scannen.",
    );
  return code.length === 12 ? "0" + code : code;
}
