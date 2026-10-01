import { RefreshCoordinator } from "@/shared/data/query/refreshCoordinator";
import type { AgentSkillsResponse } from "@/shared/data/api/dto/agents";
const entries = new Map<string, RefreshCoordinator<AgentSkillsResponse>>();
export function skillRefresh(key: string) {
  let entry = entries.get(key);
  if (!entry) { entry = new RefreshCoordinator<AgentSkillsResponse>(); entries.set(key, entry); }
  return entry;
}
export const SKILLS_REFRESH_EVENT = "agent:skills-refresh";
export function requestSkillsRefresh(agentKey: string) {
  window.dispatchEvent(new CustomEvent(SKILLS_REFRESH_EVENT, { detail: { agentKey } }));
}
export function affectsSkillsCatalog(frame: { data?: unknown }) {
  return ["skills", "agents", "config", "connectors"].includes((frame.data as { reason?: string })?.reason || "");
}

const users = new Map<string, number>();
export function retainSkillRefresh(key: string) {
  users.set(key, (users.get(key) || 0) + 1);
  return () => {
    const remaining = (users.get(key) || 1) - 1;
    if (remaining) users.set(key, remaining);
    else { users.delete(key); entries.get(key)?.cancel(() => undefined); entries.delete(key); }
  };
}
