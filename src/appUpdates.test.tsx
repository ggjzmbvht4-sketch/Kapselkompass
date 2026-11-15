// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("PWA updates preserve the local diary", () => {
  it("shows an update announced before the React view subscribes and activates only on request", async () => {
    const updates = await import("./appUpdates");
    const { AppUpdateNotice } = await import("./AppUpdate");
    const activate = vi.fn(async () => {});
    updates.configureUpdates(activate);
    updates.announceUpdate();
    const { rerender } = render(<AppUpdateNotice editing />);
    const button = screen.getByRole("button", {
      name: "Jetzt aktualisieren",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    rerender(<AppUpdateNotice editing={false} />);
    fireEvent.click(button);
    await waitFor(() => expect(activate).toHaveBeenCalledOnce());
    expect(screen.getByText(/ausstehende Fotos bleiben erhalten/)).toBeTruthy();
  });

  it("checks the registered service worker and detects an already waiting update", async () => {
    const updates = await import("./appUpdates");
    const update = vi.fn(async () => {});
    const activate = vi.fn(async () => {});
    updates.configureUpdates(activate, {
      update,
      waiting: {},
    } as unknown as ServiceWorkerRegistration);
    expect(await updates.checkForUpdate()).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
  });
});
