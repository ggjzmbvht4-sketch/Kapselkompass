import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { installViewportGuards } from "./viewport";
installViewportGuards();
import { registerSW } from "virtual:pwa-register";
import { announceUpdate, configureUpdates, checkForUpdate } from "./appUpdates";
const updateSW = registerSW({
  onNeedRefresh: announceUpdate,
  onRegisteredSW(_url, registration) {
    configureUpdates(() => updateSW(true), registration);
  },
});
configureUpdates(() => updateSW(true));
const checkUpdates = () => {
  if (document.visibilityState === "visible")
    void checkForUpdate().catch(() => {});
};
window.addEventListener("online", checkUpdates);
document.addEventListener("visibilitychange", checkUpdates);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
