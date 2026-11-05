/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, cancelConnectorAuth, getConnectorAuthStatus, getConnectorConnection, prepareConnector, logoutConnectorAuth, startConnectorAuth } from "@/shared/data";
import type { ApiResponse, ConnectorAuthSession, ConnectorSummary, ConnectorAuthMode } from "@/shared/data";
import { isAppMode } from "@/shared/utils/routing";
import { useConnectorAuth } from "./useConnectorAuth";
import { confirmCredentialState, credentialStateCheckRequired, requireCredentialStateCheck } from "../lib/connectorCredentials";

jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn(() => false) }));
jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), cancelConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
  getConnectorConnection: jest.fn(), prepareConnector: jest.fn(),
}));
const onStatusChange = jest.fn();
const onCredentialsChange = jest.fn();
let current: ReturnType<typeof useConnectorAuth>;
let root: Root;
let mounted: boolean;
function Harness({ id = "demo", mode = "self", readOnly = false, observe = false }: { id?: string; mode?: ConnectorAuthMode; readOnly?: boolean; observe?: boolean }) {
  current = useConnectorAuth({ id, mode, readOnly, observe, onStatusChange, onCredentialsChange });
  return null;
}
const response = (status: ConnectorAuthSession["status"], values: Partial<ConnectorAuthSession> = {}): ApiResponse<ConnectorAuthSession> => ({
  code: 0, msg: "", data: { connectorId: "demo", sessionId: "session-1", status, expiresAt: new Date(Date.now() + 900_000).toISOString(), ...values },
});
const mount = async (props: Parameters<typeof Harness>[0] = {}) => { await act(async () => root.render(React.createElement(Harness, props))); };
const advance = async (time = 2_000) => { await act(async () => jest.advanceTimersByTime(time)); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((success, fail) => { resolve = success; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.spyOn(window, "open").mockReturnValue(null);
  confirmCredentialState("demo");
  confirmCredentialState("other");
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("unauthorized"));
  jest.mocked(startConnectorAuth).mockResolvedValue(response("preparing"));
  jest.mocked(cancelConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: "demo", status: "canceled" } });
  jest.mocked(logoutConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: "demo", status: "unauthorized" } });
  root = createRoot(document.createElement("div"));
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  confirmCredentialState("demo");
  confirmCredentialState("other");
  jest.useRealTimers();
});

it.each(["self"] as const)("starts once with authMode=%s, polls preparing → pending → authorized, then refreshes associated data and stops polling", async mode => {
  await mount({ mode });
  const start = deferred<ApiResponse<ConnectorAuthSession>>();
  jest.mocked(startConnectorAuth).mockReturnValueOnce(start.promise);
  await act(async () => { void current.start(); void current.start(); });
  expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  await act(async () => start.resolve(response("preparing")));
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { authorizationUrl: "https://login.example/authorize" }));
  await advance();
  expect(current.status).toBe("pending");
  expect(current.session?.authorizationUrl).toContain("https://login.example");
  await act(async () => current.start());
  expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized", { sessionId: "", expiresAt: "0001-01-01T00:00:00Z" }));
  await advance();
  expect(current.status).toBe("authorized");
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
  expect(onStatusChange).toHaveBeenLastCalledWith("demo", "authorized");
  expect(jest.getTimerCount()).toBe(0);
});

it("restores a server session on entry and aborts polling on unmount without canceling or logging out", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending"));
  await mount();
  const pending = deferred<ApiResponse<ConnectorAuthSession>>();
  jest.mocked(getConnectorAuthStatus).mockReturnValueOnce(pending.promise);
  await advance();
  const signal = jest.mocked(getConnectorAuthStatus).mock.calls[1][1];
  await act(async () => root.unmount());
  mounted = false;
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(response("authorized")));
  await advance(60_000);
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(cancelConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  expect(onCredentialsChange).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it("ignores an old connector result and restores the new connector's server session", async () => {
  const old = deferred<ApiResponse<ConnectorAuthSession>>();
  jest.mocked(getConnectorAuthStatus).mockReturnValueOnce(old.promise);
  await mount();
  const signal = jest.mocked(getConnectorAuthStatus).mock.calls[0][1];
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { connectorId: "other" }));
  await mount({ id: "other", mode: "mcp" });
  expect(signal?.aborted).toBe(true);
  await act(async () => old.resolve(response("authorized")));
  expect(current.session?.connectorId).toBe("other");
  expect(current.status).toBe("pending");
  expect(onCredentialsChange).not.toHaveBeenCalled();
});

