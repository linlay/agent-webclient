import type { Agent } from "@/features/agents/lib/agentState";
import { getAgents } from "@/shared/data";

export async function fetchAutomationAgentsForSelect(): Promise<Agent[]> {
  const response = await getAgents();
  return Array.isArray(response.data) ? (response.data as Agent[]) : [];
}
