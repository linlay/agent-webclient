import {
  deleteAgent,
  getAgent,
  updateAgentName,
  type AgentDetailResponse,
} from "@/shared/data";

export async function loadAgentCopyDetail(
  agentKey: string,
): Promise<AgentDetailResponse> {
  const response = await getAgent(agentKey);
  return response.data;
}

export async function renameManagedAgent(
  agentKey: string,
  name: string,
): Promise<void> {
  await updateAgentName({ key: agentKey, name });
}

export async function deleteManagedAgent(agentKey: string): Promise<void> {
  await deleteAgent({ key: agentKey });
}
