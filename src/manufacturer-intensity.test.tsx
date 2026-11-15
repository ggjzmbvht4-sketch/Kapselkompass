// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  formatManufacturerIntensity,
  normalizedManufacturerIntensity,
  parseManufacturerIntensity,
  type Capsule,
} from "./domain";
import {
  ManufacturerIntensityComparison,
  ManufacturerIntensityFields,
} from "./ManufacturerIntensity";
afterEach(cleanup);
describe("Manufacturer intensity with an explicit scale", () => {
  it("preserves the original ratio and converts only for comparison", () => {
    const c = parseManufacturerIntensity("9", "13");
    expect(c).toEqual({ intensity: 9, intensity_max: 13 });
    expect(formatManufacturerIntensity(c)).toBe("9/13");
    expect(normalizedManufacturerIntensity(c)).toBeCloseTo(6.9230769);
    expect(
      normalizedManufacturerIntensity({ intensity: 7, intensity_max: 10 }),
    ).toBe(7);
  });
  it("never assumes /10 for a legacy value and rejects incomplete or invalid pairs", () => {
    expect(formatManufacturerIntensity({ intensity: 7 })).toContain(
      "Skala fehlt",
    );
    expect(normalizedManufacturerIntensity({ intensity: 7 })).toBeNull();
    expect(parseManufacturerIntensity("", "")).toEqual({});
    for (const [value, maximum] of [
      ["7", ""],
      ["", "10"],
      ["11", "10"],
      ["7", "0"],
      ["7.5", "10"],
      ["7", "10.5"],
    ])
      expect(() => parseManufacturerIntensity(value, maximum)).toThrow();
  });
  it("requires both numbers and previews the normalized comparison", () => {
    render(<ManufacturerIntensityFields capsule={{ intensity: 9 }} />);
    const max = screen.getByRole("spinbutton", {
      name: "Herstellerintensität Skalenmaximum",
    }) as HTMLInputElement;
    expect(max.required).toBe(true);
    expect(max.value).toBe("");
    fireEvent.change(max, { target: { value: "13" } });
    expect(screen.getByRole("status").textContent).toContain("6,9/10");
  });
  it("shows original and normalized values separately and excludes unscaled records", () => {
    const capsule = {
      name: "Kaffee",
      brand: "Marke",
      system: "Original",
      favorite: false,
      intensity: 9,
      intensity_max: 13,
    } as Capsule;
    const { rerender } = render(
      <ManufacturerIntensityComparison capsule={capsule} />,
    );
    expect(screen.getByText("Packungsangabe: 9/13")).toBeTruthy();
    expect(screen.getByText("6,9")).toBeTruthy();
    rerender(
      <ManufacturerIntensityComparison
        capsule={{ ...capsule, intensity_max: undefined }}
      />,
    );
    expect(screen.getByText(/Skala ergänzen/)).toBeTruthy();
    expect(screen.queryByText("6,9")).toBeNull();
  });
});