it("allows retry after a failed login", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("failed", { message: "CLI login failed" }));
  await mount();
  expect(current.session?.message).toBe("CLI login failed");
  await act(async () => current.start());
  expect(current.status).toBe("preparing");
  expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  expect(cancelConnectorAuth).not.toHaveBeenCalled();
});

it("cancels once even during a poll and never lets its late pending result restore the link", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { authorizationUrl: "https://login.example" }));
  await mount();
  const poll = deferred<ApiResponse<ConnectorAuthSession>>();
  const cancel = deferred<Awaited<ReturnType<typeof cancelConnectorAuth>>>();
  jest.mocked(getConnectorAuthStatus).mockReturnValueOnce(poll.promise);
  jest.mocked(cancelConnectorAuth).mockReturnValueOnce(cancel.promise);
  await advance();
  const signal = jest.mocked(getConnectorAuthStatus).mock.calls[1][1];
  await act(async () => { void current.cancel(); void current.cancel(); });
  expect(signal?.aborted).toBe(true);
  expect(cancelConnectorAuth).toHaveBeenCalledTimes(1);
  await act(async () => cancel.resolve({ code: 0, msg: "", data: { id: "demo", status: "canceled" } }));
  await act(async () => poll.resolve(response("pending", { authorizationUrl: "https://stale.example" })));
  expect(current.status).toBe("canceled");
  expect(current.session?.authorizationUrl).toBeUndefined();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it("signs out once using DELETE, clears the session and refreshes associated data", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await mount();
  onCredentialsChange.mockClear();
  await act(async () => { void current.logout(); void current.logout(); });
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(current.status).toBe("unauthorized");
  expect(current.session?.sessionId).toBe("");
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
});

it("retains recoverable state when a mutation fails instead of inventing success", async () => {
  await mount();
  jest.mocked(startConnectorAuth).mockRejectedValueOnce(new Error("network offline"));
  await act(async () => current.start());
  expect(current.status).toBe("unauthorized");
  expect(current.error?.message).toBe("network offline");
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await act(async () => current.refresh());
  jest.mocked(logoutConnectorAuth).mockRejectedValueOnce(new Error("logout failed"));
  await act(async () => current.logout());
  expect(current.status).toBe("authorized");
  expect(current.error?.message).toBe("logout failed");
});

it("backs off after a polling error and can resume via an explicit status check", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending"));
  await mount();
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new Error("network offline"));
  await advance();
  expect(current.error?.message).toBe("network offline");
  await advance(4_999);
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await act(async () => current.refresh());
  expect(current.error).toBeNull();
  expect(current.status).toBe("authorized");
  expect(jest.getTimerCount()).toBe(0);
});

it.each([401, 403, 404, 405])("stops polling on HTTP %s until the user checks again", async status => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending"));
  await mount();
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new ApiError("unavailable", { status }));
  await advance();
  await advance(30_000);
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(current.error).toMatchObject({ status });
});

it("displays an expired deadline and cancels an expired active session before retrying", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("pending", { expiresAt: new Date(Date.now() + 1_000).toISOString() }));
  await mount();
  await advance(1_000);
  expect(current.status).toBe("expired");
  await act(async () => { void current.start(); void current.start(); });
  expect(cancelConnectorAuth).toHaveBeenCalledTimes(1);
  expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  expect(jest.mocked(cancelConnectorAuth).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(startConnectorAuth).mock.invocationCallOrder[0]);
  expect(current.status).toBe("preparing");
});

it("does not start a new login if leaving during the expired-session cancellation", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { expiresAt: new Date(Date.now() - 1_000).toISOString() }));
  await mount();
  const cancel = deferred<Awaited<ReturnType<typeof cancelConnectorAuth>>>();
  jest.mocked(cancelConnectorAuth).mockReturnValueOnce(cancel.promise);
  await act(async () => { void current.start(); });
  await act(async () => root.unmount());
  mounted = false;
  await act(async () => cancel.resolve({ code: 0, msg: "", data: { id: "demo", status: "canceled" } }));
  expect(startConnectorAuth).not.toHaveBeenCalled();
});

