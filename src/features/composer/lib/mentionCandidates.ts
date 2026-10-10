import type { Agent } from "@/features/agents/lib/agentState";
import type { AppState } from "@/app/state/AppContext";
export function resolveMentionCandidatesFromState(state: AppState): Agent[] {
 const worker = state.workerIndexByKey.get(state.workerSelectionKey);
 const agent = state.agents.find(item => item.key === worker?.sourceId);
 if (agent?.mode !== "TEAM") return [];
 const byKey = new Map(state.agents.map(item => [item.key, item]));
 return (agent.teamConfig?.members || []).map(key => byKey.get(key) || { key, name: key });
}
