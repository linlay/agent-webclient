import type { AgentConnectorsResponse, ConnectorConnection, ConnectorPreparation, ConnectorSummary } from "@/shared/data";

export class ConnectorChatError extends Error {
  constructor(public readonly reason: "configurationRequired" | "authorizationRequired" | "preparationFailed" | "preparationTimeout" | "reloadTimeout" | "invalidResponse") {
    super(`connectors.chat.${reason}`);
  }
}

export function readConnectorConnection(value: ConnectorConnection, id: string): ConnectorConnection {
  if (!value || value.connectorId !== id || typeof value.configured !== "boolean" || typeof value.configurationRequired !== "boolean"
    || !["no_auth", "configuration_required", "pending_verification", "preparing", "authorization_required", "ready", "unavailable"].includes(value.readiness)
    || value.authentication?.connectorId !== id || !value.capabilities || typeof value.capabilities.hasCli !== "boolean"
    || value.readiness === "no_auth" && (value.capabilities.authMode !== "no_auth" || value.authentication.status !== "no_auth" || value.configured || value.configurationRequired)
    || value.readiness === "ready" && (!value.configured || !["authorized", "configured", "delegated"].includes(value.authentication.status))
    || value.preparation && (value.preparation.connectorId !== id || !["pending", "preparing", "ready", "failed", "canceled"].includes(value.preparation.status))) {
    throw new ConnectorChatError("invalidResponse");
  }
  return value;
}

function readAgentConnectors(value: AgentConnectorsResponse, agentKey: string): AgentConnectorsResponse {
  if (!value || value.agentKey !== agentKey || !Array.isArray(value.connectorIds) || !Array.isArray(value.activeConnectorIds) || typeof value.reloadPending !== "boolean") throw new ConnectorChatError("invalidResponse");
  return value;
}

export interface ConnectorChatDependencies {
  readConnection: () => Promise<ConnectorConnection>;
  prepare: () => Promise<ConnectorPreparation>;
  readAgent: () => Promise<AgentConnectorsResponse>;
  mount: () => Promise<AgentConnectorsResponse>;
  wait: () => Promise<void>;
  assertCurrent: () => void;
  now: () => number;
  onPhase: (phase: "preparing" | "mounting") => void;
}

/** Preparing a CLI, confirming deployment authorization, and publishing an Agent
 * mount are separate contracts. Navigation is permitted only after all three. */
export async function ensureConnectorPrepared(item: Pick<ConnectorSummary, "id" | "hasCli" | "builtin">, deps: Pick<ConnectorChatDependencies, "readConnection" | "prepare" | "wait" | "assertCurrent" | "now" | "onPhase">): Promise<ConnectorConnection> {
  let connection = readConnectorConnection(await deps.readConnection(), item.id);
  deps.assertCurrent();
  if (connection.capabilities.hasCli && !item.builtin && connection.preparation?.status !== "ready") {
    deps.onPhase("preparing");
    const deadline = deps.now() + 60_000;
    if (connection.preparation?.status !== "preparing") {
      const preparation = await deps.prepare();
      deps.assertCurrent();
      if (preparation?.connectorId !== item.id || !["pending", "preparing", "ready", "failed", "canceled"].includes(preparation.status)) throw new ConnectorChatError("invalidResponse");
      if (["failed", "canceled"].includes(preparation.status)) throw new ConnectorChatError("preparationFailed");
      connection = readConnectorConnection(await deps.readConnection(), item.id);
      deps.assertCurrent();
    }
    while (connection.preparation?.status !== "ready") {
      if (connection.preparation && ["failed", "canceled"].includes(connection.preparation.status)) throw new ConnectorChatError("preparationFailed");
      if (deps.now() >= deadline) throw new ConnectorChatError("preparationTimeout");
      await deps.wait(); deps.assertCurrent();
      connection = readConnectorConnection(await deps.readConnection(), item.id);
      deps.assertCurrent();
    }
  }
  return connection;
}

export async function prepareConnectorChat(item: ConnectorSummary, agentKey: string, deps: ConnectorChatDependencies): Promise<void> {
  const connection = await ensureConnectorPrepared(item, deps);
  if (connection.configurationRequired && !connection.configured) throw new ConnectorChatError("configurationRequired");
  if (!["ready", "no_auth"].includes(connection.readiness)) throw new ConnectorChatError("authorizationRequired");

  deps.onPhase("mounting");
  let state = readAgentConnectors(await deps.readAgent(), agentKey);
  deps.assertCurrent();
  if (!state.connectorIds.includes(item.id)) {
    try { state = readAgentConnectors(await deps.mount(), agentKey); }
    catch (error) {
      deps.assertCurrent();
      // An unknown write result may have saved successfully. Read the source
      // once; never replay a mount or invent its runtime activation.
      state = readAgentConnectors(await deps.readAgent(), agentKey);
      if (!state.connectorIds.includes(item.id)) throw error;
    }
    deps.assertCurrent();
  }
  const deadline = deps.now() + 60_000;
  while (state.reloadPending || !state.activeConnectorIds.includes(item.id)) {
    if (!state.connectorIds.includes(item.id)) throw new ConnectorChatError("invalidResponse");
    if (deps.now() >= deadline) throw new ConnectorChatError("reloadTimeout");
    await deps.wait(); deps.assertCurrent();
    state = readAgentConnectors(await deps.readAgent(), agentKey);
    deps.assertCurrent();
  }
}

export function waitForConnectorPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, 2_000);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

let lastNewChat = 0;
export function connectorChatUrl(agentKey: string, draft = "", now = Date.now()): string {
  const timestamp = Math.max(Math.floor(now), lastNewChat + 1);
  if (!agentKey.trim() || !/^[1-9]\d{12}$/.test(String(timestamp)) || draft.length > 2048) throw new ConnectorChatError("invalidResponse");
  lastNewChat = timestamp;
  // An explicitly present empty draft still clears previous Composer context.
  return `/agent/${encodeURIComponent(agentKey.trim())}?${new URLSearchParams({ newChat: String(timestamp), composerDraft: draft })}`;
}
