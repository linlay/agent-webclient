import type {
  AdminRegistryListDiagnostic,
  AdminRegistryDiagnostic,
  AgentSource,
} from "@/shared/data/api/dto/admin";

export type AdminSkillStatus = "ready" | "invalid" | "disabled";

export interface AdminSkillSummary {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  meta?: Record<string, unknown>;
  version?: string;
  status: AdminSkillStatus;
  diagnostic?: AdminRegistryListDiagnostic;
  diagnosticCount?: number;
  updatedAt?: number;
  size?: number;
  usedByAgents?: string[];
  source?: AgentSource;
}

export interface AdminSkillCapabilities {
  maxTextBytes: number;
  maxUploadBytes: number;
  canCreate: boolean;
  canRename: boolean;
  canDelete: boolean;
  canUpload: boolean;
  canDownload: boolean;
}

export type AdminSkillContentKind = "text" | "binary" | "directory";

export type AdminSkillFileRole = "skillMd" | "readme" | "reference" | "script" | "asset" | "other";

export interface AdminSkillFileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  parentPath: string;
  depth: number;
  order: number;
  size?: number;
  updatedAt?: number;
  mimeType?: string;
  sha256?: string;
  contentKind: AdminSkillContentKind;
  language?: string;
  role?: AdminSkillFileRole;
  editable: boolean;
  downloadable: boolean;
  uploadable: boolean;
  renamable: boolean;
  deletable: boolean;
}

export interface AdminSkillFileCounts {
  files: number;
  directories: number;
  textFiles: number;
  binaryFiles: number;
  totalSize: number;
}

export interface AdminSkillFileManifest {
  revision: string;
  defaultOpenPath?: string;
  counts: AdminSkillFileCounts;
  entries: AdminSkillFileEntry[];
}

export interface AdminSkillTextFile {
  key: string;
  path: string;
  content: string;
  encoding: "utf-8" | string;
  sha256: string;
  size: number;
  updatedAt?: number;
  editable: boolean;
}

export interface AdminSkillDetailResponse {
  skill: AdminSkillSummary;
  capabilities: AdminSkillCapabilities;
  fileManifest: AdminSkillFileManifest;
  diagnostics?: AdminRegistryDiagnostic[];
  openedFile?: AdminSkillTextFile;
}

export interface AdminSkillCreateFileRequest {
  key: string;
  path: string;
  content?: string;
  encoding?: string;
}

export interface AdminSkillMkdirRequest {
  key: string;
  path: string;
}

export interface AdminSkillRenameRequest {
  key: string;
  fromPath: string;
  toPath: string;
  overwrite?: boolean;
}

export interface AdminSkillDeleteFileRequest {
  key: string;
  path: string;
  recursive?: boolean;
  baseSha256?: string;
}

export interface AdminSkillMutationResponse {
  key: string;
  action: "create" | "save" | "mkdir" | "rename" | "delete" | "upload";
  selectedPath?: string;
  entry?: AdminSkillFileEntry;
  openedFile?: AdminSkillTextFile;
  fileManifest?: AdminSkillFileManifest;
  skill?: AdminSkillSummary;
  diagnostics?: AdminRegistryDiagnostic[];
  reloaded: boolean;
}

export interface AdminSkillValidateResponse {
  key: string;
  status: AdminSkillStatus;
  diagnostics?: AdminRegistryDiagnostic[];
  updatedAt?: number;
  size?: number;
}

export interface AdminSkillCreateRequest {
  key: string;
  skillMd: string;
  files?: Array<{ path: string; content: string; encoding?: string }>;
}

export interface AdminSkillDeleteResponse {
  key: string;
  deleted: boolean;
  usedByAgents?: string[];
}