it.each(["none"] as const)("does not request interactive authentication for %s", async mode => {
  await mount({ mode });
  await act(async () => { void current.start(); void current.refresh(); });
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it("reads token status without starting interactive login or periodic probing", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("configured"));
  await mount({ mode: "token" });
  await act(async () => { void current.start(); void current.refresh(); });
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(current.status).toBe("configured");
  expect(jest.getTimerCount()).toBe(0);
});

it.each([
  ["configured", false],
  ["authorized", false],
  ["pending_verification", true],
  ["failed", false],
  ["unauthorized", false],
  ["configured", true],
  ["authorized", true],
  ["unauthorized", true],
] as const)("clears token credentials in %s with pendingVerification=%s before reporting success", async (status, pendingVerification) => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response(status, { pendingVerification }));
  requireCredentialStateCheck("demo", "pending");
  await mount({ mode: "token" });
  onCredentialsChange.mockClear();
  let cleared: boolean | undefined;
  await act(async () => { cleared = await current.logout(); });
  expect(cleared).toBe(true);
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(logoutConnectorAuth).toHaveBeenCalledWith("demo", expect.any(AbortSignal));
  expect(current.status).toBe("unauthorized");
  expect(current.session).toMatchObject({ connectorId: "demo", status: "unauthorized", sessionId: "", expiresAt: "" });
  expect(current.session?.pendingVerification).toBeUndefined();
  expect(credentialStateCheckRequired("demo")).toBeUndefined();
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(cancelConnectorAuth).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it("clears token credentials once and rejects a late poll that still reports the old account", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("configured"));
  await mount({ mode: "token", observe: true });
  requireCredentialStateCheck("demo", "unknown");
  const poll = deferred<ApiResponse<ConnectorAuthSession>>();
  const clear = deferred<Awaited<ReturnType<typeof logoutConnectorAuth>>>();
  jest.mocked(getConnectorAuthStatus).mockReturnValueOnce(poll.promise);
  jest.mocked(logoutConnectorAuth).mockReturnValueOnce(clear.promise);
  await advance(30_000);
  const pollSignal = jest.mocked(getConnectorAuthStatus).mock.calls[1][1];
  let clearing!: Promise<boolean>;
  let duplicate!: Promise<boolean>;
  await act(async () => { clearing = current.logout(); duplicate = current.logout(); });
  expect(await duplicate).toBe(false);
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(pollSignal?.aborted).toBe(true);
  expect(current.operation).toBe("logout");
  expect(credentialStateCheckRequired("demo")).toBe("unknown");
  await act(async () => clear.resolve({ code: 0, msg: "", data: { id: "demo", status: "unauthorized" } }));
  expect(await clearing).toBe(true);
  await act(async () => poll.resolve(response("authorized", { pendingVerification: true })));
  expect(current.status).toBe("unauthorized");
  expect(current.session?.pendingVerification).toBeUndefined();
  expect(current.operation).toBeNull();
  expect(credentialStateCheckRequired("demo")).toBeUndefined();
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
});

it.each(["unknown", "pending"] as const)("keeps the %s credential recheck marker when clearing fails and hides private diagnostics", async reason => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("configured", { pendingVerification: true }));
  await mount({ mode: "token" });
  requireCredentialStateCheck("demo", reason);
  jest.mocked(logoutConnectorAuth).mockRejectedValueOnce(new ApiError("synthetic-private-credential must not be displayed", { status: 500 }));
  let cleared: boolean | undefined;
  await act(async () => { cleared = await current.logout(); });
  expect(cleared).toBe(false);
  expect(current.error?.message).toBe("connectors.credentials.clearFailed");
  expect(current.error).not.toBeInstanceOf(ApiError);
  expect(current.status).toBe("configured");
  expect(current.session?.pendingVerification).toBe(true);
  expect(credentialStateCheckRequired("demo")).toBe(reason);
  expect(onCredentialsChange).not.toHaveBeenCalled();
  expect(current.operation).toBeNull();
});

