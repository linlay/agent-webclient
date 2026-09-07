import type {
  ArchiveChatsRequest,
  ArchiveChatsResponse,
  ArchivesRequest,
  ArchivesResponse,
  ArchiveDetailResponse,
  ArchiveSearchParams,
  ArchiveSearchResponse,
  ArchiveDeleteResponse,
  ArchiveRestoreResponse,
} from "@/shared/data/api/dto/archives";
import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import {
  postJson,
  requestJson,
} from "@/shared/data/api/http";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  endpointQuery,
  withQuery,
} from "@/shared/data/api/queryParams";

export function archiveChats(
  params: ArchiveChatsRequest,
): Promise<ApiResponse<ArchiveChatsResponse>> {
  return postJson<ArchiveChatsResponse>(dataEndpoints.chatArchive.path, {
    chatIds: params.chatIds,
  });
}

export function getArchives(
  params: ArchivesRequest = {},
): Promise<ApiResponse<ArchivesResponse>> {
  const query = endpointQuery(dataEndpoints.archives, params);
  return requestJson<ArchivesResponse>(withQuery(dataEndpoints.archives.path, query));
}

export function getArchive(
  chatId: string,
  includeRawMessages = false,
): Promise<ApiResponse<ArchiveDetailResponse>> {
  const query = endpointQuery(dataEndpoints.archive, { chatId, includeRawMessages });
  return requestJson<ArchiveDetailResponse>(withQuery(dataEndpoints.archive.path, query));
}

export function searchArchives(
  params: ArchiveSearchParams,
): Promise<ApiResponse<ArchiveSearchResponse>> {
  return postJson<ArchiveSearchResponse>(dataEndpoints.archivesSearch.path, {
    query: params.query,
    agentKey: params.agentKey,
    limit: params.limit,
  });
}

export function deleteArchive(params: {
  chatId: string;
}): Promise<ApiResponse<ArchiveDeleteResponse>> {
  const query = endpointQuery(dataEndpoints.archiveDelete, params);
  return requestJson<ArchiveDeleteResponse>(withQuery(dataEndpoints.archiveDelete.path, query), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function restoreArchives(params: {
  chatIds: string[];
}): Promise<ApiResponse<ArchiveRestoreResponse>> {
  return postJson<ArchiveRestoreResponse>(dataEndpoints.archiveRestore.path, {
    chatIds: params.chatIds,
  });
}
