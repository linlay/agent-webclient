import type {
  GetMemoryRecordsParams,
  MemoryRecordsPayload,
  MemoryRecordDetail,
  MemoryScopesResponse,
  MemoryMeta,
  MemoryScopeDetail,
  MemoryScopeValidationResult,
  MemoryContextPreviewResponse,
  MemoryScopeSavePayload,
  MemoryScopeSaveResult,
} from "@/shared/data/memory/memoryTypes";
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
} from "@/shared/data/api/http";

export function getMemoryRecords(
  params: GetMemoryRecordsParams,
): Promise<ApiResponse<MemoryRecordsPayload>> {
  const query = endpointQuery(dataEndpoints.memoryRecords, params);
  return requestJson<MemoryRecordsPayload>(withQuery(dataEndpoints.memoryRecords.path, query));
}

export function getMemoryRecord(
  agentKey: string | undefined,
  id: string,
): Promise<ApiResponse<MemoryRecordDetail>> {
  const query = endpointQuery(dataEndpoints.memoryRecordDetail, {
    agentKey,
    recordId: id,
  });
  return requestJson<MemoryRecordDetail>(withQuery(dataEndpoints.memoryRecordDetail.path, query));
}

export function getMemoryScopes(
  agentKey: string,
): Promise<ApiResponse<MemoryScopesResponse>> {
  const query = endpointQuery(dataEndpoints.memoryScopes, agentKey);
  return requestJson<MemoryScopesResponse>(withQuery(dataEndpoints.memoryScopes.path, query));
}

export function getMemoryMeta(): Promise<ApiResponse<MemoryMeta>> {
  return requestJson<MemoryMeta>(dataEndpoints.memoryMeta.path);
}

export function getMemoryScope(
  agentKey: string,
  scopeType: string,
  scopeKey?: string,
): Promise<ApiResponse<MemoryScopeDetail>> {
  const query = endpointQuery(dataEndpoints.memoryScope, {
    agentKey,
    scopeType,
    scopeKey,
  });
  return requestJson<MemoryScopeDetail>(withQuery(dataEndpoints.memoryScope.path, query));
}

export function validateMemoryScope(
  agentKey: string,
  scopeType: string,
  markdown: string,
): Promise<ApiResponse<MemoryScopeValidationResult>> {
  return requestJson<MemoryScopeValidationResult>(dataEndpoints.memoryScopeValidate.path, {
    method: "POST",
    body: JSON.stringify({
      agentKey,
      scopeType,
      markdown,
    }),
  });
}

export function previewMemoryContext(params: {
  chatId: string;
  message: string;
}): Promise<ApiResponse<MemoryContextPreviewResponse>> {
  return requestJson<MemoryContextPreviewResponse>(dataEndpoints.memoryContextPreview.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      message: params.message,
    }),
  });
}

export function saveMemoryScope(
  payload: MemoryScopeSavePayload,
): Promise<ApiResponse<MemoryScopeSaveResult>> {
  return requestJson<MemoryScopeSaveResult>(dataEndpoints.memoryScopeSave.path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
