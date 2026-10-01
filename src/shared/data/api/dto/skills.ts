import type {
  AdminRegistryListDiagnostic,
  AdminRegistryDiagnostic,
  AgentSource,
} from "@/shared/data/api/dto/admin";

export type AdminSkillStatus = "ready" | "invalid" | "disabled";

export interface UpdateAgentSkillPinRequest {
  id: string;
  pinned: boolean;
}

export interface AdminSkillSummary {
  id: string;
  displayName?: string;
  /** Legacy servers only. */
  name?: string;
  revision?: string;
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
  packageId?: string;
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
  id: string;
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

export interface AdminSkillPackageSummary {
  icon?: string;
  status?: "ready" | "incomplete";
  missingSkillIds?: string[];
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  meta?: Record<string, unknown>;
  version?: string;
  sha256?: string;
  /** Members follow package.json declarations; id is the full package/skill ID. */
  skills: Array<{ id: string; name?: string; displayName?: string; description?: string; version?: string }>;
  installedAt?: number;
}

export type AdminSkillImportResponse =
  | (AdminSkillDetailResponse & { kind?: "skill" })
  | { kind: "skill-package"; package: AdminSkillPackageSummary };

export interface AdminSkillCreateFileRequest {
  id: string;
  path: string;
  content?: string;
  encoding?: string;
}

export interface AdminSkillMkdirRequest {
  id: string;
  path: string;
}

export interface AdminSkillRenameRequest {
  id: string;
  fromPath: string;
  toPath: string;
  overwrite?: boolean;
}

export interface AdminSkillDeleteFileRequest {
  id: string;
  path: string;
  recursive?: boolean;
  baseSha256?: string;
}

export interface AdminSkillMutationResponse {
  id: string;
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
  id: string;
  status: AdminSkillStatus;
  diagnostics?: AdminRegistryDiagnostic[];
  updatedAt?: number;
  size?: number;
}

export interface AdminSkillCreateRequest {
  id: string;
  skillMd: string;
  files?: Array<{ path: string; content: string; encoding?: string }>;
}

export interface AdminSkillDeleteResponse {
  id: string;
  deleted: boolean;
  usedByAgents?: string[];
}
