import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const base = process.env.APP_URL || "http://127.0.0.1:5173/Kapselkompass/";
const probe = process.env.PROBE === "1";
const uid = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  home = "33333333-3333-4333-8333-333333333333",
  cap = "44444444-4444-4444-8444-444444444444",
  sharedCap = "55555555-5555-4555-8555-555555555555";
const long = "SehrLangerKaffeenameOhneLeerzeichen".repeat(5),
  email = "sehr.lange.email.adresse.fuer.den.layouttest@example.invalid";
const now = new Date().toISOString();
const record = (id, user, data, household_id = null) => ({
  id,
  user_id: user,
  household_id,
  data,
  version: 1,
  deleted: false,
  updated_at: now,
});
const coffee = {
  name: long,
  brand: "Eine sehr lange Kaffeemarke zum Testen schmaler Geräte",
  system: "Original",
  favorite: false,
};
const review = {
  capsule_id: cap,
  date: now,
  method: "Espresso mit einer ausführlichen Zubereitungsbeschreibung",
  aroma: 8,
  intensity: 7,
  acidity: 4,
  bitterness: 6,
  body: 8,
  overall: 9,
  notes:
    "https://example.invalid/" +
    "tagebucheintrag".repeat(35) +
    "\n" +
    "Eine ausführliche Notiz zu diesem Kaffee. ".repeat(12),
  tags: [long, "Schokolade"],
  rebuy: "yes",
  consumed: 0,
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=",
  "base64",
);
const rows = {
  capsules: [record(cap, uid, coffee), record(sharedCap, uid, coffee, home)],
  tastings: [
    record("66666666-6666-4666-8666-666666666666", uid, review),
    record(
      "77777777-7777-4777-8777-777777777777",
      other,
      { ...review, capsule_id: sharedCap },
      home,
    ),
  ],
  inventory: [],
  photos: [],
  preferences: [],
};
const state = {
  households: [
    {
      id: home,
      name: "Unser Haushalt mit einem ausführlichen Namen zum Testen",
      owner_id: uid,
      members: [
        { user_id: uid, name: "Ada" },
        { user_id: other, name: long },
      ],
      authors: [],
      invitations: [{ id: "invite", email }],
    },
  ],
  invitations: [],
};
const fakeToken = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({
      sub: uid,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "browser-test-signature",
].join(".");
const user = {
  id: uid,
  email: "mobile-test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: now,
  app_metadata: {},
  user_metadata: {},
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const width of process.env.WIDTHS
    ? process.env.WIDTHS.split(",").map(Number)
    : [320, 375, 390, 430, 768]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 1,
      isMobile: width < 650,
      hasTouch: width < 650,
    });
    await context.addInitScript(
      ({ user, fakeToken }) => {
        localStorage.setItem(
          "sb-izeljoxjipzfdwuqzrqv-auth-token",
          JSON.stringify({
            access_token: fakeToken,
            refresh_token: "browser-test-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        );
      },
      { user, fakeToken },
    );
    await context.route("**/fonts.googleapis.com/**", (route) => route.abort());
    await context.route("**/fonts.gstatic.com/**", (route) => route.abort());
    const uploads = [];
    await context.route(
      "https://izeljoxjipzfdwuqzrqv.supabase.co/**",
      async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        let data = {};
        if (url.pathname.startsWith("/storage/v1/object/coffee-photos/")) {
          if (request.method() === "POST") {
            uploads.push({
              type: request.headers()["content-type"],
              bytes: request.postDataBuffer(),
            });
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                Id: "uploaded-photo",
                Key: "coffee-photos/queued-photo",
              }),
            });
          } else
            await route.fulfill({
              status: 200,
              contentType: "image/png",
              body: png,
            });
          return;
        }
        if (url.pathname.includes("/auth/v1/")) data = user;
        else if (url.pathname.endsWith("/rpc/coffee_household_state"))
          data = state;
        else if (url.pathname.endsWith("/rpc/coffee_save_record")) {
          const input = request.postDataJSON();
          data = record(input.p_id, uid, input.p_data, input.p_household);
          data.version = input.p_expected + 1;
          data.deleted = input.p_deleted;
          rows[input.p_kind] = [
            ...rows[input.p_kind].filter((r) => r.id !== data.id),
            data,
          ];
        } else if (url.pathname.includes("/rest/v1/coffee_profiles"))
          data = { id: uid, display_name: "Ada" };
        else if (url.pathname.includes("/rest/v1/coffee_")) {
          const table = url.pathname.split("/").pop().replace("coffee_", "");
          data = rows[table] || [];
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      },
    );
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel("Privaten Bereich oder Haushalt wählen").waitFor();
    const check = async (label) => {
      const sizes = await page.evaluate(() => ({
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
        scale: window.visualViewport?.scale || 1,
        fields: [
          ...document.querySelectorAll(
            "input:not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea",
          ),
        ]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => ({
            name: e.getAttribute("aria-label") || e.getAttribute("name"),
            font: parseFloat(getComputedStyle(e).fontSize),
            right: Math.round(e.getBoundingClientRect().right),
          })),
        wide: [
          ...document.querySelectorAll(
            ".tasting,.notes,.panel,.entry-form,dialog,.household-context,.household-ratings,.compare-picker>.chip,.toolbar,.filters,.share-form,.capture-row,input:not([type=file]),select,textarea",
          ),
        ]
          .filter(
            (e) =>
              e.getBoundingClientRect().width &&
              (e.getBoundingClientRect().right > innerWidth + 1 ||
                e.getBoundingClientRect().left < -1),
          )
          .map((e) => ({
            tag: e.className,
            right: Math.round(e.getBoundingClientRect().right),
          })),
      }));
      console.log(JSON.stringify({ width, label, ...sizes }));
      if (sizes.page > width + 1)
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll("*")]
              .filter(
                (e) =>
                  e.getBoundingClientRect().right >
                  document.documentElement.clientWidth + 1,
              )
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                right: Math.round(e.getBoundingClientRect().right),
                width: Math.round(e.getBoundingClientRect().width),
                scroll: e.scrollWidth,
                client: e.clientWidth,
                text: e.textContent?.slice(0, 40),
              }))
              .slice(0, 20),
          ),
        );
      if (!probe) {
        assert.ok(
          sizes.fields.every((f) => width > 650 || f.font >= 16),
          `${label} contains fields that trigger iPhone focus zoom at ${width}`,
        );
        assert.equal(sizes.scale, 1, `${label} starts with a zoomed viewport`);
        const horizontal = await page.evaluate(() => {
          const y = scrollY;
          window.scrollTo(200, y);
          const x = scrollX;
          window.scrollTo(0, y);
          return x;
        });
        assert.equal(horizontal, 0, `${label} can move sideways at ${width}`);
        assert.ok(
          sizes.page <= width + 1,
          `${label} page overflows at ${width}: ${sizes.page}`,
        );
        assert.deepEqual(
          sizes.wide,
          [],
          `${label} content overflows at ${width}`,
        );
      }
    };
    await check("home");
    await page
      .getByRole("button", { name: "Kaffee hinzufügen", exact: true })
      .first()
      .click();
    await page.locator("dialog").waitFor();
    await check("capsule-form");
    for (const name of ["Barcode", "Shop-Link", "Foto erkennen"]) {
      await page
        .locator(".capture-tabs")
        .getByRole("button", { name, exact: true })
        .click();
      if (name === "Barcode") {
        if (width === 390) await context.setOffline(true);
        await page.getByLabel("Barcode-Ziffern").fill("4006581061030");
        await page.getByRole("button", { name: "Suchen", exact: true }).click();
        await page
          .getByText("Mövenpick Crema Lungo", { exact: true })
          .waitFor();
        await page
          .getByRole("button", {
            name: "Angaben zur Prüfung übernehmen",
            exact: true,
          })
          .click();
        assert.equal(
          await page.locator('dialog input[name="name"]').inputValue(),
          "Crema Lungo",
        );
        assert.equal(
          await page.locator('dialog input[name="brand"]').inputValue(),
          "Mövenpick",
        );
        assert.equal(
          await page.locator('dialog input[name="pack_size"]').inputValue(),
          "10",
        );
        assert.equal(
          await page.locator('dialog input[name="barcodes"]').inputValue(),
          "4006581061030",
        );
        if (width === 390) await context.setOffline(false);
      }
      await check("capture-" + name);
    }
    await page
      .locator("dialog")
      .getByRole("button", { name: "Schließen", exact: true })
      .click();
    for (const route of ["/sammlung", "/vergleich", "/profil"]) {
      await page.evaluate((value) => {
        location.hash = value;
      }, route);
      await page.waitForTimeout(150);
      if (route === "/sammlung") await page.locator(".filter-button").click();
      if (route === "/vergleich")
        await page.locator(".compare-picker .chip").first().click();
      await check(route);
    }
    await page.evaluate((id) => {
      location.hash = "/kaffee/" + id;
    }, cap);
    await page.locator(".tasting").first().waitFor();
    await check("private-diary");
    if (width < 650 && !probe) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.synthesizePinchGesture", {
        x: width / 2,
        y: 300,
        scaleFactor: 1.6,
        relativeSpeed: 800,
        gestureSourceType: "touch",
      });
      assert.equal(
        await page.evaluate(() => visualViewport.scale),
        1,
        "Touch pinch must not change app scale",
      );
      const vertical = await page.evaluate(() => {
        window.scrollTo(0, 200);
        const value = scrollY;
        window.scrollTo(0, 0);
        return value;
      });
      assert.ok(
        vertical > 0,
        "Normal vertical scrolling must remain available",
      );
      await cdp.detach();
    }
    if (width === 390 && !probe) {
      await page.getByRole("button", { name: "Verkostung hinzufügen" }).click();
      await page.locator("dialog").waitFor();
      for (const label of [
        "Aroma",
        "Intensität",
        "Säure",
        "Bitterkeit",
        "Körper",
        "Gesamtnote",
      ])
        await page
          .getByRole("button", { name: `${label}: 7 von 10`, exact: true })
          .click();
      await page.getByLabel("Verbrauch bestätigen").selectOption("no");
      await page.locator("dialog .upload input").setInputFiles({
        name: "Galeriefoto.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page.getByText("1 Foto(s) ausgewählt", { exact: true }).waitFor();
      const acknowledged = page.waitForResponse(
        (response) =>
          response.url().endsWith("/rpc/coffee_save_record") &&
          response.request().postDataJSON()?.p_kind === "photos",
      );
      await page
        .getByRole("button", { name: "In meinem Tagebuch speichern" })
        .click();
      await page.locator("dialog").waitFor({ state: "detached" });
      const image = page
        .locator('.tasting .photo img[alt="Galeriefoto.png"]')
        .first();
      await image.waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector(
          '.tasting .photo img[alt="Galeriefoto.png"]',
        );
        return (
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth > 0
        );
      });
      await acknowledged;
      const uploaded = await page.evaluate(async (uid) => {
        const store = await import("/Kapselkompass/src/store.ts");
        await store.sync(uid);
        return (await store.list(uid)).find(
          (r) => r.kind === "photos" && r.data.caption === "Galeriefoto.png",
        );
      }, uid);
      assert.equal(Boolean(uploaded?.dirty), false);
      assert.ok(
        uploads.length,
        "The saved gallery photo must be uploaded before acknowledgement",
      );
      assert.equal(uploads.at(-1).type, "image/png");
      assert.deepEqual(uploads.at(-1).bytes, png);
      console.log(
        "Photo flow: gallery selection, diary save, raw binary upload, metadata acknowledgement and decoded preview passed.",
      );
      const result = await page.evaluate(
        async ({ uid, cap, bytes }) => {
          const store = await import("/Kapselkompass/src/store.ts");
          const photo = await store.save(
            uid,
            "photos",
            {
              parent_id: cap,
              path: uid + "/queued-photo",
              caption: "Bereits lokal gespeichertes Foto",
            },
            undefined,
            new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          );
          await store.sync(uid);
          const saved = (await store.list(uid)).find((r) => r.id === photo.id);
          return { dirty: Boolean(saved?.dirty), error: saved?.error };
        },
        { uid, cap, bytes: [...png] },
      );
      assert.equal(result.dirty, false, result.error);
      assert.ok(uploads.length > 0);
      assert.equal(uploads.at(-1).type, "image/png");
      assert.deepEqual(uploads.at(-1).bytes, png);
      console.log(
        "Queued photo: real SDK sent nonempty raw PNG bytes and acknowledged metadata.",
      );
    }
    if (width === 390)
      await page.screenshot({
        path: probe
          ? "/tmp/kapsel-mobile-before.png"
          : "/tmp/kapsel-mobile-after.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "Verkostung hinzufügen" }).click();
    await page.locator("dialog").waitFor();
    await check("tasting-form");
    for (const [label, left, right] of [
      ["Aroma", "zurückhaltend", "ausgeprägt"],
      ["Intensität", "mild", "kräftig"],
      ["Säure", "wenig", "viel"],
      ["Bitterkeit", "wenig", "viel"],
      ["Körper", "leicht", "vollmundig"],
      ["Gesamtnote", "gefällt mir wenig", "ausgezeichnet"],
    ]) {
      const scale = page.getByRole("group", { name: label, exact: true });
      assert.ok(
        (await scale.locator(".rating-description").innerText()).includes(
          `1: ${left}`,
        ),
      );
      assert.ok(
        (await scale.locator(".rating-description").innerText()).includes(
          `10: ${right}`,
        ),
      );
      await scale
        .getByRole("button", { name: `${label}: 10 von 10`, exact: true })
        .click();
      assert.equal(
        await scale.locator(".rating-selection").innerText(),
        "Ausgewählt: 10 von 10",
      );
    }
    if (width === 390)
      await page.screenshot({
        path: "/tmp/kapsel-rating-after.png",
        fullPage: true,
      });
    const dialog = await page
      .locator("dialog")
      .evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
    console.log(JSON.stringify({ width, label: "dialog-inner", ...dialog }));
    if (!probe)
      assert.ok(
        dialog.scroll <= dialog.client + 1,
        `Diary form inner overflow at ${width}`,
      );
    await page
      .locator("dialog")
      .getByRole("button", { name: "Schließen", exact: true })
      .click();
    await page
      .getByLabel("Privaten Bereich oder Haushalt wählen")
      .selectOption(home);
    await page.evaluate((id) => {
      location.hash = "/kaffee/" + id;
    }, sharedCap);
    await page.locator(".household-ratings").waitFor();
    await check("household-diary");
    if (!probe && width < 650) {
      const table = await page.locator(".table-scroll").evaluate((e) => {
        e.scrollLeft = 100;
        return {
          scroll: e.scrollLeft,
          width: e.clientWidth,
          full: e.scrollWidth,
        };
      });
      assert.ok(
        table.full <= table.width || table.scroll > 0,
        "Comparison table must retain independent horizontal scrolling",
      );
    }

    await page.evaluate(() => {
      location.hash = "/haushalte";
    });
    await page.locator(".households-page").waitFor();
    await check("household-management");
    await context.close();
  }
} finally {
  await browser.close();
}
