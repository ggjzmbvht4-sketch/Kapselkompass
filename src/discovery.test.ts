// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("./backend", () => ({ supabase: { functions: { invoke } } }));
import { discoverBarcode } from "./discovery";
beforeEach(() => invoke.mockReset());
describe("Barcode responses from current and older functions", () => {
  it("does not turn a legacy empty suggestion into a found product", async () => {
    invoke.mockResolvedValue({
      data: {
        suggestions: [
          { barcodes: ["4006581061030"], explanation: "Nicht gefunden" },
        ],
      },
      error: null,
    });
    expect(await discoverBarcode("4006581061030")).toMatchObject({
      suggestions: [],
      outcome: "not_found",
    });
  });
  it("preserves provider outages instead of reporting an empty catalog", async () => {
    invoke.mockResolvedValue({
      data: {
        suggestions: [],
        outcome: "unavailable",
        message: "Anfragelimit erreicht",
      },
      error: null,
    });
    expect(await discoverBarcode("4006581061030")).toMatchObject({
      outcome: "unavailable",
      message: "Anfragelimit erreicht",
    });
  });
});
