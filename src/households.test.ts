import { describe, it, expect } from "vitest";
import { householdSummary, personAverage } from "./households";
import type { LocalRow, Tasting } from "./domain";
function tasting(
  user: string,
  score: number,
  date = "2026-11-15",
  method = "Espresso",
  rebuy: Tasting["rebuy"] = "yes",
): LocalRow {
  return {
    id: crypto.randomUUID(),
    kind: "tastings",
    user_id: user,
    household_id: "h",
    data: {
      capsule_id: "c",
      date,
      method,
      overall: score,
      aroma: score,
      intensity: score,
      acidity: score,
      bitterness: score,
      body: score,
      notes: "",
      tags: [],
      rebuy,
    },
    version: 1,
    baseVersion: 1,
    deleted: false,
    updated_at: date,
  };
}
describe("Sinnvolle Haushaltsnoten", () => {
  it("weights each person equally even after ten versus one tastings", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => tasting("a", 8)),
      tasting("b", 6),
    ];
    expect(householdSummary(rows, "c")).toMatchObject({
      score: 7,
      count: 11,
      min: 6,
      max: 8,
    });
    expect(personAverage(rows, "c", "a")).toBe(8);
  });
  it("averages within each person before averaging the household", () => {
    const rows = [tasting("a", 4), tasting("a", 10), tasting("b", 9)];
    expect(householdSummary(rows, "c").score).toBe(8);
    expect(householdSummary(rows, "c", "aroma").score).toBe(8);
  });
  it("counts each persons latest repurchase decision once", () => {
    const rows = [
      tasting("a", 8, "2026-11-13", "Espresso", "no"),
      tasting("a", 9, "2026-11-15", "Espresso", "yes"),
      tasting("b", 5, "2026-11-14", "Espresso", "maybe"),
    ];
    expect(householdSummary(rows, "c").rebuy).toEqual({
      yes: 1,
      no: 0,
      maybe: 1,
    });
  });
  it("supports comparable preparation filters and excludes deleted reviews", () => {
    const rows = [
      tasting("a", 9, "2026-11-14", "Espresso"),
      tasting("b", 5, "2026-11-15", "Mit Milch"),
      { ...tasting("b", 1), deleted: true },
    ];
    expect(householdSummary(rows, "c", "overall", "Espresso")).toMatchObject({
      score: 9,
      count: 1,
    });
    expect(householdSummary([], "c").score).toBeNull();
    expect(personAverage(rows, "c", "unknown")).toBeNull();
  });
});
