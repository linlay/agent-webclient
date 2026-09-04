import type { Agent } from "@/app/state/types";
import { getAgents } from "@/shared/data";

export async function fetchAutomationAgentsForSelect(): Promise<Agent[]> {
  const response = await getAgents();
  return Array.isArray(response.data) ? (response.data as Agent[]) : [];
}
