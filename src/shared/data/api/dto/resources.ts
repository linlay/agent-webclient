export type ResourceUrlKind = "chat" | "absolute" | "external" | "inline" | "invalid";

export interface ResourceUrlClassification {
	kind: ResourceUrlKind;
	source: string;
	fetchUrl: string;
	resourceKey?: string;
	requiresPlatformAuth: boolean;
}

export interface ResourceUrlClassificationOptions {
	teamChat?: boolean;
}

export interface ResourceDocumentTextResponse {
  content: string;
  revision: string;
  documentKind?: import("@/shared/types/document").DocumentContentKind;
  mimeType?: string;
  sizeBytes?: number;
}

export type ResourceDocumentMetadataResponse = Omit<ResourceDocumentTextResponse, "content">;

export interface UploadFileParams {
  file: Blob;
  filename?: string;
  requestId?: string;
  chatId?: string;
  sha256?: string;
  signal?: AbortSignal;
}

export interface FileHistoryResponse {
  content: string;
}

export interface AgentFileRequest {
  agentKey: string;
  path: string;
  encoding?: string;
}

export interface AgentFileResponse {
  agentKey: string;
  workspaceRoot: string;
  requestedPath: string;
  path: string;
  absolutePath: string;
  name: string;
  kind: string;
  contentKind: "text" | "binary";
  documentKind?: import("@/shared/types/document").DocumentContentKind;
  revision?: string;
  mimeType?: string;
  encoding?: string;
  content?: string;
  sizeBytes: number;
  readBytes?: number;
  sha256?: string;
  modifiedUnixMs?: number;
  truncated: boolean;
  contentUrl?: string;
}

export type DocumentCommitSource =
  | { kind: "workspace-file"; agentKey: string; path: string }
  | {
      kind: "artifact" | "reference";
      agentKey: string;
      chatId: string;
      resourceId: string;
      relativePath: string;
    };

export interface DocumentCommitRequest {
  operation: "document.commit";
  source: DocumentCommitSource;
  mode: "overwrite" | "new-artifact";
  expectedRevision: string;
  payload: {
    kind: import("@/shared/types/document").DocumentContentKind;
    mimeType: string;
    encoding?: "utf-8";
    text?: string;
    dataBase64?: string;
  };
}

export interface DocumentCommitResponse {
  sourceKind: "workspace-file" | "artifact";
  agentKey: string;
  path?: string;
  chatId?: string;
  artifactId?: string;
  resourceId?: string;
  relativePath?: string;
  revision: string;
  documentKind: import("@/shared/types/document").DocumentContentKind;
  mimeType?: string;
}

export interface ProjectTreeEntry {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink";
  targetKind?: "directory" | "file";
  accessible: boolean;
  sizeBytes?: number;
  modifiedUnixMs?: number;
}

export interface ProjectTreeRequest {
  [key: string]: unknown;
  agentKey: string;
  path?: string;
  cursor?: string;
  limit?: number;
}

export interface ProjectTreeResponse {
  agentKey: string;
  mode: "CODER" | "KBASE";
  workspaceName: string;
  path: string;
  revision: string;
  entries: ProjectTreeEntry[];
  nextCursor?: string;
}

export interface ProjectHistoryVersion {
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
}

export interface ProjectChangeItem {
  runId: string;
  path: string;
  changeType: "added" | "modified" | "deleted";
  updatedAt?: number;
  original: ProjectHistoryVersion;
  current: ProjectHistoryVersion;
}

export interface ProjectChangeRun {
  runId: string;
  updatedAt?: number;
  fileCount: number;
}

export interface ProjectChangesRequest {
  [key: string]: unknown;
  agentKey: string;
  chatId: string;
  runId?: string;
  cursor?: string;
  limit?: number;
}

export interface ProjectChangesResponse {
  agentKey: string;
  chatId: string;
  revision: string;
  runs: ProjectChangeRun[];
  items: ProjectChangeItem[];
  nextCursor?: string;
}

export interface ProjectDiffVersion {
  exists: boolean;
  content?: string;
  encoding?: string;
  sha256?: string;
  sizeBytes?: number;
}

export interface ProjectDiffRequest {
  [key: string]: unknown;
  agentKey: string;
  chatId: string;
  runId: string;
  path: string;
  encoding?: string;
}

export interface ProjectDiffResponse {
  agentKey: string;
  chatId: string;
  runId: string;
  path: string;
  changeType: "added" | "modified" | "deleted";
  original: ProjectDiffVersion;
  current: ProjectDiffVersion;
}
