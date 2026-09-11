import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import type {
  FileHistoryResponse,
  AgentFileRequest,
  AgentFileResponse,
  DocumentCommitRequest,
  DocumentCommitResponse,
  ProjectTreeRequest,
  ProjectTreeResponse,
  ProjectChangesRequest,
  ProjectChangesResponse,
  ProjectDiffRequest,
  ProjectDiffResponse,
} from "@/shared/data/api/dto/resources";
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

export function getFileHistory(
  params: {
    chatId?: string;
    runId: string;
    filePath: string;
    version: "original" | "current";
  },
  options: { signal?: AbortSignal } = {},
): Promise<ApiResponse<FileHistoryResponse>> {
  const query = endpointQuery(dataEndpoints.fileHistory, params);
  return requestJson<FileHistoryResponse>(withQuery(dataEndpoints.fileHistory.path, query), {
    method: "GET",
    signal: options.signal,
  });
}

export function getAgentFile(
  params: AgentFileRequest,
): Promise<ApiResponse<AgentFileResponse>> {
  const query = endpointQuery(dataEndpoints.agentFile, params);
  return requestJson<AgentFileResponse>(
    withQuery(dataEndpoints.agentFile.path, query),
  );
}

export function commitDocument(
  request: DocumentCommitRequest,
): Promise<ApiResponse<DocumentCommitResponse>> {
  return requestJson<DocumentCommitResponse>(dataEndpoints.documentCommit.path, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getProjectTree(
  params: ProjectTreeRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResponse<ProjectTreeResponse>> {
  const query = endpointQuery(dataEndpoints.projectTree, params);
  const response = await requestJson<ProjectTreeResponse>(withQuery(dataEndpoints.projectTree.path, query), {
    method: "GET",
    signal: options.signal,
  });
  if (response.data) {
    response.data.entries = Array.isArray(response.data.entries) ? response.data.entries : [];
  }
  return response;
}

export async function getProjectChanges(
  params: ProjectChangesRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResponse<ProjectChangesResponse>> {
  const query = endpointQuery(dataEndpoints.projectChanges, params);
  const response = await requestJson<ProjectChangesResponse>(withQuery(dataEndpoints.projectChanges.path, query), {
    method: "GET",
    signal: options.signal,
  });
  if (response.data) {
    response.data.runs = Array.isArray(response.data.runs) ? response.data.runs : [];
    response.data.items = Array.isArray(response.data.items) ? response.data.items : [];
  }
  return response;
}

export function getProjectDiff(
  params: ProjectDiffRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResponse<ProjectDiffResponse>> {
  const query = endpointQuery(dataEndpoints.projectDiff, params);
  return requestJson<ProjectDiffResponse>(withQuery(dataEndpoints.projectDiff.path, query), {
    method: "GET",
    signal: options.signal,
  });
}
