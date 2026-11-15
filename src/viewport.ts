/** Keep the touch interface at its intended scale; keyboard/OS accessibility zoom stays native. */
export function installViewportGuards(
  doc: Document = document,
  win: Window = window,
) {
  const touchLayout = () =>
    win.matchMedia?.("(pointer: coarse)").matches || win.innerWidth <= 900;
  const blockGesture = (event: Event) => {
    if (touchLayout() && event.cancelable) event.preventDefault();
  };
  const blockMultiTouch = (event: Event) => {
    if (
      touchLayout() &&
      (event as TouchEvent).touches?.length > 1 &&
      event.cancelable
    )
      event.preventDefault();
  };
  for (const name of ["gesturestart", "gesturechange", "gestureend"])
    doc.addEventListener(name, blockGesture, { passive: false });
  for (const name of ["touchstart", "touchmove"])
    doc.addEventListener(name, blockMultiTouch, { passive: false });
  return () => {
    for (const name of ["gesturestart", "gesturechange", "gestureend"])
      doc.removeEventListener(name, blockGesture);
    for (const name of ["touchstart", "touchmove"])
      doc.removeEventListener(name, blockMultiTouch);
  };
}
