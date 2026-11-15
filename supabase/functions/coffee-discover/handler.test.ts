import {
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
  afterAll,
} from "vitest";
let handler: (req: Request) => Promise<Response>;
const values: Record<string, string> = {
  SUPABASE_URL: "https://backend.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "server-secret",
};
let calls: string[] = [];
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: (key: string) => values[key] },
    serve: (f: typeof handler) => {
      handler = f;
    },
  });
  await import("./index.ts");
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  calls = [];
  delete values.OPENROUTER_API_KEY;
  delete values.COFFEE_AI_ENABLED;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/auth/v1/user"))
        return Response.json({ id: "u", email_confirmed_at: "2026-11-15" });
      if (url.includes("/rpc/")) return Response.json(null);
      throw Error("Unexpected fetch");
    }),
  );
});
const request = (body: unknown, authenticated = true) =>
  new Request("https://edge.test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: "Bearer user-token" } : {}),
    },
    body: JSON.stringify(body),
  });
describe("Edge Function authentication and AI boundary", () => {
  it("rejects anonymous requests before any external call", async () => {
    expect(
      (
        await handler(
          request({ mode: "barcode", code: "4006381333931" }, false),
        )
      ).status,
    ).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it("keeps AI disabled until both the key and the enable flag are configured", async () => {
    const result = await handler(
      request({
        mode: "ai",
        consent: true,
        image: "data:image/jpeg;base64,AAAA",
      }),
    );
    expect(result.status).toBe(503);
    expect(calls.some((url) => url.includes("/rpc/"))).toBe(false);
  });
  it("requires consent and rejects untrusted external image URLs", async () => {
    values.OPENROUTER_API_KEY = "key";
    values.COFFEE_AI_ENABLED = "true";
    expect(
      (
        await handler(
          request({
            mode: "ai",
            consent: false,
            image: "data:image/jpeg;base64,AAAA",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler(
          request({
            mode: "ai",
            consent: true,
            image: "https://internal.test/photo",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("stops before paid inference when the atomic daily quota is exhausted", async () => {
    values.OPENROUTER_API_KEY = "key";
    values.COFFEE_AI_ENABLED = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.includes("/auth/")
          ? Response.json({ id: "u", email_confirmed_at: "now" })
          : Response.json({ message: "Tageslimit erreicht" }, { status: 400 });
      }),
    );
    const r = await handler(
      request({
        mode: "ai",
        consent: true,
        image: "data:image/jpeg;base64,AAAA",
      }),
    );
    expect(r.status).toBe(429);
    expect(calls).toHaveLength(2);
  });
  it("returns bounded suggestions and never accepts invented own-capsule IDs", async () => {
    values.OPENROUTER_API_KEY = "key";
    values.COFFEE_AI_ENABLED = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        if (url.includes("/auth/"))
          return Response.json({ id: "u", email_confirmed_at: "now" });
        if (url.includes("/rpc/")) return Response.json(null);
        const payload = JSON.parse(String(init.body));
        expect(payload.model).toBe("google/gemini-2.5-flash-lite");
        expect(payload.provider.allow_fallbacks).toBe(false);
        expect(payload.max_tokens).toBe(1200);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      name: "Vielleicht Kaffee",
                      confidence: "low",
                      existing_id: "invented",
                    },
                  ],
                }),
              },
            },
          ],
        });
      }),
    );
    const r = await handler(
      request({
        mode: "ai",
        consent: true,
        image: "data:image/jpeg;base64,AAAA",
        known: [{ id: "real", name: "Kaffee" }],
      }),
    );
    const result = await r.json();
    expect(result.suggestions[0].existing_id).toBeUndefined();
    expect(calls.filter((url) => url.includes("openrouter"))).toHaveLength(1);
  });
  it("revalidates every shop redirect before fetching it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("/auth/"))
          return Response.json({ id: "u", email_confirmed_at: "now" });
        if (url.includes("/rpc/")) return Response.json(null);
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        });
      }),
    );
    const r = await handler(
      request({ mode: "shop", url: "https://kaffek.de/test.html" }),
    );
    expect(r.status).toBe(400);
    expect(calls.some((url) => url.includes("127.0.0.1"))).toBe(false);
  });
});
