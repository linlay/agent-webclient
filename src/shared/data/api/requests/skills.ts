import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import type {
  AdminSkillSummary,
  AdminSkillDetailResponse,
  AdminSkillImportResponse,
  AdminSkillCreateFileRequest,
  AdminSkillMutationResponse,
  AdminSkillMkdirRequest,
  AdminSkillRenameRequest,
  AdminSkillDeleteFileRequest,
  AdminSkillValidateResponse,
  AdminSkillCreateRequest,
  AdminSkillDeleteResponse,
  SkillOrderResponse,
  UpdateSkillOrderRequest,
} from "@/shared/data/api/dto/skills";
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

export function getAdminSkills(): Promise<ApiResponse<AdminSkillSummary[]>> {
  return requestJson<AdminSkillSummary[]>(dataEndpoints.adminSkills.path);
}

export function getSkillOrder(): Promise<ApiResponse<SkillOrderResponse>> {
  return requestJson<SkillOrderResponse>(dataEndpoints.skillOrder.path, { cache: "no-store" });
}

export function putSkillOrder(params: UpdateSkillOrderRequest): Promise<ApiResponse<SkillOrderResponse>> {
  return requestJson<SkillOrderResponse>(dataEndpoints.skillOrderUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function getAdminSkillDetail(
  key: string,
  openPath?: string,
): Promise<ApiResponse<AdminSkillDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminSkillDetail, {
    key,
    ...(openPath ? { openPath } : {}),
  });
  return requestJson<AdminSkillDetailResponse>(
    withQuery(dataEndpoints.adminSkillDetail.path, query),
  );
}

export function createAdminSkillFile(
  params: AdminSkillCreateFileRequest,
): Promise<ApiResponse<AdminSkillMutationResponse>> {
  return postJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillCreateFile.path, params);
}

export function mkdirAdminSkillFile(
  params: AdminSkillMkdirRequest,
): Promise<ApiResponse<AdminSkillMutationResponse>> {
  return postJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillMkdir.path, params);
}

export function renameAdminSkillFile(
  params: AdminSkillRenameRequest,
): Promise<ApiResponse<AdminSkillMutationResponse>> {
  return postJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillRename.path, params);
}

export function deleteAdminSkillFile(
  params: AdminSkillDeleteFileRequest,
): Promise<ApiResponse<AdminSkillMutationResponse>> {
  return postJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillDeleteFile.path, params);
}

export function uploadAdminSkillFile(params: {
  key: string;
  path: string;
  file: File | Blob;
  overwrite?: boolean;
}): Promise<ApiResponse<AdminSkillMutationResponse>> {
  const form = new FormData();
  form.append("key", params.key);
  form.append("path", params.path);
  if (params.overwrite !== undefined) {
    form.append("overwrite", String(params.overwrite));
  }
  form.append("file", params.file);
  return requestJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillUpload.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function validateAdminSkill(key: string): Promise<ApiResponse<AdminSkillValidateResponse>> {
  return postJson<AdminSkillValidateResponse>(dataEndpoints.adminSkillValidate.path, { key });
}

export function createAdminSkill(
  params: AdminSkillCreateRequest,
): Promise<ApiResponse<AdminSkillDetailResponse>> {
  return postJson<AdminSkillDetailResponse>(dataEndpoints.adminSkillCreate.path, params);
}

export function importAdminSkill(params: {
  key?: string;
  file: File;
}): Promise<ApiResponse<AdminSkillImportResponse>> {
  const form = new FormData();
  if (params.key?.trim()) form.append("key", params.key.trim());
  form.append("file", params.file);
  return requestJson<AdminSkillImportResponse>(dataEndpoints.adminSkillImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function deleteAdminSkill(key: string): Promise<ApiResponse<AdminSkillDeleteResponse>> {
  return postJson<AdminSkillDeleteResponse>(dataEndpoints.adminSkillDelete.path, { key });
}
