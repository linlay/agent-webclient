/** @jest-environment jsdom */
import { parseEmbedOptions, startEmbedBridge } from "./embedBridge";
import { getEmbedToken, ensureEmbedToken } from "@/shared/data/embed/embedSession";

it("validates configuration without enabling undeclared capabilities", () => {
  expect(parseEmbedOptions({}).features).toEqual({ history: false, attachments: false, newChat: false });
  expect(() => parseEmbedOptions({ features: { history: "true" } })).toThrow("invalid_features");
  expect(() => parseEmbedOptions({ locale: "unknown" })).toThrow("invalid_locale");
});
it("fails closed when embedding is disabled or no exact trusted origin is configured", () => {
  globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};
  const onError = jest.fn(); const onInit = jest.fn();
  const stop = startEmbedBridge({ onError, onInit });
  expect(onError).toHaveBeenCalledWith("embed_not_allowed");
  expect(onInit).not.toHaveBeenCalled(); stop();
});
it("binds the transferred port to parent, origin, instance and nonce, and tears it down", async () => {
  jest.useFakeTimers();
  window.history.replaceState(null, "", "/embed/support?embedId=instance-1&parentOrigin=https%3A%2F%2Fhost.example");
  globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { EMBED_ENABLED: true, EMBED_ALLOWED_ORIGINS: "https://host.example" };
  const parent = { postMessage: jest.fn() };
  const previousParent = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", { configurable: true, value: parent });
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => "session-1" });
  const onInit = jest.fn(); const onError = jest.fn();
  const stop = startEmbedBridge({ onInit, onError });
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "hello", sessionId: "session-1" }), "https://host.example");
  const port = { postMessage: jest.fn(), start: jest.fn(), close: jest.fn(), onmessage: null as ((event: { data: unknown }) => Promise<void>) | null };
  const connect = { version: 1, instanceId: "instance-1", sessionId: "session-1", type: "connect" };
  const dispatch = (origin: string, source: unknown = parent, data: unknown = connect) => window.dispatchEvent(new MessageEvent("message", { origin, source: source as Window, ports: [port as unknown as MessagePort], data }));
  dispatch("https://evil.example"); dispatch("https://host.example", window); dispatch("https://host.example", parent, { ...connect, sessionId: "old" });
  expect(port.start).not.toHaveBeenCalled();
  dispatch("https://host.example"); dispatch("https://host.example");
  expect(port.start).toHaveBeenCalledTimes(1);
  await port.onmessage!({ data: { ...connect, type: "auth.failed" } });
  expect(onError).toHaveBeenCalledWith("auth_required");
  await port.onmessage!({ data: { ...connect, type: "init", requestId: "init-1", payload: { credential: { token: "scoped", expiresAt: Date.now() + 120_000 } } } });
  expect(onInit).toHaveBeenCalledTimes(1);
  expect(getEmbedToken()).toBe("scoped");
  expect(JSON.stringify(parent.postMessage.mock.calls)).not.toContain("scoped");
  await port.onmessage!({ data: { ...connect, type: "init", requestId: "init-1", payload: {} } });
  expect(onInit).toHaveBeenCalledTimes(1);
  const renewed = ensureEmbedToken(true);
  const refresh = port.postMessage.mock.calls.find(call => call[0].type === "auth.refresh")![0];
  await port.onmessage!({ data: { ...connect, type: "auth.token", requestId: "wrong-request", payload: { token: "wrong", expiresAt: Date.now() + 120_000 } } });
  expect(getEmbedToken()).toBe("scoped");
  await port.onmessage!({ data: { ...connect, type: "auth.token", requestId: refresh.requestId, payload: { token: "renewed", expiresAt: Date.now() + 120_000 } } });
  await expect(renewed).resolves.toBe("renewed");
  stop();
  expect(port.close).toHaveBeenCalledTimes(1);
  expect(getEmbedToken()).toBe("");
  if (previousParent) Object.defineProperty(window, "parent", previousParent);
  jest.useRealTimers();
});
