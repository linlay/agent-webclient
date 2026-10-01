import { RefreshCoordinator } from "@/shared/data/query/refreshCoordinator";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import type { AgentDetailResponse } from "@/shared/data/api/dto/agents";
const scopes = new WeakMap<object, Map<string, RefreshCoordinator<AgentDetailResponse>>>();
export function agentRefresh(scope: object, agentKey: string) {
  let entries = scopes.get(scope);
  if (!entries) { entries = new Map(); scopes.set(scope, entries); }
  let entry = entries.get(agentKey);
  if (!entry) { entry = new RefreshCoordinator<AgentDetailResponse>(); entries.set(agentKey, entry); }
  return entry;
}
export function rejectAgentCheck(scope: object, agentKey: string) {
  agentRefresh(scope, agentKey).cancel(() => invalidateAgentDetail(agentKey));
}
export function affectsAgentCatalog(frame: { data?: unknown }) {
  const reason = (frame.data as { reason?: string } | undefined)?.reason;
  return reason !== "viewports";
}
