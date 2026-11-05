import { isAppMode } from "@/shared/utils/routing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, cancelConnectorAuth, getConnectorAuthStatus, getConnectorConnection, prepareConnector, logoutConnectorAuth, startConnectorAuth } from "@/shared/data";
import type { ConnectorAuthMode, ConnectorAuthSession, ConnectorSummary } from "@/shared/data";
import { connectorAuthDeadline, connectorAuthViewStatus, isConnectorAuthActive, readConnectorAuthAction, readConnectorAuthSession, supportsConnectorAuthCheck, supportsConnectorLogin, safeConnectorAuthorizationUrl } from "../lib/connectorAuth";
import type { ConnectorAuthViewStatus } from "../lib/connectorAuth";
import { ensureConnectorPrepared, waitForConnectorPoll } from "../lib/connectorChat";
import { confirmCredentialState } from "../lib/connectorCredentials";

type AuthAction = "check" | "start" | "cancel" | "logout" | "open";
interface AuthState {
  identity: string;
  browserSessionId: string | null;
  browserRequestRevision: number;
  session: ConnectorAuthSession | null;
  status: ConnectorAuthViewStatus;
  checking: boolean;
  operation: Exclude<AuthAction, "check" | "open"> | null;
  error: Error | null;
  preparingDependency: boolean;
}
interface Options {
  id: string;
  mode: ConnectorAuthMode;
  readOnly?: boolean;
  onStatusChange?: (id: string, status: ConnectorAuthViewStatus) => void;
  onCredentialsChange?: () => void;
  checkStatus?: typeof getConnectorAuthStatus;
  observe?: boolean;
  // The composer only follows active login sessions; the console also watches idle status.
  pollInactive?: boolean;
}

