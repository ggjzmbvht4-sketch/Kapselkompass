import { supabase } from "./backend";
import { average, type LocalRow, type Scores, type Tasting } from "./domain";
export type Person = { user_id: string; name: string };
export type Household = {
  id: string;
  name: string;
  owner_id: string;
  members: Person[];
  authors: Person[] | null;
  invitations: { id: string; email: string }[];
};
export type HouseholdState = {
  households: Household[];
  invitations: {
    id: string;
    household_id: string;
    name: string;
    inviter: string;
  }[];
  warning?: string;
};
export const emptyHouseholds: HouseholdState = {
  households: [],
  invitations: [],
};
export async function householdAction(
  action: string,
  args: Record<string, unknown> = {},
) {
  if (!navigator.onLine || !supabase)
    throw Error("Diese Haushaltsaktion benötigt eine Anmeldung und Internet.");
  const { data, error } = await supabase.rpc("coffee_household_action", {
    p_action: action,
    ...args,
  });
  if (error) throw error;
  return data;
}
export function personAverage(
  rows: LocalRow[],
  capsule: string,
  user: string,
  key: keyof Scores = "overall",
) {
  return average(
    rows.filter((r) => r.user_id === user),
    capsule,
    key,
  );
}
export function householdSummary(
  rows: LocalRow[],
  capsule: string,
  key: keyof Scores = "overall",
  method = "",
) {
  const tastings = rows.filter(
    (r) =>
      r.kind === "tastings" &&
      !r.deleted &&
      (r.data as Tasting).capsule_id === capsule &&
      (!method || (r.data as Tasting).method === method),
  );
  const people = [...new Set(tastings.map((r) => r.user_id))].map((id) => ({
    id,
    score: personAverage(tastings, capsule, id, key)!,
    count: tastings.filter((r) => r.user_id === id).length,
  }));
  const latest = people.map(
    (p) =>
      tastings
        .filter((r) => r.user_id === p.id)
        .sort(
          (a, b) =>
            (b.data as Tasting).date.localeCompare((a.data as Tasting).date) ||
            b.id.localeCompare(a.id),
        )[0].data as Tasting,
  );
  return {
    score: people.length
      ? people.reduce((s, p) => s + p.score, 0) / people.length
      : null,
    people,
    count: tastings.length,
    min: people.length ? Math.min(...people.map((p) => p.score)) : null,
    max: people.length ? Math.max(...people.map((p) => p.score)) : null,
    rebuy: {
      yes: latest.filter((t) => t.rebuy === "yes").length,
      no: latest.filter((t) => t.rebuy === "no").length,
      maybe: latest.filter((t) => t.rebuy === "maybe").length,
    },
  };
}
