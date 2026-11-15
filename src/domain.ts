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
};
export type Tasting = Scores & {
  capsule_id: string;
  date: string;
  method: string;
  water?: number;
  notes: string;
  tags: string[];
  rebuy: "yes" | "no" | "maybe";
};
export type Photo = { parent_id: string; path: string; caption: string };
export type Kind = "capsules" | "tastings" | "photos";
export type RecordData = Capsule | Tasting | Photo;
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
};
export function validateTasting(t: Tasting) {
  return (
    criteria.every(
      ([k]) => Number.isInteger(t[k]) && t[k] >= 1 && t[k] <= 10,
    ) &&
    Boolean(t.capsule_id) &&
    !Number.isNaN(Date.parse(t.date)) &&
    (!t.water || t.water > 0)
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