it("does not treat a mismatched clear response as permission to rebind token credentials", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("pending_verification", { pendingVerification: true }));
  await mount({ mode: "token" });
  requireCredentialStateCheck("demo", "pending");
  jest.mocked(logoutConnectorAuth).mockResolvedValueOnce({ code: 0, msg: "", data: { id: "other", status: "unauthorized" } });
  let cleared: boolean | undefined;
  await act(async () => { cleared = await current.logout(); });
  expect(cleared).toBe(false);
  expect(current.error?.message).toBe("connectors.credentials.clearFailed");
  expect(current.status).toBe("pending_verification");
  expect(credentialStateCheckRequired("demo")).toBe("pending");
  expect(onCredentialsChange).not.toHaveBeenCalled();
});

it("returns false for token cleanup completed after leaving and preserves the unresolved recheck marker", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("configured"));
  await mount({ mode: "token" });
  requireCredentialStateCheck("demo", "unknown");
  const clear = deferred<Awaited<ReturnType<typeof logoutConnectorAuth>>>();
  jest.mocked(logoutConnectorAuth).mockReturnValueOnce(clear.promise);
  let clearing!: Promise<boolean>;
  await act(async () => { clearing = current.logout(); });
  const signal = jest.mocked(logoutConnectorAuth).mock.calls[0][1];
  await act(async () => root.unmount());
  mounted = false;
  expect(signal?.aborted).toBe(true);
  await act(async () => clear.resolve({ code: 0, msg: "", data: { id: "demo", status: "unauthorized" } }));
  expect(await clearing).toBe(false);
  expect(credentialStateCheckRequired("demo")).toBe("unknown");
  expect(onCredentialsChange).not.toHaveBeenCalled();
  expect(await current.logout()).toBe(false);
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it("does not apply token cleanup or an old action to a newly selected connector", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("configured"));
  await mount({ mode: "token" });
  const oldLogout = current.logout;
  requireCredentialStateCheck("demo", "pending");
  const clear = deferred<Awaited<ReturnType<typeof logoutConnectorAuth>>>();
  jest.mocked(logoutConnectorAuth).mockReturnValueOnce(clear.promise);
  let clearing!: Promise<boolean>;
  await act(async () => { clearing = current.logout(); });
  const signal = jest.mocked(logoutConnectorAuth).mock.calls[0][1];
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("configured", { connectorId: "other" }));
  await mount({ id: "other", mode: "token" });
  expect(signal?.aborted).toBe(true);
  await act(async () => clear.resolve({ code: 0, msg: "", data: { id: "demo", status: "unauthorized" } }));
  expect(await clearing).toBe(false);
  expect(await oldLogout()).toBe(false);
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(current.session?.connectorId).toBe("other");
  expect(current.status).toBe("configured");
  expect(credentialStateCheckRequired("demo")).toBe("pending");
  expect(onCredentialsChange).not.toHaveBeenCalled();
});

it.each(["configured", "authorized", "pending_verification"] as const)("cannot clear read-only token credentials in %s", async status => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response(status));
  await mount({ mode: "token", readOnly: true });
  onCredentialsChange.mockClear();
  requireCredentialStateCheck("demo", "pending");
  let cleared: boolean | undefined;
  await act(async () => { cleared = await current.logout(); });
  expect(cleared).toBe(false);
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  expect(credentialStateCheckRequired("demo")).toBe("pending");
  expect(onCredentialsChange).not.toHaveBeenCalled();
});

it.each(["self", "mcp"] as const)("still refuses logout for an unauthorized %s connector", async mode => {
  await mount({ mode });
  let cleared: boolean | undefined;
  await act(async () => { cleared = await current.logout(); });
  expect(cleared).toBe(false);
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});

const preparationConnection = (status: "pending" | "preparing" | "ready" | "failed") => ({ code: 0, msg: "", data: {
  connectorId: "demo", configured: false, configurationRequired: true, readiness: status === "ready" ? "configuration_required" : "preparing",
  authentication: response("setup_required").data, capabilities: { canConnect: true, canDisconnect: true, canCheck: true, authMode: "self", authBrowser: "system", hasCli: true, hasMcp: false }, preparation: { connectorId: "demo", status },
} });

