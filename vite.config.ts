import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).version,
    ),
  },
  base: "/Kapselkompass/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Kapselkompass – Dein Kaffeetagebuch",
        short_name: "Kapselkompass",
        description: "Entdecke deinen Kaffeegeschmack.",
        lang: "de",
        theme_color: "#34271f",
        background_color: "#f6f3ed",
        display: "standalone",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [],
      },
    }),
  ],
});
