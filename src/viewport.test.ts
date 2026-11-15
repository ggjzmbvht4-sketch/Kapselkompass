// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { installViewportGuards } from "./viewport";
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});
function event(type: string, touches?: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  if (touches !== undefined)
    Object.defineProperty(e, "touches", {
      value: Array.from({ length: touches }, () => ({})),
    });
  document.dispatchEvent(e);
  return e;
}
describe("Touch app viewport", () => {
  it("blocks Safari pinch gestures and multitouch zoom on phone layouts", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    dispose = installViewportGuards();
    expect(event("gesturestart").defaultPrevented).toBe(true);
    expect(event("gesturechange").defaultPrevented).toBe(true);
    expect(event("touchmove", 2).defaultPrevented).toBe(true);
  });
  it("keeps one-finger scrolling and desktop keyboard shortcuts native", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    dispose = installViewportGuards();
    expect(event("touchmove", 1).defaultPrevented).toBe(false);
    expect(event("keydown").defaultPrevented).toBe(false);
    dispose();
    expect(event("gesturestart").defaultPrevented).toBe(false);
  });
  it("does not intercept desktop trackpad zoom", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1440);
    dispose = installViewportGuards();
    expect(event("gesturestart").defaultPrevented).toBe(false);
  });
});
