import { useSyncExternalStore } from "react";

export const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
let ready = false;
let registration: ServiceWorkerRegistration | undefined;
let activate: (() => Promise<void>) | undefined;
const listeners = new Set<() => void>();

export function announceUpdate() {
  ready = true;
  listeners.forEach((listener) => listener());
}
export function configureUpdates(
  updater: () => Promise<void>,
  worker?: ServiceWorkerRegistration,
) {
  activate = updater;
  if (worker) registration = worker;
  if (registration?.waiting) announceUpdate();
}
export function useUpdateReady() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => ready,
  );
}
export async function checkForUpdate() {
  if (!navigator.onLine)
    throw Error(
      "Bitte für die Aktualisierung eine Internetverbindung herstellen.",
    );
  if (!registration) return false;
  await registration.update();
  if (registration.waiting) announceUpdate();
  return ready;
}
export async function applyUpdate() {
  if (!ready || !activate)
    throw Error("Noch keine Aktualisierung bereit. Bitte erneut prüfen.");
  await activate();
}
