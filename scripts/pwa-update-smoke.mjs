import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

// Only local production assets and synthetic IndexedDB data; no real accounts.
let revision = 1;
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname.replace(
    /^\/Kapselkompass\//,
    "",
  );
  const file = resolve(root, path || "index.html");
  if (!file.startsWith(root + "/")) {
    res.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    const extension = file.slice(file.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": mime[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(
      path === "sw.js"
        ? Buffer.concat([
            bytes,
            Buffer.from(`\n// test revision ${revision}\n`),
          ])
        : bytes,
    );
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/Kapselkompass/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  await context.route("https://**/*", (route) => route.abort());
  const page = await context.newPage();
  await page.goto(url + "#/profil");
  await page.getByRole("heading", { name: "App-Version 3.0.3" }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(async () => {
    const db = await new Promise((done, fail) => {
      const r = indexedDB.open("kapselkompass", 2);
      r.onsuccess = () => done(r.result);
      r.onerror = () => fail(r.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction("records_scoped", "readwrite");
      tx.objectStore("records_scoped").put({
        cache_key: "test:pending-photo",
        cache_user: "test",
        id: "pending-photo",
        kind: "photos",
        dirty: true,
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      });
      tx.oncomplete = done;
      tx.onerror = () => fail(tx.error);
    });
    db.close();
  });
  revision = 2;
  await page.getByRole("button", { name: "Nach Updates suchen" }).click();
  await page.getByRole("button", { name: "Jetzt aktualisieren" }).waitFor();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Jetzt aktualisieren" }).click(),
  ]);
  await page.getByRole("heading", { name: "App-Version 3.0.3" }).waitFor();
  const photo = await page.evaluate(async () => {
    const db = await new Promise((done) => {
      const r = indexedDB.open("kapselkompass", 2);
      r.onsuccess = () => done(r.result);
    });
    const row = await new Promise((done) => {
      const r = db
        .transaction("records_scoped")
        .objectStore("records_scoped")
        .get("test:pending-photo");
      r.onsuccess = () => done(r.result);
    });
    db.close();
    return {
      dirty: row.dirty,
      bytes: [...new Uint8Array(await row.blob.arrayBuffer())],
    };
  });
  assert.deepEqual(photo, { dirty: true, bytes: [1, 2, 3] });
  console.log(
    "Production PWA: update detected, activated and page reloaded; pending photo bytes preserved.",
  );
} finally {
  await browser.close();
  server.close();
}