it("explicitly prepares setup_required CLI before starting login", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("setup_required"));
  jest.mocked(getConnectorConnection).mockResolvedValueOnce(preparationConnection("pending") as any).mockResolvedValue(preparationConnection("ready") as any);
  jest.mocked(prepareConnector).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", status: "ready" } });
  await mount({ mode: "self" }); await act(async () => current.start());
  expect(prepareConnector).toHaveBeenCalledTimes(1); expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  expect(jest.mocked(prepareConnector).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(startConnectorAuth).mock.invocationCallOrder[0]);
});

it("keeps failed preparation separate from a login attempt", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("setup_required"));
  jest.mocked(getConnectorConnection).mockResolvedValue(preparationConnection("pending") as any);
  jest.mocked(prepareConnector).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", status: "failed" } });
  await mount({ mode: "self" }); await act(async () => current.start());
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(current.error?.message).toBe("connectors.chat.preparationFailed"); expect(current.preparingDependency).toBe(false);
});

it("stops its preparation observer and ignores late completion without canceling a shared job", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("setup_required"));
  jest.mocked(getConnectorConnection).mockResolvedValueOnce(preparationConnection("pending") as any).mockResolvedValue(preparationConnection("preparing") as any);
  jest.mocked(prepareConnector).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", status: "preparing" } });
  await mount({ mode: "self" }); let result!: Promise<void>;
  await act(async () => { result = current.start(); });
  expect(current.preparingDependency).toBe(true); expect(startConnectorAuth).not.toHaveBeenCalled();
  await act(async () => { await current.cancel(); await result; });
  expect(cancelConnectorAuth).not.toHaveBeenCalled(); expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(current.preparingDependency).toBe(false); expect(current.operation).toBeNull();
});

it("finishes delegated authentication checks without starting or canceling connector-managed login", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("delegated"));
  await mount({ mode: "self" });
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(1);
  expect(current.status).toBe("delegated");
  expect(current.checking).toBe(false);
  expect(current.error).toBeNull();
  await act(async () => { void current.start(); void current.cancel(); void current.logout(); });
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(cancelConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});

it.each(["unauthorized", "authorized"] as const)("observes Desktop identity %s without managing its credentials", async status => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response(status));
  await mount({ mode: "oneid", observe: true });
  expect(current.status).toBe(status);
  expect(current.checking).toBe(false);
  await act(async () => { void current.start(); void current.cancel(); void current.logout(); });
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(cancelConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response(status === "authorized" ? "unauthorized" : "authorized"));
  await act(async () => current.refresh());
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(current.status).not.toBe(status);
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
});

it("cannot change read-only connector credentials", async () => {
  await mount({ readOnly: true });
  await act(async () => current.start());
  expect(startConnectorAuth).not.toHaveBeenCalled();
});

it("times out stalled HTTP requests and releases the action lock", async () => {
  jest.mocked(getConnectorAuthStatus).mockImplementationOnce((_id, signal) => new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await mount();
  await advance(20_000);
  expect(current.error?.message).toBe("connectors.auth.error.timeout");
  expect(current.checking).toBe(false);
  await act(async () => current.refresh());
  expect(current.status).toBe("unauthorized");
});

it("rejects malformed sessions instead of treating them as authorization", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized", { connectorId: "other" }));
  await mount();
  expect(current.status).toBe("unknown");
  expect(current.error?.message).toBe("connectors.auth.error.response");
  expect(onCredentialsChange).not.toHaveBeenCalled();
});


it("retains a page snapshot for 30 seconds, pauses hidden checks and resumes when visible", async () => {
  const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  try {
    await mount({ observe: true });
    await advance(29_999);
    expect(getConnectorAuthStatus).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("hidden");
    await advance(60_000);
    expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(getConnectorAuthStatus).toHaveBeenCalledTimes(3);
    await act(async () => current.refresh());
    expect(getConnectorAuthStatus).toHaveBeenCalledTimes(4);
  } finally { visibility.mockRestore(); }
});

it("does not refresh the catalog for each initially authorized row and stops automatic checks on auth errors", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await mount({ observe: true });
  expect(onCredentialsChange).not.toHaveBeenCalled();
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new ApiError("forbidden", { status: 403 }));
  await act(async () => current.refresh());
  expect(current.status).toBe("authorized");
  await advance(90_000);
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
});

