import type { ApiResponse } from "@/shared/data/api/dto/common";
import type {
  ConnectorDefinition, ConnectorDefinitionTarget, ConnectorListResponse,
  UpdateConnectorDefinitionRequest,
} from "@/shared/data/api/dto/connectors";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { requestJson } from "@/shared/data/api/http";
import { endpointQuery, withQuery } from "@/shared/data/api/queryParams";

export function getAdminConnectors(): Promise<ApiResponse<ConnectorListResponse>> {
  return requestJson<ConnectorListResponse>(dataEndpoints.adminConnectors.path);
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
