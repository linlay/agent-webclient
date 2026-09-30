import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAgents, getAgentConnectors, getConnectorConnection, prepareConnector, setAgentConnector, type ConnectorSummary } from "@/shared/data";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { firstChatAgent } from "@/features/resource-assistant/lib/resourceAssistant";
import { connectorChatUrl, ConnectorChatError, prepareConnectorChat, waitForConnectorPoll } from "../lib/connectorChat";
import type { ConnectorNavigationApproval } from "../lib/connectorNavigation";

function observeRequest<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(new DOMException("Aborted", "AbortError")); };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function useConnectorChat({ item, draft, dirty, confirmLeave, confirmNavigation, onConfigurationRequired }: {
  item: ConnectorSummary | null;
  draft: string;
  dirty: boolean;
  confirmLeave: () => boolean;
  confirmNavigation?: () => ConnectorNavigationApproval | null;
  onConfigurationRequired: () => void;
}) {
  const navigate = useNavigate();
  const latest = useRef({ item, draft, dirty, confirmLeave, confirmNavigation, onConfigurationRequired });
  latest.current = { item, draft, dirty, confirmLeave, confirmNavigation, onConfigurationRequired };
  const operation = useRef<{ id: string; controller: AbortController } | null>(null);
  const [phase, setPhase] = useState<"preparing" | "mounting" | "" >("");
  const [error, setError] = useState("");
  useEffect(() => {
    setPhase(""); setError("");
    return () => { operation.current?.controller.abort(); operation.current = null; };
  }, [item?.id]);
  const open = useCallback(async (composerDraft = "") => {
    const initial = latest.current;
    if (!initial.item || operation.current) return;
    const approval = initial.confirmNavigation?.();
    if (initial.confirmNavigation ? !approval : initial.dirty && !initial.confirmLeave()) return;
    let revokeApproval: (() => void) | undefined;
    const current = { id: initial.item.id, controller: new AbortController() };
    operation.current = current;
    setPhase("preparing"); setError("");
    const source = window.location.href;
    const { signal } = current.controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; current.controller.abort(); }, 150_000);
    const assertCurrent = () => {
      if (signal.aborted || operation.current !== current || latest.current.item?.id !== current.id || window.location.href !== source) throw new DOMException("Aborted", "AbortError");
    };
    try {
      const desktop = isDesktopAppMode();
      const agentKey = desktop ? new URL(source).searchParams.get("chatDefaultAgentKey")?.trim() || ""
        : firstChatAgent((await observeRequest(getAgents({ scope: "nav", includeTeam: false }), signal)).data);
      assertCurrent();
      if (!agentKey) { setError("resourceAssistant.agentUnavailable"); return; }
      await prepareConnectorChat(initial.item, agentKey, {
        readConnection: async () => (await observeRequest(getConnectorConnection(current.id, signal), signal)).data,
        prepare: async () => (await observeRequest(prepareConnector(current.id, signal), signal)).data,
        readAgent: async () => (await observeRequest(getAgentConnectors(agentKey, signal), signal)).data,
        mount: async () => (await observeRequest(setAgentConnector({ agentKey, connectorId: current.id, enabled: true }, signal), signal)).data,
        wait: () => waitForConnectorPoll(signal), assertCurrent, now: Date.now, onPhase: setPhase,
      });
      assertCurrent();
      if (latest.current.draft !== initial.draft) { setError("connectors.chat.draftChanged"); return; }
      const target = connectorChatUrl(agentKey, composerDraft);
      if (approval) {
        const revoke = approval.permit(target);
        if (!revoke) { setError("connectors.chat.draftChanged"); return; }
        revokeApproval = revoke;
      }
      // Desktop management navigation must reach the host before the guest
      // consumes the draft. Standalone retains the other Chats' in-memory state.
      if (desktop) window.location.assign(target);
      else await navigate(target);
    } catch (cause) {
      if (operation.current !== current) return;
      if (signal.aborted) { setError(timedOut ? "connectors.chat.openTimeout" : "connectors.chat.waitInterrupted"); return; }
      setError(cause instanceof ConnectorChatError ? cause.message : "connectors.chat.openFailed");
      if (cause instanceof ConnectorChatError && ["configurationRequired", "authorizationRequired"].includes(cause.reason)) latest.current.onConfigurationRequired();
    } finally {
      window.clearTimeout(timeout);
      revokeApproval?.();
      if (operation.current === current) { operation.current = null; setPhase(""); }
    }
  }, [navigate]);
  const cancel = useCallback(() => {
    const current = operation.current;
    if (!current) return;
    current.controller.abort(); operation.current = null; setPhase(""); setError("");
    // Preparation is shared by connector ID. There is no owned job identity,
    // so cancel stops only this observer and cannot cancel another page's job.
  }, []);
  return { open, cancel, opening: !!phase, phase, error };
}