it("no_auth never checks, polls or performs authentication operations", async () => {
 await mount({mode:"none",observe:true});
 expect(current.status).toBe("no_auth");
 expect(current.checking).toBe(false);
 await act(async()=>{await current.refresh();await current.start();await current.cancel();await current.logout();await current.openBrowser();});
 await advance(90_000);
 for(const request of [getConnectorAuthStatus,startConnectorAuth,cancelConnectorAuth,logoutConnectorAuth]) expect(request).not.toHaveBeenCalled();
});

it("switching to no_auth aborts the previous check and ignores its result",async()=>{
 const pending=deferred<ApiResponse<ConnectorAuthSession>>();
 jest.mocked(getConnectorAuthStatus).mockReturnValueOnce(pending.promise);
 await mount({mode:"mcp",observe:true});
 const signal=jest.mocked(getConnectorAuthStatus).mock.calls[0][1];
 await mount({mode:"none",observe:true});
 expect(signal?.aborted).toBe(true);
 await act(async()=>pending.resolve(response("authorized")));
 await advance(90_000);
 expect(current.status).toBe("no_auth");
 expect(current.checking).toBe(false);
 expect(getConnectorAuthStatus).toHaveBeenCalledTimes(1);
});

it("opens the authorization page from the login click, including a URL received by polling, only once", async () => {
  const replace = jest.fn(); const close = jest.fn();
  const popup = {closed:false, opener:window, location:{replace}, close};
  jest.mocked(window.open).mockReturnValue(popup as unknown as Window);
  await mount({mode:"mcp"});
  const pending = deferred<ApiResponse<ConnectorAuthSession>>();
  jest.mocked(startConnectorAuth).mockReturnValueOnce(pending.promise);
  await act(async () => { void current.start(); });
  expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(popup.opener).toBeNull();
  await act(async () => pending.resolve(response("preparing", {authBrowser:"system"})));
  expect(close).not.toHaveBeenCalled();
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("pending", {authBrowser:"system", authorizationUrl:"https://login.example/authorize"}));
  await advance();
  expect(replace).toHaveBeenCalledWith("https://login.example/authorize");
  await advance();
  expect(replace).toHaveBeenCalledTimes(1); expect(window.open).toHaveBeenCalledTimes(1);
});

it("opens the final authorization URL directly in Desktop", async () => {
  jest.mocked(isAppMode).mockReturnValue(true);
  await mount({mode:"mcp"});
  jest.mocked(startConnectorAuth).mockResolvedValue(response("pending", {authBrowser:"system",authorizationUrl:"https://login.example/authorize"}));
  await act(async () => current.start());
  expect(window.open).toHaveBeenCalledTimes(1);
  expect(window.open).toHaveBeenCalledWith("https://login.example/authorize", "_blank", "noopener,noreferrer");
});

it("does not open restored sessions or embedded authorization in an external browser", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", {authorizationUrl:"https://login.example/authorize"}));
  await mount({mode:"mcp"});
  expect(window.open).not.toHaveBeenCalled();
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("unauthorized", {authBrowser:"embedded"}));
  await act(async () => current.refresh());
  jest.mocked(startConnectorAuth).mockResolvedValue(response("pending", {authBrowser:"embedded",authorizationUrl:"https://login.example/authorize"}));
  await act(async () => current.start());
  expect(window.open).not.toHaveBeenCalled();
  expect(current.browserSessionId).toBe("session-1");
});

it("closes a waiting tab after failure and ignores late completion after switching connectors", async () => {
  const close=jest.fn(), replace=jest.fn();
  jest.mocked(window.open).mockReturnValue({closed:false,close,location:{replace}} as unknown as Window);
  await mount({mode:"mcp"});
  jest.mocked(startConnectorAuth).mockRejectedValueOnce(new Error("discovery failed"));
  await act(async () => current.start());
  expect(close).toHaveBeenCalledTimes(1);
  const pending=deferred<ApiResponse<ConnectorAuthSession>>();
  jest.mocked(startConnectorAuth).mockReturnValueOnce(pending.promise);
  await act(async () => {void current.start();});
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("unauthorized",{connectorId:"other"}));
  await mount({id:"other",mode:"mcp"});
  await act(async () => pending.resolve(response("pending",{authorizationUrl:"https://stale.example/authorize"})));
  expect(close).toHaveBeenCalledTimes(2); expect(replace).not.toHaveBeenCalled();
});
