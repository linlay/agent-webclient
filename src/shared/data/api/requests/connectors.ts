import type { ApiResponse } from "@/shared/data/api/dto/common";
import type {
  ConnectorDefinition, ConnectorDefinitionTarget, ConnectorListResponse,
  ConnectorOrderResponse, UpdateConnectorOrderRequest,
  UpdateConnectorDefinitionRequest, DeleteConnectorResponse,
  ImportConnectorArchiveRequest, ImportConnectorArchiveResponse,
  ConnectorSkillListResponse, ConnectorSkillDetail,
  ConnectorAuthSession, ConnectorAuthActionResult,
  AgentConnectorsResponse, SetAgentConnectorRequest,
} from "@/shared/data/api/dto/connectors";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { requestJson } from "@/shared/data/api/http";
import { endpointQuery, withQuery } from "@/shared/data/api/queryParams";

export function getAdminConnectors(): Promise<ApiResponse<ConnectorListResponse>> {
  return requestJson<ConnectorListResponse>(dataEndpoints.adminConnectors.path);
}

export function getAgentConnectors(agentKey: string): Promise<ApiResponse<AgentConnectorsResponse>> {
  const endpoint = dataEndpoints.adminAgentConnectors;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, agentKey)), { cache: "no-store" });
}

export function setAgentConnector(params: SetAgentConnectorRequest): Promise<ApiResponse<AgentConnectorsResponse>> {
  const endpoint = dataEndpoints.adminAgentConnectorUpdate;
  return requestJson(endpoint.path, { method: endpoint.method, body: JSON.stringify(params), cache: "no-store" });
}

export function getConnectorSkills(id: string): Promise<ApiResponse<ConnectorSkillListResponse>> {
  return requestJson(withQuery(dataEndpoints.adminConnectorSkills.path, endpointQuery(dataEndpoints.adminConnectorSkills, { id })));
}

export function getConnectorSkillDetail(id: string, name: string): Promise<ApiResponse<ConnectorSkillDetail>> {
  return requestJson(withQuery(dataEndpoints.adminConnectorSkillDetail.path, endpointQuery(dataEndpoints.adminConnectorSkillDetail, { id, name })));
}

export function getConnectorDefinition(target: ConnectorDefinitionTarget): Promise<ApiResponse<ConnectorDefinition>> {
  return requestJson<ConnectorDefinition>(withQuery(
    dataEndpoints.adminConnectorDetail.path,
    endpointQuery(dataEndpoints.adminConnectorDetail, target),
  ));
}

export function updateConnectorDefinition(params: UpdateConnectorDefinitionRequest): Promise<ApiResponse<ConnectorDefinition>> {
  return requestJson<ConnectorDefinition>(dataEndpoints.adminConnectorUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function deleteConnector(id: string): Promise<ApiResponse<DeleteConnectorResponse>> {
  const endpoint = dataEndpoints.adminConnectorDelete;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), {
    method: endpoint.method, cache: "no-store",
  });
}

export function importConnectorArchive(params: ImportConnectorArchiveRequest): Promise<ApiResponse<ImportConnectorArchiveResponse>> {
  const form = new FormData();
  form.append("file", params.file);
  if (params.overwrite) form.append("overwrite", "true");
  return requestJson<ImportConnectorArchiveResponse>(dataEndpoints.adminConnectorImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

// Authorization sessions bypass the server-state cache and never persist in browser storage.
export function getConnectorAuthStatus(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthSession>> {
  const endpoint = dataEndpoints.adminConnectorAuthStatus;
  return requestJson<ConnectorAuthSession>(withQuery(endpoint.path, endpointQuery(endpoint, id)), {
    method: endpoint.method, cache: "no-store", signal,
  });
}

export function startConnectorAuth(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthSession>> {
  const endpoint = dataEndpoints.adminConnectorAuthStart;
  return requestJson<ConnectorAuthSession>(withQuery(endpoint.path, endpointQuery(endpoint, id)), {
    method: endpoint.method, cache: "no-store", signal,
  });
}

export function cancelConnectorAuth(id: string, signal?: AbortSignal, sessionId?: string): Promise<ApiResponse<ConnectorAuthActionResult>> {
  const endpoint = dataEndpoints.adminConnectorAuthCancel;
  return requestJson<ConnectorAuthActionResult>(withQuery(endpoint.path, endpointQuery(endpoint, id) + (sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : "")), {
    method: endpoint.method, cache: "no-store", signal,
  });
}

export function logoutConnectorAuth(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthActionResult>> {
  const endpoint = dataEndpoints.adminConnectorAuthLogout;
  return requestJson<ConnectorAuthActionResult>(withQuery(endpoint.path, endpointQuery(endpoint, id)), {
    method: endpoint.method, cache: "no-store", signal,
  });
}

export function getConnectorOrder(): Promise<ApiResponse<ConnectorOrderResponse>> {
  return requestJson(dataEndpoints.connectorOrder.path, { cache: "no-store" });
}

export function putConnectorOrder(params: UpdateConnectorOrderRequest): Promise<ApiResponse<ConnectorOrderResponse>> {
  return requestJson(dataEndpoints.connectorOrderUpdate.path, {
    method: "PUT", body: JSON.stringify(params),
  });
}