export function useConnectorAuth({ id, mode, readOnly = false, onStatusChange, onCredentialsChange, checkStatus = getConnectorAuthStatus, observe = false, pollInactive = true }: Options) {
  const enabled = supportsConnectorAuthCheck(mode);
  const identity = `${id}/${mode}/${readOnly}`;
  const initial = (): AuthState => ({ identity, browserRequestRevision: 0, browserSessionId: null, session: null, status: mode === "none" ? "no_auth" : "unknown", checking: enabled, operation: null, error: null, preparingDependency: false });
  const [state, setState] = useState<AuthState>(initial);
  const callbacks = useRef({ onStatusChange, onCredentialsChange });
  callbacks.current = { onStatusChange, onCredentialsChange };
  const scope = useRef<{ identity: string; perform: (action: AuthAction) => Promise<boolean> } | null>(null);

  useEffect(() => {
    let disposed = false;
    let browserSessionId: string | null = null;
    let browserRequestRevision = 0;
    let session: ConnectorAuthSession | null = null;
    let operation: AuthState["operation"] = null;
    let error: Error | null = null;
    let preparingDependency = false;
    let reportedStatus: ConnectorAuthViewStatus | undefined;
    let request: AbortController | null = null;
    let sequence = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCheckedAt = 0;
    let loginWindow: Window | null = null;
    let openSystemBrowser = false;
    const closeWaitingWindow = () => {
      try { loginWindow?.close(); } catch { /* The user may already have closed it. */ }
      loginWindow = null;
      openSystemBrowser = false;
    };
    const openAuthorization = () => {
      if (!openSystemBrowser) return;
      if (session?.authBrowser === "embedded") { closeWaitingWindow(); return; }
      if (session?.status !== "preparing" && session?.status !== "pending") {
        closeWaitingWindow(); return;
      }
      const url = safeConnectorAuthorizationUrl(session.authorizationUrl);
      if (connectorAuthViewStatus(session) === "expired" || session.authorizationUrl && !url) { closeWaitingWindow(); return; }
      if (session.status !== "pending" || !url) return;
      openSystemBrowser = false;
      try {
        if (loginWindow && !loginWindow.closed) loginWindow.location.replace(url);
        else window.open(url, "_blank", "noopener,noreferrer");
      } catch { /* The panel retains a link if opening was blocked. */ }
      loginWindow = null;
    };
    const permanentError = () => error instanceof ApiError && [401, 403, 404, 405].includes(error.status || 0);
    const schedulePoll = () => {
      clearTimeout(pollTimer);
      const active = isConnectorAuthActive(session) && connectorAuthViewStatus(session) !== "expired";
      if (!enabled || permanentError() || (!active && (!observe || !pollInactive))) return;
      pollTimer = setTimeout(() => {
        if (observe && document.visibilityState === "hidden") schedulePoll();
        else void perform("check");
      }, active ? (error ? 5_000 : 2_000) : 30_000);
    };

    const publish = () => {
      if (disposed) return;
      if (operation !== "start") openAuthorization();
      const status = mode === "none" ? "no_auth" : connectorAuthViewStatus(session);
      setState({ identity, browserRequestRevision, browserSessionId, session, status, checking: !!request && !operation, operation, error, preparingDependency });
      if (reportedStatus !== status) {
        reportedStatus = status;
        callbacks.current.onStatusChange?.(id, status);
      }
      clearTimeout(deadlineTimer);
      const deadline = connectorAuthDeadline(session);
      if (isConnectorAuthActive(session) && deadline !== null && deadline > Date.now()) {
        deadlineTimer = setTimeout(publish, Math.min(deadline - Date.now(), 2_147_483_647));
      }
    };

    const perform = async (action: AuthAction) => {
      const cancelPreparation = action === "cancel" && operation === "start" && preparingDependency;
      const clearingCredentials = action === "logout" && mode === "token";
      if (disposed || !enabled || operation && !cancelPreparation || (action === "check" && request) || (action !== "check" && readOnly)) return false;
      if (action !== "check" && !clearingCredentials && (!supportsConnectorLogin(mode) || session?.status === "delegated")) return false;
      const expired = connectorAuthViewStatus(session) === "expired";
      if (action === "start" && (!session || session.status === "authorized" || session.status === "not_required" || (isConnectorAuthActive(session) && !expired))) return false;
      if (action === "cancel" && !isConnectorAuthActive(session) && !cancelPreparation) return false;
      // A rejected or unverified token can still have stored credentials.
      if (action === "logout" && !clearingCredentials && session?.status !== "authorized") return false;

      if (action === "open") {
        if (session?.status === "pending" && !expired) { browserSessionId = session.sessionId; browserRequestRevision += 1; publish(); }
        return true;
      }
      if (action === "start" && mode === "mcp" && session?.authBrowser !== "embedded") {
        // Reserve a tab during the click, before awaiting authorization discovery.
        // Desktop routes the final URL to the OS browser and needs no blank tab.
        closeWaitingWindow();
        openSystemBrowser = true;
        if (!isAppMode()) {
          try { loginWindow = window.open("about:blank", "_blank"); if (loginWindow) loginWindow.opener = null; } catch { loginWindow = null; }
        }
      }
      if (action === "cancel" || action === "logout") closeWaitingWindow();
      // A user action supersedes an in-flight poll. Its late response cannot restore an old link.
      clearTimeout(pollTimer);
      clearTimeout(requestTimer);
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const generation = ++sequence;
      operation = action === "check" ? null : action;
      error = null;
      let timedOut = false;
      // Shared checks enforce their timeout after leaving the page's queue.
      if (action !== "check" || checkStatus === getConnectorAuthStatus) {
        requestTimer = setTimeout(() => { timedOut = true; controller.abort(); }, action === "start" && session?.status === "setup_required" ? 90_000 : 20_000);
      }
      publish();
      const current = () => !disposed && generation === sequence;
      try {
        let next: ConnectorAuthSession;
        if (cancelPreparation) {
          if (!current() || controller.signal.aborted) return false;
          preparingDependency = false;
          next = readConnectorAuthSession((await checkStatus(id, controller.signal)).data, id);
        } else if (action === "cancel" || action === "logout") {
          const response = await (action === "cancel" ? cancelConnectorAuth(id, controller.signal, session?.sessionId) : logoutConnectorAuth(id, controller.signal));
          next = readConnectorAuthAction(response.data, id, action === "cancel" ? "canceled" : "unauthorized");
        } else {
          if (action === "start" && session?.status === "setup_required") {
            preparingDependency = true; publish();
            const connection = (await getConnectorConnection(id, controller.signal)).data;
            let first = true;
            await ensureConnectorPrepared({ id, hasCli: connection.capabilities.hasCli, builtin: readOnly }, {
              readConnection: async () => { if (first) { first = false; return connection; } return (await getConnectorConnection(id, controller.signal)).data; },
              prepare: async () => (await prepareConnector(id, controller.signal)).data,
              wait: () => waitForConnectorPoll(controller.signal), now: Date.now, onPhase: () => undefined,
              assertCurrent: () => { if (!current() || controller.signal.aborted) throw new DOMException("Aborted", "AbortError"); },
            });
            if (!current() || controller.signal.aborted) return false;
            preparingDependency = false; publish();
          }
          // Start is idempotent for active sessions. Explicitly cancel an expired session before retrying it.
          if (action === "start" && expired && isConnectorAuthActive(session)) {
            const canceled = await cancelConnectorAuth(id, controller.signal, session?.sessionId);
            if (!current() || controller.signal.aborted) return false;
            session = readConnectorAuthAction(canceled.data, id, "canceled");
          }
          const response = await (action === "check" ? checkStatus : startConnectorAuth)(id, controller.signal);
          next = readConnectorAuthSession(response.data, id);
        }
        if (!current() || controller.signal.aborted) return false;
        const previousStatus = session?.status;
        session = next;
        if (clearingCredentials) confirmCredentialState(id);
        if (action === "start") { browserSessionId = next.sessionId; browserRequestRevision += 1; }
        if (action === "cancel" || action === "logout") browserSessionId = null;
        publish();
        if ((next.status === "authorized" && previousStatus !== "authorized" && (!observe || previousStatus !== undefined)) || (previousStatus === "authorized" && next.status !== "authorized") || action === "logout" || action === "cancel") {
          callbacks.current.onCredentialsChange?.();
        }
        return true;
      } catch (cause) {
        if (!current()) return false;
        if (action === "start") closeWaitingWindow();
        error = clearingCredentials ? new Error("connectors.credentials.clearFailed") : timedOut ? new Error("connectors.auth.error.timeout") : cause instanceof Error ? cause : new Error(String(cause));
        return false;
      } finally {
        if (current()) {
          clearTimeout(requestTimer);
          request = null;
          operation = null;
          preparingDependency = false;
          publish();
          lastCheckedAt = Date.now();
          schedulePoll();
        }
      }
    };

    scope.current = { identity, perform };
    publish();
    if (enabled) void perform("check");
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheckedAt >= 30_000 && !permanentError()) void perform("check");
    };
    if (observe && pollInactive) document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      closeWaitingWindow();
      sequence += 1;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      clearTimeout(requestTimer);
      request?.abort();
      if (observe && pollInactive) document.removeEventListener("visibilitychange", onVisible);
      scope.current = null;
      // Leaving this view only stops observation; it never cancels login or removes credentials.
    };
  }, [id, mode, identity, enabled, readOnly, checkStatus, observe, pollInactive]);

  const perform = useCallback((action: AuthAction) => scope.current?.identity === identity ? scope.current.perform(action) : Promise.resolve(false), [identity]);
  return useMemo(() => ({
    ...(state.identity === identity ? state : initial()),
    start: async () => { await perform("start"); },
    openBrowser: async () => { await perform("open"); },
    cancel: async () => { await perform("cancel"); },
    logout: () => perform("logout"),
    refresh: async () => { await perform("check"); },
  }), [state, identity, mode, enabled, perform]);
}

export type ConnectorAuthRuntime = ReturnType<typeof useConnectorAuth>;
