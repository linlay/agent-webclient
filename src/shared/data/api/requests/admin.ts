import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import type {
  AdminRegistryListResponse,
  AdminRegistryValidateRequest,
  AdminRegistryValidateResponse,
  AdminToolSummary,
  AdminSourceTarget,
  AdminSourceResponse,
  UpdateAdminSourceRequest,
  DeleteAdminSourceRequest,
  DeleteAdminSourceResponse,
} from "@/shared/data/api/dto/admin";
import {
  requestJson,
  postJson,
} from "@/shared/data/api/http";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  endpointQuery,
  withQuery,
} from "@/shared/data/api/queryParams";

export function getAdminRegistries(): Promise<ApiResponse<AdminRegistryListResponse>> {
  return requestJson<AdminRegistryListResponse>(dataEndpoints.adminRegistries.path);
}

export function validateAdminRegistry(
  params: AdminRegistryValidateRequest,
): Promise<ApiResponse<AdminRegistryValidateResponse>> {
  return postJson<AdminRegistryValidateResponse>(dataEndpoints.adminRegistryValidate.path, params);
}

export function getAdminTools(): Promise<ApiResponse<AdminToolSummary[]>> {
  return requestJson<AdminToolSummary[]>(dataEndpoints.adminTools.path);
}

export function getAdminSource(target: AdminSourceTarget): Promise<ApiResponse<AdminSourceResponse>> {
  const query = endpointQuery(dataEndpoints.adminSource, target);
  return requestJson<AdminSourceResponse>(
    withQuery(dataEndpoints.adminSource.path, query),
  );
}

export function updateAdminSource(
  params: UpdateAdminSourceRequest,
): Promise<ApiResponse<AdminSourceResponse>> {
  return requestJson<AdminSourceResponse>(dataEndpoints.adminSourceUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function deleteAdminSource(
  params: DeleteAdminSourceRequest,
): Promise<ApiResponse<DeleteAdminSourceResponse>> {
  return requestJson<DeleteAdminSourceResponse>(
    dataEndpoints.adminSourceDelete.path,
    {
      method: "DELETE",
      body: JSON.stringify(params),
    },
  );
}
