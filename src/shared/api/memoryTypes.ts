export interface MemoryRecordListItem {
  id: string;
  requestId?: string;
  chatId?: string;
  agentKey?: string;
  subjectKey?: string;
  kind?: string;
  refId?: string;
  scopeType?: string;
  scopeKey?: string;
  title?: string;
  summary: string;
  sourceType?: string;
  category?: string;
  importance?: number;
  confidence?: number;
  status?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  accessCount?: number;
  lastAccessedAt?: number | null;
}

export interface MemoryRecordEmbedding {
  hasEmbedding: boolean;
  model?: string;
}

export interface MemoryRecordDetail {
  id: string;
  sourceTable: string;
  record: MemoryRecordListItem;
  rawFields?: Record<string, unknown>;
  embedding: MemoryRecordEmbedding;
}

export interface MemoryInfoFilters {
  keyword: string;
  kind: string;
  scopeType: string;
  status: string;
  category: string;
  limit: number;
}

export type MemoryConsoleTab = "preferences" | "records";
export type MemoryPreferenceMode = "records" | "markdown";
export type MemoryPreferenceScopeType = "user" | "agent" | "team" | "global";

export interface MemoryScopeSummary {
  scopeType: string;
  scopeKey: string;
  label: string;
  fileName: string;
  recordCount: number;
  updatedAt: number;
}

export interface MemoryScopesResponse {
  agentKey: string;
  scopes: MemoryScopeSummary[];
}

export interface MemoryScopeRecord {
  id: string;
  title: string;
  summary: string;
  category: string;
  importance: number;
  confidence: number;
  status: string;
  scopeType: string;
  scopeKey: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MemoryScopeDetailMeta {
  editable: boolean;
  recordCount: number;
  generatedFromStore: boolean;
}

export interface MemoryScopeDetail {
  agentKey: string;
  scopeType: string;
  scopeKey: string;
  label: string;
  fileName: string;
  markdown: string;
  records: MemoryScopeRecord[];
  meta: MemoryScopeDetailMeta;
}

export interface MemoryScopeRecordInput {
  id?: string;
  title: string;
  summary: string;
  category: string;
  importance: number;
  confidence: number;
  tags?: string[];
}

export interface MemoryScopeDraftRecord extends MemoryScopeRecordInput {
  clientId: string;
  status?: string;
  scopeType?: string;
  scopeKey?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface MemoryScopeSavePayload {
  agentKey: string;
  scopeType: string;
  scopeKey?: string;
  mode: MemoryPreferenceMode;
  markdown?: string;
  records?: MemoryScopeRecordInput[];
  archiveMissing?: boolean;
}

export interface MemoryScopeSaveSummary {
  created: number;
  updated: number;
  archived: number;
  unchanged: number;
}

export interface MemoryScopeSaveRecord {
  id: string;
  title: string;
  status: string;
  scopeType: string;
  scopeKey: string;
  updatedAt: number;
}

export interface MemoryScopeSaveResult {
  saved: boolean;
  agentKey: string;
  scopeType: string;
  scopeKey: string;
  summary: MemoryScopeSaveSummary;
  records: MemoryScopeSaveRecord[];
  markdown: string;
}

export interface MemoryScopeValidationIssue {
  line: number;
  field: string;
  message: string;
}

export interface MemoryScopeValidationResult {
  valid: boolean;
  errors?: MemoryScopeValidationIssue[];
  warnings?: MemoryScopeValidationIssue[];
}

export interface MemoryRecordsPayload {
  count: number;
  nextCursor?: string;
  results: MemoryRecordListItem[];
}

export function createDefaultMemoryInfoFilters(): MemoryInfoFilters {
  return {
    keyword: "",
    kind: "",
    scopeType: "",
    status: "",
    category: "",
    limit: 1000,
  };
}

export function createDefaultMemoryConsoleTab(): MemoryConsoleTab {
  return "preferences";
}

export function createDefaultMemoryPreferenceMode(): MemoryPreferenceMode {
  return "records";
}

export function createEmptyMemoryScopeValidationResult(): MemoryScopeValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}
