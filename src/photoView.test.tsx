// @vitest-environment jsdom
import "fake-indexeddb/auto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoView } from "./App";
import type { LocalRow } from "./domain";
import * as store from "./store";

vi.mock("./store", () => ({ photoUrl: vi.fn() }));
vi.mock("./backend", () => ({
  supabase: null,
  configured: false,
  redirectUrl: () => "",
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = {
  id: "same-photo",
  kind: "photos",
  user_id: "u",
  data: { parent_id: "coffee", path: "u/photo", caption: "Foto" },
  version: 0,
  baseVersion: 0,
  dirty: true,
  deleted: false,
  updated_at: "2026-11-15",
  blob: new Blob(["old"]),
} as LocalRow;

describe("Photo recovery", () => {
  it("reloads the preview when a queued photo is replaced under the same ID", async () => {
    URL.revokeObjectURL = vi.fn();
    vi.mocked(store.photoUrl)
      .mockResolvedValueOnce("blob:old")
      .mockResolvedValueOnce("blob:replacement");
    const { rerender } = render(<PhotoView row={row} shared={false} />);
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:old"),
    );
    rerender(
      <PhotoView row={{ ...row, blob: new Blob(["new"]) }} shared={false} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe(
        "blob:replacement",
      ),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:old");
  });
  it("allows retry after a failed cloud download", async () => {
    URL.revokeObjectURL = vi.fn();
    vi.mocked(store.photoUrl)
      .mockRejectedValueOnce(Error("Offline"))
      .mockResolvedValueOnce("blob:download");
    render(<PhotoView row={row} shared={false} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Foto erneut laden" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:download"),
    );
  });
});
