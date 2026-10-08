import type { AdminAgentDetailResponse } from "../dto/agents";
import type { ApiResponse } from "@/shared/data/api/dto/common";
import type {
  ConnectorDefinition, ConnectorDefinitionTarget, ConnectorListResponse,
  ConnectorOrderResponse, UpdateConnectorOrderRequest,
  UpdateConnectorDefinitionRequest, DeleteConnectorResponse,
  ImportConnectorArchiveRequest, ImportConnectorArchiveResponse,
  ConnectorSkillListResponse, ConnectorSkillDetail,
  ConnectorAuthSession, ConnectorAuthActionResult, ConnectorConnection, ConnectorConnectionsResponse,
  ConnectorPreparation,
  AgentConnectorsResponse, AdminAgentConnectorsResponse, SetAgentConnectorRequest, ConnectorOptionsResponse,
} from "@/shared/data/api/dto/connectors";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { requestJson } from "@/shared/data/api/http";
import { endpointQuery, withQuery } from "@/shared/data/api/queryParams";

export function getAdminConnectors(): Promise<ApiResponse<ConnectorListResponse>> {
  return requestJson<ConnectorListResponse>(dataEndpoints.adminConnectors.path);
}

export function setAgentConnector(params: SetAgentConnectorRequest, signal?: AbortSignal): Promise<ApiResponse<AgentConnectorsResponse>> {
  const endpoint = dataEndpoints.agentConnectorUpdate;
  return requestJson(endpoint.path, { method: endpoint.method, body: JSON.stringify(params), cache: "no-store", ...(signal ? { signal } : {}) });
}

export function getConnectors(agentKey = "", signal?: AbortSignal): Promise<ApiResponse<ConnectorOptionsResponse>> {
  const endpoint = dataEndpoints.connectors;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, agentKey)), { cache: "no-store", ...(signal ? { signal } : {}) });
}

export async function getAdminAgentConnectors(agentKey: string, signal?: AbortSignal): Promise<ApiResponse<AdminAgentConnectorsResponse>> {
  const endpoint = dataEndpoints.adminAgentConnectors;
  const response = await requestJson<AdminAgentDetailResponse>(withQuery(endpoint.path, endpointQuery(endpoint, agentKey)), { cache: "no-store", ...(signal ? { signal } : {}) });
  if (!response.data.connectorBindings) throw new Error("Agent connector bindings unavailable");
  const bindings = response.data.connectorBindings;
  // The mounting workflow still consumes the write endpoint's selection DTO.
  return { ...response, data: {
    agentKey: response.data.key,
    connectorIds: bindings.filter(item => !item.pendingRemoval).map(item => item.id),
    presetConnectorIds: bindings.filter(item => item.source === "preset" && !item.pendingRemoval).map(item => item.id),
    declaredConnectorIds: bindings.filter(item => item.source === "agent" && !item.pendingRemoval).map(item => item.id),
    activeConnectorIds: bindings.filter(item => item.active).map(item => item.id),
    reloadPending: response.data.reloadPending || false,
  } };
}

export function setAdminAgentConnector(params: SetAgentConnectorRequest, signal?: AbortSignal): Promise<ApiResponse<AdminAgentConnectorsResponse>> {
  const endpoint = dataEndpoints.adminAgentConnectorUpdate;
  return requestJson(endpoint.path, { method: endpoint.method, body: JSON.stringify(params), cache: "no-store", ...(signal ? { signal } : {}) });
}

export function getConnectorSkills(id: string): Promise<ApiResponse<ConnectorSkillListResponse>> {
  return requestJson(withQuery(dataEndpoints.adminConnectorSkills.path, endpointQuery(dataEndpoints.adminConnectorSkills, { id })));
}

export function getConnectorSkillDetail(id: string, skillId: string): Promise<ApiResponse<ConnectorSkillDetail>> {
  return requestJson(withQuery(dataEndpoints.adminConnectorSkillDetail.path, endpointQuery(dataEndpoints.adminConnectorSkillDetail, { id, skillId })));
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

export function getConnectorConnection(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorConnection>> {
 const endpoint = dataEndpoints.connectorConnection;
 return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), {method: endpoint.method, cache: "no-store", signal});
}

// Platform exposes configuration/authentication snapshots only over HTTP.
// The selectable catalog and Agent switch mutations use routedClient instead.
export function getConnectorConnections(signal?: AbortSignal): Promise<ApiResponse<ConnectorConnectionsResponse>> {
  const endpoint = dataEndpoints.connectorConnection;
  return requestJson(endpoint.path, { method: endpoint.method, cache: "no-store", signal });
}

export function prepareConnector(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorPreparation>> {
  const endpoint = dataEndpoints.adminConnectorPrepare;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), { method: endpoint.method, cache: "no-store", signal, retryUnauthorized: false });
}

export function connectConnector(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthSession>> {
  const endpoint = dataEndpoints.connectorConnect;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), { method: endpoint.method, cache: "no-store", signal, retryUnauthorized: false });
}

export function checkConnectorConnection(id: string, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthSession>> {
  const endpoint = dataEndpoints.connectorCheck;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), { method: endpoint.method, cache: "no-store", signal, retryUnauthorized: false });
}

/** Direct HTTP keeps private values out of data-request debug frames and query caches.
 * A lost write result must be checked explicitly, never replayed automatically. */
export function saveConnectorCredentials(id: string, credentials: Record<string, string>, signal?: AbortSignal): Promise<ApiResponse<ConnectorAuthSession>> {
  const endpoint = dataEndpoints.adminConnectorCredentials;
  return requestJson(withQuery(endpoint.path, endpointQuery(endpoint, id)), {
    method: endpoint.method, body: JSON.stringify({ credentials }), cache: "no-store", signal, retryUnauthorized: false,
  });
}
