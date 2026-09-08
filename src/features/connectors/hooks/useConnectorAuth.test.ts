/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, cancelConnectorAuth, getConnectorAuthStatus, logoutConnectorAuth, startConnectorAuth } from "@/shared/data";
import type { ApiResponse, ConnectorAuthSession, ConnectorSummary } from "@/shared/data";
import { useConnectorAuth } from "./useConnectorAuth";

jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), cancelConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
}));
const onStatusChange = jest.fn();
const onCredentialsChange = jest.fn();
let current: ReturnType<typeof useConnectorAuth>;
let root: Root;
let mounted: boolean;
function Harness({ id = "demo", mode = "cli", readOnly = false }: { id?: string; mode?: ConnectorSummary["auth_mode"]; readOnly?: boolean }) {
  current = useConnectorAuth({ id, mode, readOnly, onStatusChange, onCredentialsChange });
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
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("unauthorized"));
  jest.mocked(startConnectorAuth).mockResolvedValue(response("preparing"));
  jest.mocked(cancelConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: "demo", status: "canceled" } });
  jest.mocked(logoutConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: "demo", status: "unauthorized" } });
  root = createRoot(document.createElement("div"));
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  jest.useRealTimers();
});

it("starts once, polls preparing → pending → authorized, then refreshes associated data and stops polling", async () => {
  await mount();
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
  await mount({ id: "other", mode: "oauth" });
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

it.each(["none", "token"] as const)("does not request interactive authentication for %s", async mode => {
  await mount({ mode });
  await act(async () => { void current.start(); void current.refresh(); });
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
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
