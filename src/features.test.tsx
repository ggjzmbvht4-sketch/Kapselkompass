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
import HouseholdPanel from "./HouseholdPanel";
import HouseholdRatings from "./HouseholdRatings";
import { householdAction, type Household } from "./households";
vi.mock("./households", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./households")>()),
  householdAction: vi.fn(async () => ({ id: "house" })),
}));
vi.mock("./backend", () => ({
  supabase: null,
  sessionClient: async () => null,
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

const family: Household = {
  id: "house",
  name: "Unsere Kaffeebar",
  owner_id: "a",
  members: [
    { user_id: "a", name: "Ada" },
    { user_id: "b", name: "Bea" },
  ],
  authors: [{ user_id: "c", name: "Cora" }],
  invitations: [],
};
describe("Haushalte bedienen und Bewertungen vergleichen", () => {
  it("creates a household from the explicit form and opens it after refresh", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined),
      select = vi.fn();
    render(
      <HouseholdPanel
        user="a"
        state={{ households: [], invitations: [] }}
        rows={[]}
        onRefresh={refresh}
        onSelect={select}
        onImported={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name des neuen Haushalts"), {
      target: { value: "Unsere Kaffeebar" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Haushalt anlegen" }));
    await waitFor(() =>
      expect(householdAction).toHaveBeenCalledWith("create", {
        p_name: "Unsere Kaffeebar",
      }),
    );
    await waitFor(() => expect(select).toHaveBeenCalledWith("house"));
    expect(refresh).toHaveBeenCalled();
  });
  it("does not accept an invitation until the person explicitly joins", async () => {
    const select = vi.fn();
    render(
      <HouseholdPanel
        user="b"
        state={{
          households: [],
          invitations: [
            {
              id: "invite",
              household_id: "house",
              name: "Unsere Kaffeebar",
              inviter: "Ada",
            },
          ],
        }}
        rows={[]}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSelect={select}
        onImported={vi.fn()}
      />,
    );
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Beitreten" }));
    await waitFor(() =>
      expect(householdAction).toHaveBeenCalledWith("accept", {
        p_invitation: "invite",
      }),
    );
  });
  it("exposes management actions only to the household owner", () => {
    render(
      <HouseholdPanel
        user="b"
        state={{ households: [family], invitations: [] }}
        rows={[]}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Haushalt verlassen" }),
    ).toBeTruthy();
  });
  it("shows equal-person scores and makes former-member inclusion explicit", () => {
    const tasting = (user: string, score: number) =>
      ({
        ...capsule,
        id: crypto.randomUUID(),
        kind: "tastings",
        user_id: user,
        household_id: "house",
        data: {
          capsule_id: "c",
          date: "2026-11-15",
          method: "Espresso",
          overall: score,
          aroma: score,
          intensity: score,
          acidity: score,
          bitterness: score,
          body: score,
          rebuy: "yes",
          notes: "",
          tags: [],
        },
      }) as LocalRow;
    const rows = [
      ...Array.from({ length: 10 }, () => tasting("a", 8)),
      tasting("b", 6),
      tasting("c", 1),
    ];
    const { container } = render(
      <HouseholdRatings rows={rows} capsule="c" household={family} user="a" />,
    );
    expect(
      container.querySelector(".house-rating-summary strong")?.textContent,
    ).toContain("7");
    expect(screen.queryByText("Cora (ehemalig)")).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Historische Beiträge ehemaliger Mitglieder einbeziehen",
      }),
    );
    expect(screen.getByText("Cora (ehemalig)")).toBeTruthy();
    expect(
      container.querySelector(".house-rating-summary strong")?.textContent,
    ).toContain("5");
  });
});
