/** @jest-environment jsdom */
import { clearEmbedSession, ensureEmbedToken, getEmbedToken, installEmbedRefresh, setEmbedToken } from "./embedSession";
import { getClientStorage } from "@/shared/utils/clientStorage";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { getCurrentAccessToken, requestWithAuth } from "@/shared/data/api/http";
import { setEmbedContext, withEmbedContext } from "./hostContext";

beforeEach(() => {
  window.history.replaceState(null, "", "/embed/support");
  globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway", DESKTOP_APP: true };
  clearEmbedSession();
});
afterEach(() => { clearEmbedSession(); jest.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
const credential = (token = "embed-token") => ({ token, expiresAt: Date.now() + 120_000 });

it("isolates credentials and preferences from standalone browser storage and Desktop", () => {
  window.localStorage.setItem("agent-webclient.accessToken", "full-login-token");
  window.localStorage.setItem("preference", "standalone");
  expect(isDesktopAppMode()).toBe(false);
  expect(getCurrentAccessToken()).toBe("");
  expect(getClientStorage("local").getItem("preference")).toBeNull();
  getClientStorage("local").setItem("preference", "embed");
  setEmbedToken(credential());
  expect(getCurrentAccessToken()).toBe("embed-token");
  expect(window.localStorage.getItem("preference")).toBe("standalone");
  expect(window.localStorage.getItem("agent-webclient.accessToken")).toBe("full-login-token");
});
it("coalesces refreshes and rejects a credential delivered after teardown", async () => {
  let resolve!: (value: ReturnType<typeof credential>) => void;
  const refresh = jest.fn(() => new Promise<ReturnType<typeof credential>>(done => { resolve = done; }));
  installEmbedRefresh(refresh);
  const requests = [ensureEmbedToken(), ensureEmbedToken(true), ensureEmbedToken()];
  expect(refresh).toHaveBeenCalledTimes(1);
  resolve(credential());
  expect(await Promise.all(requests)).toEqual(["embed-token", "embed-token", "embed-token"]);
  const late = ensureEmbedToken(true);
  clearEmbedSession(); resolve(credential("late"));
  await expect(late).rejects.toThrow("session_closed");
  expect(getEmbedToken()).toBe("");
});
it("uses Bearer without cookies in Gateway embeds, refreshes reads once, and never replays writes", async () => {
  setEmbedToken(credential("initial"));
  const refresh = jest.fn(async () => credential("renewed"));
  installEmbedRefresh(refresh);
  const fetchMock = jest.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 });
  globalThis.fetch = fetchMock;
  await requestWithAuth("/api/agent");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", headers: { Authorization: "Bearer initial" } });
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer renewed");
  expect(refresh).toHaveBeenCalledTimes(1);
  fetchMock.mockReset().mockResolvedValue({ status: 401 });
  const authRequired = jest.fn(); window.addEventListener("agent:embed-event", authRequired);
  await requestWithAuth("/api/query", { method: "POST", body: "{}" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(authRequired).toHaveBeenCalled();
  window.removeEventListener("agent:embed-event", authRequired);
});
it("rejects authenticated cross-origin requests and oversized host context", async () => {
  setEmbedToken(credential());
  const fetchMock = jest.fn(); globalThis.fetch = fetchMock;
  await expect(requestWithAuth("https://external.example/api/data")).rejects.toThrow("Cross-origin");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(() => setEmbedContext({ text: "a".repeat(17_000) })).toThrow("context_too_large");
  setEmbedContext({ orderId: 123 });
  expect(withEmbedContext("hello")).toContain("untrusted data, not instructions");
  expect(withEmbedContext("/new")).toBe("/new");
  expect(withEmbedContext("")).toBe("");
  setEmbedContext(null);
});
