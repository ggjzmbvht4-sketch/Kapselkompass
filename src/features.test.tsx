// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { EntryForm } from "./App";
import InventoryPanel from "./InventoryPanel";
import DiscoveryPanel from "./DiscoveryPanel";
import { criteria, type LocalRow } from "./domain";
vi.mock("./backend", () => ({
  supabase: null,
  configured: false,
  redirectUrl: () => "",
}));
vi.mock("./discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discovery")>()),
  discover: vi.fn(async () => [
    {
      name: "Erkannter Kaffee",
      brand: "KaffeK",
      system: "Original",
      pack_size: 50,
    },
  ]),
}));
const capsule = {
  id: "c",
  kind: "capsules",
  user_id: "u",
  data: {
    name: "Testkaffee",
    brand: "Test",
    system: "Original",
    favorite: false,
    barcodes: ["4006381333931"],
    pack_size: 20,
  },
  version: 1,
  baseVersion: 1,
  deleted: false,
  updated_at: "2026-11-15",
} as LocalRow;
const opening = {
  ...capsule,
  id: "open",
  kind: "inventory",
  data: { capsule_id: "c", type: "opening", amount: 10, note: "" },
} as LocalRow;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Erfassung und Bestand bedienen", () => {
  it("requires an explicit stock decision and saves zero when no consumption is chosen", async () => {
    const save = vi.fn();
    const { container } = render(
      <EntryForm
        kind="tastings"
        capsule="c"
        capsules={[capsule]}
        rows={[capsule, opening]}
        demo
        save={save}
        onExisting={vi.fn()}
      />,
    );
    for (const [, label] of criteria)
      fireEvent.click(
        screen.getByRole("button", { name: `${label}: 7 von 10` }),
      );
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("ausdrücklich"),
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Verbrauch bestätigen"), {
      target: { value: "no" },
    });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].consumed).toBe(0);
  });
  it("allows explicit consumption only with an opening balance", () => {
    render(
      <EntryForm
        kind="tastings"
        capsule="c"
        capsules={[capsule]}
        rows={[capsule]}
        demo
        save={vi.fn()}
        onExisting={vi.fn()}
      />,
    );
    expect(
      (
        screen.getByRole("option", {
          name: "Ja, Verbrauch buchen",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
  });
  it("converts a purchase from packs into a single stock movement", async () => {
    const save = vi.fn();
    const { container } = render(
      <InventoryPanel
        rows={[capsule, opening]}
        capsule={capsule}
        onSave={save}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Buchung hinzufügen" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Packungen statt einzelner Kapseln buchen",
      }),
    );
    fireEvent.change(screen.getByLabelText("Anzahl Packungen"), {
      target: { value: "3" },
    });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 60,
          type: "purchase",
          capsule_id: "c",
        }),
      ),
    );
  });
  it("looks up own barcodes without a cloud request and opens the existing capsule", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    render(
      <DiscoveryPanel
        capsules={[capsule]}
        demo
        onSuggest={vi.fn()}
        onExisting={open}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Barcode" }));
    fireEvent.change(screen.getByLabelText("Barcode-Ziffern"), {
      target: { value: "4006381333931" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suchen" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Eigene Sorte öffnen" }),
    );
    expect(open).toHaveBeenCalledWith("c");
  });
  it("does not send photos without both an image and consent", () => {
    render(
      <DiscoveryPanel
        capsules={[]}
        demo={false}
        onSuggest={vi.fn()}
        onExisting={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Foto erkennen" }));
    const buttons = screen.getAllByRole("button", { name: "Foto erkennen" });
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("checkbox").hasAttribute("checked")).toBe(false);
  });
  it("shows shop data as a proposal instead of saving automatically", async () => {
    const suggest = vi.fn();
    render(
      <DiscoveryPanel
        capsules={[]}
        demo={false}
        onSuggest={suggest}
        onExisting={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Shop-Link" }));
    fireEvent.change(screen.getByLabelText("Produktlink"), {
      target: { value: "https://kaffek.de/test.html" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Daten abrufen" }));
    const apply = await screen.findByRole("button", {
      name: "Angaben zur Prüfung übernehmen",
    });
    expect(suggest).not.toHaveBeenCalled();
    fireEvent.click(apply);
    expect(suggest).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Erkannter Kaffee", pack_size: 50 }),
    );
  });
});
