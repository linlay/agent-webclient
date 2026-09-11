import type {
  GetAgentsOptions,
  AdminAgentSummary,
  AgentOrderResponse,
  UpdateAgentOrderRequest,
  AgentDetailResponse,
  AgentSkillsResponse,
  AdminAgentDetailResponse,
  CreateAgentRequest,
  ImportAgentArchiveRequest,
  UpdateAgentRequest,
  UpdateAgentNameRequest,
  UpdateAgentModelConfigRequest,
  AgentModelConfigResponse,
  DeleteAgentRequest,
  DeleteAgentResponse,
  OpenAgentDirectoryRequest,
  OpenAgentDirectoryResponse,
  AgentEditorOptionsResponse,
} from "@/shared/data/api/dto/agents";
import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import {
  endpointQuery,
  withQuery,
} from "@/shared/data/api/queryParams";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  requestJson,
  postJson,
} from "@/shared/data/api/http";
import type {
  CoderModelOptionsResponse,
} from "@/shared/data/api/dto/models";

export function getAgents(options: GetAgentsOptions = {}): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.agents, options);
  return requestJson(withQuery(dataEndpoints.agents.path, query));
}

export function getAdminAgents(): Promise<ApiResponse<AdminAgentSummary[]>> {
  return requestJson<AdminAgentSummary[]>(dataEndpoints.adminAgents.path);
}

export function getAgentOrder(): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.agentOrder.path);
}

export function putAgentOrder(
  params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.agentOrderUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params ?? { order: [] }),
  });
}

export function putAdminAgentOrder(
  params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.adminAgentOrderUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params ?? { order: [] }),
  });
}

export function getAgent(agentKey: string): Promise<ApiResponse<AgentDetailResponse>> {
  const query = endpointQuery(dataEndpoints.agent, agentKey);
  return requestJson(withQuery(dataEndpoints.agent.path, query));
}

export function getAgentSkills(
  agentKey: string,
): Promise<ApiResponse<AgentSkillsResponse>> {
  const query = endpointQuery(dataEndpoints.agentSkills, agentKey);
  return requestJson<AgentSkillsResponse>(
    withQuery(dataEndpoints.agentSkills.path, query),
  );
}

export function getAdminAgentDetail(agentKey: string): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminAgentDetail, agentKey);
  return requestJson<AdminAgentDetailResponse>(withQuery(dataEndpoints.adminAgentDetail.path, query));
}

export function createAgent(
  params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentCreate.path, params);
}

export function importAdminAgent(
  params: ImportAgentArchiveRequest,
): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const form = new FormData();
  form.append("file", params.file);
  if (params.overwrite) form.append("overwrite", "true");
  return requestJson<AdminAgentDetailResponse>(dataEndpoints.adminAgentImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function updateAgent(
  params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentUpdate.path, params);
}

export function updateAgentName(
  params: UpdateAgentNameRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentUpdateName.path, params);
}

export function updateAgentModelConfig(
  params: UpdateAgentModelConfigRequest,
): Promise<ApiResponse<AgentModelConfigResponse>> {
  return postJson<AgentModelConfigResponse>(dataEndpoints.agentModelConfig.path, params);
}

export function deleteAgent(
  params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
  return postJson<DeleteAgentResponse>(dataEndpoints.adminAgentDelete.path, params);
}

export function importAdminAgentPrivateSkill(params: {
  agentKey: string;
  file: File;
}): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const form = new FormData();
  form.append("agentKey", params.agentKey);
  form.append("file", params.file);
  return requestJson<AdminAgentDetailResponse>(dataEndpoints.adminAgentPrivateSkillImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function deleteAdminAgentPrivateSkill(params: {
  agentKey: string;
  key: string;
}): Promise<ApiResponse<AdminAgentDetailResponse>> {
  return postJson<AdminAgentDetailResponse>(dataEndpoints.adminAgentPrivateSkillDelete.path, params);
}

export function openAgentDirectory(
  params: OpenAgentDirectoryRequest,
): Promise<ApiResponse<OpenAgentDirectoryResponse>> {
  return postJson<OpenAgentDirectoryResponse>(dataEndpoints.agentOpenDirectory.path, params);
}

export function getAdminAgentEditorOptions(): Promise<ApiResponse<AgentEditorOptionsResponse>> {
  return requestJson<AgentEditorOptionsResponse>(dataEndpoints.adminAgentEditorOptions.path);
}

export function getModelOptions(agentKey?: string): Promise<ApiResponse<CoderModelOptionsResponse>> {
  const query = endpointQuery(dataEndpoints.modelOptions, agentKey);
  return requestJson<CoderModelOptionsResponse>(
    withQuery(dataEndpoints.modelOptions.path, query),
  );
}

export function getTeams(): Promise<ApiResponse> {
  return requestJson(dataEndpoints.teams.path);
}
