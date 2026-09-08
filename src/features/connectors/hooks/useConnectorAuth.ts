import { useEffect, useRef, useState } from "react";
import { ApiError, cancelConnectorAuth, getConnectorAuthStatus, logoutConnectorAuth, startConnectorAuth } from "@/shared/data";
import type { ConnectorAuthSession, ConnectorSummary } from "@/shared/data";
import { connectorAuthDeadline, connectorAuthViewStatus, isConnectorAuthActive, readConnectorAuthAction, readConnectorAuthSession, supportsConnectorLogin } from "../lib/connectorAuth";
import type { ConnectorAuthViewStatus } from "../lib/connectorAuth";

type AuthAction = "check" | "start" | "cancel" | "logout";
interface AuthState {
  identity: string;
  session: ConnectorAuthSession | null;
  status: ConnectorAuthViewStatus;
  checking: boolean;
  operation: Exclude<AuthAction, "check"> | null;
  error: Error | null;
}
interface Options {
  id: string;
  mode: ConnectorSummary["auth_mode"];
  readOnly?: boolean;
  onStatusChange?: (id: string, status: ConnectorAuthViewStatus) => void;
  onCredentialsChange?: () => void;
}

export function useConnectorAuth({ id, mode, readOnly = false, onStatusChange, onCredentialsChange }: Options) {
  const enabled = supportsConnectorLogin(mode);
  const identity = `${id}/${mode}/${readOnly}`;
  const initial = (): AuthState => ({ identity, session: null, status: mode === "none" ? "not_required" : "unknown", checking: enabled, operation: null, error: null });
  const [state, setState] = useState<AuthState>(initial);
  const callbacks = useRef({ onStatusChange, onCredentialsChange });
  callbacks.current = { onStatusChange, onCredentialsChange };
  const scope = useRef<{ identity: string; perform: (action: AuthAction) => Promise<void> } | null>(null);

  useEffect(() => {
    let disposed = false;
    let session: ConnectorAuthSession | null = null;
    let operation: AuthState["operation"] = null;
    let error: Error | null = null;
    let reportedStatus: ConnectorAuthViewStatus | undefined;
    let request: AbortController | null = null;
    let sequence = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      if (disposed) return;
      const status = mode === "none" ? "not_required" : connectorAuthViewStatus(session);
      setState({ identity, session, status, checking: !!request && !operation, operation, error });
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
      if (disposed || !enabled || operation || (action === "check" && request) || (action !== "check" && readOnly)) return;
      const expired = connectorAuthViewStatus(session) === "expired";
      if (action === "start" && (!session || session.status === "authorized" || session.status === "not_required" || (isConnectorAuthActive(session) && !expired))) return;
      if (action === "cancel" && !isConnectorAuthActive(session)) return;
      if (action === "logout" && session?.status !== "authorized") return;

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
      requestTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
      publish();
      const current = () => !disposed && generation === sequence;
      try {
        let next: ConnectorAuthSession;
        if (action === "cancel" || action === "logout") {
          const response = await (action === "cancel" ? cancelConnectorAuth : logoutConnectorAuth)(id, controller.signal);
          next = readConnectorAuthAction(response.data, id, action === "cancel" ? "canceled" : "unauthorized");
        } else {
          // Start is idempotent for active sessions. Explicitly cancel an expired session before retrying it.
          if (action === "start" && expired && isConnectorAuthActive(session)) {
            const canceled = await cancelConnectorAuth(id, controller.signal);
            if (!current() || controller.signal.aborted) return;
            session = readConnectorAuthAction(canceled.data, id, "canceled");
          }
          const response = await (action === "check" ? getConnectorAuthStatus : startConnectorAuth)(id, controller.signal);
          next = readConnectorAuthSession(response.data, id);
        }
        if (!current() || controller.signal.aborted) return;
        const previousStatus = session?.status;
        session = next;
        publish();
        if ((next.status === "authorized" && previousStatus !== "authorized") || (previousStatus === "authorized" && next.status !== "authorized") || action === "logout" || action === "cancel") {
          callbacks.current.onCredentialsChange?.();
        }
      } catch (cause) {
        if (!current()) return;
        error = timedOut ? new Error("connectors.auth.error.timeout") : cause instanceof Error ? cause : new Error(String(cause));
      } finally {
        if (current()) {
          clearTimeout(requestTimer);
          request = null;
          operation = null;
          publish();
          const permanentError = error instanceof ApiError && [401, 403, 404, 405].includes(error.status || 0);
          if (isConnectorAuthActive(session) && connectorAuthViewStatus(session) !== "expired" && !permanentError) {
            pollTimer = setTimeout(() => void perform("check"), error ? 5_000 : 2_000);
          }
        }
      }
    };

    scope.current = { identity, perform };
    publish();
    if (enabled) void perform("check");
    return () => {
      disposed = true;
      sequence += 1;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      clearTimeout(requestTimer);
      request?.abort();
      scope.current = null;
      // Leaving this view only stops observation; it never cancels login or removes credentials.
    };
  }, [id, mode, identity, enabled, readOnly]);

  const perform = (action: AuthAction) => scope.current?.identity === identity ? scope.current.perform(action) : Promise.resolve();
  return {
    ...(state.identity === identity ? state : initial()),
    start: () => perform("start"),
    cancel: () => perform("cancel"),
    logout: () => perform("logout"),
    refresh: () => perform("check"),
  };
}
