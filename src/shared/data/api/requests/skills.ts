import type { AgentSkillsResponse } from "@/shared/data/api/dto/agents";
import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import type {
  AdminSkillsResponse,
  AdminSkillPinResponse,
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
  UpdateAgentSkillPinRequest,
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

export function getAdminSkills(): Promise<ApiResponse<AdminSkillsResponse>> {
  return requestJson<AdminSkillsResponse>(dataEndpoints.adminSkills.path);
}

export function putAdminSkillPin(params: UpdateAgentSkillPinRequest): Promise<ApiResponse<AdminSkillPinResponse>> {
  return requestJson<AdminSkillPinResponse>(dataEndpoints.adminSkillPinUpdate.path, {
    method: "PUT", body: JSON.stringify(params),
  });
}

export function putAgentSkillPin(params: UpdateAgentSkillPinRequest): Promise<ApiResponse<AgentSkillsResponse>> {
  return requestJson<AgentSkillsResponse>(dataEndpoints.skillPinUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function getAdminSkillDetail(
  id: string,
  openPath?: string,
): Promise<ApiResponse<AdminSkillDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminSkillDetail, {
    id,
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
  id: string;
  path: string;
  file: File | Blob;
  overwrite?: boolean;
}): Promise<ApiResponse<AdminSkillMutationResponse>> {
  const form = new FormData();
  form.append("id", params.id);
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

export function validateAdminSkill(id: string): Promise<ApiResponse<AdminSkillValidateResponse>> {
  return postJson<AdminSkillValidateResponse>(dataEndpoints.adminSkillValidate.path, { id });
}

export function createAdminSkill(
  params: AdminSkillCreateRequest,
): Promise<ApiResponse<AdminSkillDetailResponse>> {
  return postJson<AdminSkillDetailResponse>(dataEndpoints.adminSkillCreate.path, params);
}

export function importAdminSkill(params: {
  id?: string;
  file: File;
}): Promise<ApiResponse<AdminSkillImportResponse>> {
  const form = new FormData();
  if (params.id?.trim()) form.append("id", params.id.trim());
  form.append("file", params.file);
  return requestJson<AdminSkillImportResponse>(dataEndpoints.adminSkillImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function deleteAdminSkill(id: string): Promise<ApiResponse<AdminSkillDeleteResponse>> {
  return postJson<AdminSkillDeleteResponse>(dataEndpoints.adminSkillDelete.path, { id });
}
