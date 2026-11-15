import { it, expect, vi, afterEach } from "vitest";
const mocked = vi.hoisted(() => ({
  session: { user: { id: "a" }, access_token: "token-a" },
  create: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocked.create }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mocked.create.mockReset();
});
it("pins synchronization to its initiating identity instead of following a later login", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
  mocked.session = { user: { id: "a" }, access_token: "token-a" };
  mocked.create.mockImplementation(() => ({
    auth: {
      getSession: async () => ({
        data: { session: mocked.session },
        error: null,
      }),
    },
  }));
  const backend = await import("./backend");
  await backend.sessionClient("a");
  const options = mocked.create.mock.calls[1][2];
  mocked.session = { user: { id: "b" }, access_token: "token-b" };
  expect(await options.accessToken()).toBe("token-a");
  expect(options.auth.persistSession).toBe(false);
  await expect(backend.sessionClient("a")).rejects.toThrow(
    "Anmeldung geändert",
  );
});
