import type {
  AIAwaitSubmitParamData,
  VoiceCapabilities,
} from '@/app/state/types';
import {
  getAppAccessToken,
  refreshAppAccessToken,
  type AppAccessTokenRefreshReason,
} from '@/shared/data/auth/appAuth';
import { readStoredAccessToken } from '@/shared/data/auth/accessTokenStorage';
import {
  handleFinalUnauthorized,
  type AuthFailureSource,
} from '@/shared/data/auth/authCoordinator';
import { getGatewaySession } from '@/shared/data/auth/gatewaySession';
import { isGatewayBackendMode } from '@/shared/config/backendMode';
import type {
  MemoryScopeDetail,
  MemoryContextPreviewResponse,
  MemoryMeta,
  MemoryScopeSavePayload,
  MemoryScopeSaveResult,
  MemoryScopesResponse,
  MemoryScopeValidationResult,
  MemoryRecordDetail,
  MemoryRecordsPayload,
} from '@/shared/data/memory/memoryTypes';
import { t } from '@/shared/i18n';
import { runOwnerPayload, type RunOwner } from '@/shared/data/runOwner';
import { createCompactId } from '@/shared/utils/compactId';
import { isAppMode } from '@/shared/utils/routing';
import { getClientDeviceId } from "@/shared/data/clientDeviceId";
import { getClientSurfaceId } from "@/shared/data/clientSurfaceId";
import {
  formatPlatformErrorForDisplay,
  type PlatformError,
} from "@/shared/data/errors/platformError";
import {
  buildAttachPayload,
  buildBTWPayload,
  buildQueryPayload,
  compactQueryModelOverride,
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  resolveEndpointPayload,
  type EndpointDefinition,
} from "@/shared/data/api/endpointRegistry";

const NativeURL = globalThis.URL;

export class ApiError extends Error {
  name = "ApiError";
  status: number | null;
  code: number | string | null;
  data: unknown;
  platformError: PlatformError | null;

  constructor(
    message: string,
    details: {
      status?: number | null;
      code?: number | string | null;
      data?: unknown;
      platformError?: PlatformError | null;
    } = {},
  ) {
    super(message);
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.data = details.data ?? null;
    this.platformError = details.platformError ?? null;
  }
}

export interface ApiResponse<T = unknown> {
  status: number;
  code: number;
  msg: string;
  data: T;
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

export interface GetAgentsOptions {
  includeChats?: number;
  includeTeam?: boolean;
  scope?: "nav" | "copilot" | "invoke" | "internal" | "all";
  mode?: string | string[];
}

export interface AgentOrderResponse {
  version: number;
  order: string[];
  updatedAt: number;
}

export interface UpdateAgentOrderRequest {
  order: string[];
}

export interface GetChatsOptions {
  agentKey?: string;
  mode?: string;
}

export interface AutomationListRequest {
  tag?: string;
}

export interface AutomationListResponse {
  items: AutomationSummaryResponse[];
  total: number;
}

export interface AutomationExecutionListResponse {
  items: AutomationExecutionResponse[];
  total: number;
}

export interface AutomationSummaryResponse {
  id: string;
  name: string;
  description: string;
  cron: string;
  agentKey: string;
  enabled: boolean;
  teamId?: string;
  zoneId?: string;
  sourceFile?: string;
  remainingRuns?: number;
  nextFireAt?: number;
  nextFireTime?: string;
  lastExecution?: AutomationExecutionBrief;
}

export interface AutomationDetailResponse extends AutomationSummaryResponse {
  query: AutomationQueryResponse;
}

export interface AutomationQueryResponse {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface AutomationExecutionBrief {
  id: string;
  status: string;
  startedAt: number;
  startedTime?: string;
  completedAt?: number;
  completedTime?: string;
  durationMs?: number;
  error?: string;
}

export interface AutomationExecutionResponse {
  id: string;
  automationId: string;
  automationName: string;
  sourceFile: string;
  agentKey: string;
  teamId: string;
  status: string;
  error: string;
  startedAt: number;
  startedTime?: string;
  completedAt?: number;
  completedTime?: string;
  durationMs?: number;
}

export interface AutomationQueryRequest {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface CreateAutomationRequest {
  name: string;
  description: string;
  cron: string;
  agentKey: string;
  enabled?: boolean;
  teamId?: string;
  zoneId?: string;
  remainingRuns?: number;
  query: AutomationQueryRequest;
}

export interface UpdateAutomationRequest {
  id: string;
  name?: string;
  description?: string;
  cron?: string;
  agentKey?: string;
  teamId?: string;
  zoneId?: string;
  enabled?: boolean;
  remainingRuns?: number;
  query?: AutomationQueryRequest;
}

export interface ToggleAutomationRequest {
  id: string;
  enabled: boolean;
}

export interface DeleteAutomationRequest {
  id: string;
}

export interface AutomationExecutionsRequest {
  id: string;
  limit?: number;
  offset?: number;
}

export type AdminRegistryCategory =
  | "providers"
  | "models"
  | "mcp-servers"
  | "viewport-servers";

export type RegistryConsoleTab = Exclude<AdminRegistryCategory, "mcp-servers"> | "tools";

export type AdminRegistryStatus = "ready" | "invalid" | "disabled";

export type AdminToolSourceCategory = "platform" | "external" | "mcp" | (string & {});

export interface AdminToolSummary {
  key: string;
  name: string;
  label?: string;
  description?: string;
  kind: string;
  sourceType: string;
  sourceCategory: AdminToolSourceCategory;
  serverKey?: string;
}

export interface AdminServiceSummary {
  id: string;
  name: string;
  status: string;
}

export interface AdminRegistryDiagnostic {
  severity: string;
  code: string;
  message: string;
  sourcePath?: string;
}

export interface AdminRegistryListDiagnostic {
  severity: string;
  code: string;
  message: string;
}

interface AdminRegistryBase {
  category: AdminRegistryCategory;
  file: string;
  key?: string;
  name?: string;
  status: AdminRegistryStatus;
  summary?: Record<string, unknown>;
  updatedAt?: number;
}

export interface AdminRegistryListItem extends AdminRegistryBase {
  diagnostic?: AdminRegistryListDiagnostic;
  diagnosticCount?: number;
}

export interface AdminRegistrySummary extends AdminRegistryBase {
  diagnostics?: AdminRegistryDiagnostic[];
  source?: AgentSource;
  size?: number;
}

export interface AdminRegistryListResponse {
  items: AdminRegistryListItem[];
  total: number;
}

export interface AdminRegistryDetailResponse extends AdminRegistrySummary {
  content: string;
  parsed?: Record<string, unknown>;
  encoding?: string;
  sha256?: string;
}

export interface AdminRegistryDetailRequest {
  category: AdminRegistryCategory;
  file: string;
  content: string;
}

export interface AdminRegistryValidateRequest {
  category: AdminRegistryCategory;
  file?: string;
  content: string;
}

export interface AdminRegistryValidateResponse {
  status: AdminRegistryStatus;
  diagnostics?: AdminRegistryDiagnostic[];
  summary?: Record<string, unknown>;
  parsed?: Record<string, unknown>;
}

/* ---- Skill types ---- */

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

export interface AdminSkillSaveFileRequest {
  key: string;
  path: string;
  content: string;
  encoding?: string;
  baseSha256?: string;
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

/* ---- End Skill types ---- */

export interface AgentSource {
  kind: string;
  path?: string;
  agentDir?: string;
}

export interface AgentDetailResponse {
  key: string;
  name: string;
  type?: "agent" | "coder";
  workspaceDir?: string;
  workspaceName?: string;
  icon?: unknown;
  description?: string;
  role?: string;
  greetings?: string[];
  wonders?: string[];
  model: string;
  mode: string;
  tools: string[];
  skills: string[];
  controls: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  modelConfig?: Record<string, unknown>;
  modelOptions?: CoderModelOptionsResponse;
  definition?: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
  source?: AgentSource;
}

export interface AgentSkill {
  key: string;
  name: string;
  description?: string;
  agentHasSkill: boolean;
}

export interface AgentSkillsResponse {
  agentKey: string;
  skills: AgentSkill[];
}

export interface AdminAgentDiagnostic {
  severity: string;
  code: string;
  message: string;
  sourcePath?: string;
}

export interface AdminAgentSummary {
  key: string;
  name: string;
  type?: "agent" | "coder";
  workspaceDir?: string;
  workspaceName?: string;
  icon?: unknown;
  description?: string;
  role?: string;
  model?: string;
  mode?: string;
  tools?: string[];
  skills?: string[];
  controls?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  status: "ready" | "invalid" | string;
  diagnostics?: AdminAgentDiagnostic[];
  source?: AgentSource;
  [key: string]: unknown;
}

export interface AdminAgentDetailResponse extends Omit<AgentDetailResponse, "model" | "mode" | "tools" | "skills" | "controls" | "meta"> {
  model?: string;
  mode?: string;
  tools?: string[];
  skills?: string[];
  controls?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  status: "ready" | "invalid" | string;
  diagnostics?: AdminAgentDiagnostic[];
  privateSkills?: AdminAgentPrivateSkill[];
}

export interface AdminAgentPrivateSkill {
  key: string;
  name: string;
  description?: string;
  status: AdminSkillStatus;
  diagnostics?: AdminAgentDiagnostic[];
  enabled: boolean;
  overridesCenter: boolean;
}

export type AdminSourceType = "agent" | "skill" | "automation" | "registry";

export type AdminSourceTarget =
  | {
      type: "agent" | "automation";
      key: string;
      path?: never;
      category?: never;
      file?: never;
    }
  | {
      type: "skill";
      key: string;
      path: string;
      category?: never;
      file?: never;
    }
  | {
      type: "registry";
      key?: never;
      path?: never;
      category: AdminRegistryCategory;
      file: string;
    };

export interface AdminSourceResponse {
  target: AdminSourceTarget;
  source: AgentSource;
  content: string;
  encoding: "utf-8" | string;
  sha256: string;
  size: number;
  updatedAt?: number;
}

export interface UpdateAdminSourceRequest {
  target: AdminSourceTarget;
  content: string;
  baseSha256?: string;
}

export interface DeleteAdminSourceRequest {
  target: AdminSourceTarget;
  baseSha256?: string;
}

export interface DeleteAdminSourceResponse {
  target: AdminSourceTarget;
  deleted: boolean;
}

export interface CreateAgentRequest {
  key?: string;
  definition: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
}

export interface UpdateAgentRequest {
  key: string;
  definition: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
}

export interface UpdateAgentNameRequest {
  key?: string;
  agentKey?: string;
  name: string;
}

export interface UpdateAgentModelConfigRequest {
  key?: string;
  agentKey?: string;
  modelKey: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
}

export interface AgentModelConfigResponse {
  key: string;
  modelConfig: Record<string, unknown>;
}

export interface DeleteAgentRequest {
  key: string;
}

export interface DeleteAgentResponse {
  key: string;
  deleted: boolean;
}

export type AgentDirectoryType = "workspace" | "config";

export interface OpenAgentDirectoryRequest {
  agentKey: string;
  directoryType: AgentDirectoryType;
}

export interface OpenAgentDirectoryResponse {
  agentKey: string;
  directoryType: AgentDirectoryType;
  directoryPath: string;
  opened: boolean;
}

export interface AgentEditorOption {
  key: string;
  label: string;
}

export interface AgentEditorModelOption {
  key: string;
  name?: string;
  icon?: string;
  provider?: string;
  modelId?: string;
  protocol?: string;
  isVision: boolean;
  contextWindow?: number;
  reasoningEfforts?: string[];
  serviceTiers?: string[];
}

export interface CoderModelOption extends AgentEditorModelOption {
  isReasoner: boolean;
}

export interface ReasoningEffortOption {
  key: QueryReasoningEffort;
  label: string;
}

export type QueryServiceTier = string;

export interface ServiceTierOption {
  key: QueryServiceTier;
  label: string;
}

export interface CoderModelOptionsResponse {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers?: ServiceTierOption[];
  defaultModelKey?: string;
  defaultReasoningEffort: QueryReasoningEffort;
  defaultServiceTier?: QueryServiceTier;
}

export interface AgentEditorProxyConfigField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

export interface AgentEditorProxyConfigSchema {
  fields: AgentEditorProxyConfigField[];
  defaultTimeoutMs: number;
}

export interface AgentEditorOptionsResponse {
  models: AgentEditorModelOption[];
  contextTags: AgentEditorOption[];
  visibilityScopes?: AgentEditorOption[];
  modes: AgentEditorOption[];
  proxyConfigSchema: AgentEditorProxyConfigSchema;
}

export interface ArchiveChatsRequest {
  chatIds: string[];
}

export interface DeriveChatRequest {
  sourceChatId: string;
  sourceRunId?: string;
  chatId?: string;
  chatName?: string;
}

export interface DeriveChatResponse {
  chatId: string;
  chatName: string;
  agentKey: string;
  teamId: string;
  sourceChatId: string;
  sourceRunId: string;
  lastRunId: string;
  copiedRuns: number;
  createdAt: number;
  updatedAt: number;
}

export interface RenameChatRequest {
  chatId: string;
  chatName: string;
}

export interface RenameChatResponse {
  chatId: string;
  chatName: string;
  updated: boolean;
}

export interface ArchiveChatResult {
  chatId: string;
  success: boolean;
  error?: string;
}

export interface ArchiveChatsResponse {
  results: ArchiveChatResult[];
}

export interface ArchivesRequest {
  agentKey?: string;
  limit?: number;
  offset?: number;
}

export interface ArchivedSummaryResponse {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number;
  archivedAt: number;
  lastRunId?: string;
  lastRunContent?: string;
  snippet?: string;
  hasAttachments?: boolean;
  usage?: ChatUsageData;
}

export interface ArchivesResponse {
  total: number;
  items: ArchivedSummaryResponse[];
}

export interface ArchiveSearchParams {
  query: string;
  agentKey?: string;
  limit?: number;
}

export interface ArchiveSearchResult {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  createdAt: number;
  updatedAt?: number;
  lastRunAt: number;
  lastRunId?: string;
  lastRunContent?: string;
  archivedAt: number;
  snippet: string;
  score: number;
  usage?: ChatUsageData;
}

export interface ArchiveSearchResponse {
  query: string;
  count: number;
  results: ArchiveSearchResult[];
}

export interface ArchiveDetailResponse {
  chatId: string;
  chatName?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunAt?: number;
  archivedAt?: number;
  events?: unknown[];
  rawMessages?: unknown[];
  runs?: unknown[];
  plan?: unknown;
  artifact?: unknown;
  usage?: ChatUsageData;
  resourceTicket?: string;
}

export interface ChatUsageTokenDetails {
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
}

export interface ChatUsageEstimatedCost {
  currency?: string;
  inputCacheHit?: number;
  inputCacheMiss?: number;
  output?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ChatUsageTiming {
  firstTokenLatencyMs?: number;
  firstTokenLatencyTotalMs?: number;
  firstTokenLatencyCount?: number;
  generationDurationMs?: number;
}

export interface ChatUsageData {
  modelKey?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: ChatUsageTokenDetails;
  completionTokensDetails?: ChatUsageTokenDetails;
  estimatedCost?: ChatUsageEstimatedCost;
  timing?: ChatUsageTiming;
  llmChatCompletionCount?: number;
  toolCallCount?: number;
  current?: ChatUsageData;
  run?: ChatUsageData;
  lastRun?: ChatUsageData;
  chat?: ChatUsageData;
}

export interface ArchiveDeleteResponse {
  chatId: string;
  deleted: boolean;
}

export interface ActiveRunInfo {
  runId?: string;
  agentKey?: string;
  teamId?: string;
  lastSeq?: number | string;
  planningMode?: boolean;
  editingMode?: boolean;
  [key: string]: unknown;
}

export interface ChatSummaryResponse {
  chatId: string;
  chatName?: string;
  agentKey?: string;
  teamId?: string;
  source?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunId?: string;
  lastRunContent?: string;
  read?: {
    isRead?: boolean;
    readAt?: number;
    readRunId?: string;
  };
  activeRun?: ActiveRunInfo | null;
  hasActiveRun?: boolean;
  awaiting?: Record<string, unknown> | null;
  hasPendingAwaiting?: boolean;
  usage?: ChatUsageData;
}

export interface ChatDetailResponse extends ChatSummaryResponse {
  firstAgentKey?: string;
  firstAgentName?: string;
  activeRun?: ActiveRunInfo | null;
  awaiting?: Record<string, unknown> | null;
  events?: unknown[];
  runs?: unknown[];
  plan?: unknown;
  artifact?: unknown;
  usage?: ChatUsageData;
  resourceTicket?: string;
	[key: string]: unknown;
}

export interface ChatSystemPromptRequest {
  chatId: string;
  runId: string;
  agentKey: string;
}

export interface ChatSystemPromptResponse {
  chatId: string;
  runId: string;
  agentKey: string;
  systemRef: {
    agentKey: string;
    cacheKey: string;
    fingerprint: string;
  };
  systemMessage: Record<string, unknown>;
}

export interface ArchiveRestoreResult {
  chatId: string;
  success: boolean;
  error?: string;
  summary?: ChatSummaryResponse;
}

export interface ArchiveRestoreResponse {
  results: ArchiveRestoreResult[];
}

let authToken = "";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalizedName = name.toLowerCase();
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === normalizedName,
  );
}

function isApiResponseShape(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && "code" in value;
}

function isVoiceCapabilitiesShape(value: unknown): value is VoiceCapabilities {
  return (
    isObjectRecord(value) &&
    ("websocketPath" in value || "asr" in value || "tts" in value)
  );
}

function isVoiceVoicesPayloadShape(
  value: unknown,
): value is { voices?: unknown[]; defaultVoice?: unknown } {
  return (
    isObjectRecord(value) && ("voices" in value || "defaultVoice" in value)
  );
}

type QueryParamScalar = string | number | boolean | undefined | null;
type QueryParamValue = QueryParamScalar | QueryParamScalar[];

function toQueryString(
  params: Record<string, QueryParamValue> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") search.append(key, String(item));
      });
      continue;
    }
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

function toQueryParamsRecord(value: unknown): Record<string, QueryParamValue> {
  if (!isObjectRecord(value) || Array.isArray(value)) {
    return {};
  }

  const params: Record<string, QueryParamValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item == null ||
      (Array.isArray(item) && item.every((entry) =>
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry == null,
      ))
    ) {
      params[key] = item;
    }
  }
  return params;
}

function endpointQuery<TInput>(
  endpoint: EndpointDefinition<TInput, unknown>,
  input: TInput,
): string {
  return toQueryString(toQueryParamsRecord(resolveEndpointPayload(endpoint, input)));
}

function buildAuthHeaders(
  headers: Record<string, string> = {},
  options: {
    includeJsonContentType?: boolean;
    method?: string;
    sameOrigin?: boolean;
  } = {},
): Record<string, string> {
  const includeJsonContentType = options.includeJsonContentType ?? true;
  const merged: Record<string, string> = {
    ...headers,
  };
  if (includeJsonContentType && !hasHeader(merged, "Content-Type")) {
    merged["Content-Type"] = "application/json";
  }
  if (isGatewayBackendMode()) {
    for (const key of Object.keys(merged)) {
      if (key.toLowerCase() === "authorization" || key.toLowerCase() === "x-csrf-token") {
        delete merged[key];
      }
    }
    const method = String(options.method || "GET").trim().toUpperCase();
    if (options.sameOrigin !== false && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrfToken = getGatewaySession()?.csrfToken || "";
      if (csrfToken) {
        merged["X-CSRF-Token"] = csrfToken;
      }
    }
    return merged;
  }
  const token = getCurrentAccessToken();
  if (token) {
    merged.Authorization = `Bearer ${token}`;
  } else if ("Authorization" in merged) {
    delete merged.Authorization;
  }
  return merged;
}

export function setAccessToken(token = ""): void {
  authToken = String(token || "").trim();
}

export function getCurrentAccessToken(): string {
  if (isGatewayBackendMode()) {
    return "";
  }
  if (!isAppMode()) {
    if (!authToken) {
      authToken = readStoredAccessToken();
    }
    return authToken;
  }

  authToken = String(getAppAccessToken() || '').trim();
  return authToken;
}

export async function ensureAccessToken(
  reason: AppAccessTokenRefreshReason = 'missing',
): Promise<string> {
  if (isGatewayBackendMode()) {
    setAccessToken("");
    return "";
  }
  if (!isAppMode()) {
    return getCurrentAccessToken();
  }

  const token =
    reason === 'unauthorized'
      ? await refreshAppAccessToken('unauthorized')
      : getAppAccessToken() ?? await refreshAppAccessToken('missing');

  setAccessToken(token || '');
  return getCurrentAccessToken();
}

export function normalizeChatSummariesPayload(data: unknown): unknown[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item) => {
    if (!isObjectRecord(item)) {
      return item;
    }

    const hasExplicitActiveRun = Object.prototype.hasOwnProperty.call(
      item,
      'hasActiveRun',
    );
    const hasActiveRunSummary = Object.prototype.hasOwnProperty.call(
      item,
      'activeRun',
    );
    return {
      ...item,
      hasPendingAwaiting: Object.prototype.hasOwnProperty.call(item, 'hasPendingAwaiting')
        ? Boolean(item.hasPendingAwaiting)
        : Boolean(item.awaiting),
      ...(hasExplicitActiveRun || hasActiveRunSummary
        ? {
            hasActiveRun: hasExplicitActiveRun
              ? Boolean(item.hasActiveRun)
              : Boolean(item.activeRun),
          }
        : {}),
    };
  });
}

function createPlatformApiError(input: unknown, options: {
  status?: number | null;
  code?: number | string | null;
  data?: unknown;
  fallbackMessage?: string;
} = {}): ApiError {
  const source = isObjectRecord(input)
    ? {
        ...input,
        ...(options.status != null ? { status: options.status } : {}),
        ...(options.fallbackMessage && !(typeof input.message === "string" && input.message.trim())
          ? { message: options.fallbackMessage }
          : {}),
      }
    : input || {
        status: options.status ?? undefined,
        message: options.fallbackMessage,
      };
  const display = formatPlatformErrorForDisplay(source);
  return new ApiError(display.message, {
    status: display.status ?? options.status ?? null,
    code: display.code || (options.code ?? null),
    data: options.data,
    platformError: display.error,
  });
}

async function readJsonResponse<T = unknown>(
  response: Response,
): Promise<ApiResponse<T>> {
  const rawText = await response.text();
  let json: Record<string, unknown> | null;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    const body = rawText.trim().replace(/\s+/g, " ");
    throw new ApiError(
      response.ok
        ? `Invalid JSON response: ${(error as Error).message}`
        : body || `HTTP ${response.status}`,
      {
        status: response.status,
        data: rawText,
      },
    );
  }

  if (!response.ok) {
    throw createPlatformApiError(json, {
      status: response.status,
      code: json?.code as number | undefined,
      data: json?.data,
      fallbackMessage: `HTTP ${response.status}`,
    });
  }

  if (!isApiResponseShape(json)) {
    throw new ApiError("Response is not ApiResponse shape", {
      status: response.status,
      data: json,
    });
  }

  if (json.code !== 0) {
    throw createPlatformApiError(json, {
      status: response.status,
      code: json.code as number,
      data: json.data,
      fallbackMessage: "API returned non-zero code",
    });
  }

  return {
    status: response.status,
    code: json.code as number,
    msg: json.msg as string,
    data: json.data as T,
  };
}

async function readVoiceCapabilitiesResponse(
  response: Response,
): Promise<VoiceCapabilities | null> {
  const rawText = await response.text();
  let json: unknown;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${(error as Error).message}`, {
      status: response.status,
      data: rawText,
    });
  }

  if (!response.ok) {
    const apiJson = isObjectRecord(json) ? json : null;
    throw createPlatformApiError(apiJson ?? json, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
      fallbackMessage: `HTTP ${response.status}`,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw createPlatformApiError(json, {
        status: response.status,
        code: json.code as number,
        data: json.data,
        fallbackMessage: "API returned non-zero code",
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceCapabilitiesShape(json.data)) {
      throw new ApiError("Response is not VoiceCapabilities shape", {
        status: response.status,
        data: json.data,
      });
    }
    return json.data as VoiceCapabilities;
  }

  if (json == null) {
    return null;
  }

  if (!isVoiceCapabilitiesShape(json)) {
    throw new ApiError("Response is not VoiceCapabilities shape", {
      status: response.status,
      data: json,
    });
  }

  return json;
}

async function readVoiceVoicesResponse(
  response: Response,
): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const rawText = await response.text();
  let json: unknown;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${(error as Error).message}`, {
      status: response.status,
      data: rawText,
    });
  }

  if (!response.ok) {
    const apiJson = isObjectRecord(json) ? json : null;
    throw createPlatformApiError(apiJson ?? json, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
      fallbackMessage: `HTTP ${response.status}`,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw createPlatformApiError(json, {
        status: response.status,
        code: json.code as number,
        data: json.data,
        fallbackMessage: "API returned non-zero code",
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceVoicesPayloadShape(json.data)) {
      throw new ApiError("voice voices response is invalid", {
        status: response.status,
        data: json.data,
      });
    }
    return json.data as { voices?: unknown[]; defaultVoice?: unknown };
  }

  if (json == null) {
    return null;
  }

  if (!isVoiceVoicesPayloadShape(json)) {
    throw new ApiError("voice voices response is invalid", {
      status: response.status,
      data: json,
    });
  }

  return json;
}

async function requestJson<T = unknown>(
  path: string,
  options: RequestInit & {
    headers?: Record<string, string>;
    jsonContentType?: boolean;
  } = {},
): Promise<ApiResponse<T>> {
  const response = await requestWithAuth(path, options);
  return readJsonResponse<T>(response);
}

async function requestWithAuth(
  path: string,
  options: RequestInit & {
    headers?: Record<string, string>;
    jsonContentType?: boolean;
    retryUnauthorized?: boolean;
    authFailureSource?: AuthFailureSource;
    suppressAuthRedirect?: boolean;
    includePlatformAuth?: boolean;
  } = {},
): Promise<Response> {
  const {
    jsonContentType = true,
    retryUnauthorized = true,
    authFailureSource = "json",
    suppressAuthRedirect = false,
    includePlatformAuth = true,
    ...requestOptions
  } = options;

  const gatewayMode = isGatewayBackendMode();
  if (includePlatformAuth && !gatewayMode && isAppMode()) {
    await ensureAccessToken('missing');
  }

  const method = String(requestOptions.method || "GET").toUpperCase();
  const sameOrigin = (() => {
    if (typeof window === "undefined") return path.startsWith("/");
    try {
      return new NativeURL(path, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  })();
  const buildRequestOptions = (): RequestInit => ({
    ...requestOptions,
    method,
    ...(sameOrigin ? { credentials: "same-origin" as RequestCredentials } : {}),
    headers: includePlatformAuth
      ? buildAuthHeaders(requestOptions.headers || {}, {
          includeJsonContentType: jsonContentType,
          method,
          sameOrigin,
        })
      : requestOptions.headers || {},
  });

  let response = await fetch(path, buildRequestOptions());

  if (includePlatformAuth && retryUnauthorized && !gatewayMode && isAppMode() && response.status === 401) {
    const refreshedToken = await ensureAccessToken('unauthorized');
    if (refreshedToken) {
      response = await fetch(path, buildRequestOptions());
    }
  }

  if (includePlatformAuth && gatewayMode && !suppressAuthRedirect && response.status === 401) {
    handleFinalUnauthorized(authFailureSource);
  }

  return response;
}

export function createRequestId(prefix = "req"): string {
  return createCompactId(prefix);
}

export function buildResourceUrl(file: string, chatId = ""): string {
	const normalized = String(file || "").trim();
	const search = new URLSearchParams();
	search.set("file", normalized);
	if (chatId) {
		search.set("chatId", chatId);
	}
	return `${dataEndpoints.resource.path}?${search.toString()}`;
}

export function isLegacyResourceUrl(value: string): boolean {
	const normalized = String(value || "").trim();
	if (!normalized) return false;
	try {
		const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
		const parsed = new NativeURL(normalized, origin);
		return parsed.origin === origin
			&& parsed.pathname === dataEndpoints.resource.path;
	} catch {
		return false;
	}
}

function decodeSafeResourceSegment(segment: string): string | null {
	if (!segment) return null;
	try {
		const decoded = decodeURIComponent(segment);
		if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
}

export function isChatScopeResourceRef(value: string, chatId: string): boolean {
	const normalized = String(value || "").trim();
	const expectedChatId = String(chatId || "").trim();
	if (!normalized || !expectedChatId || normalized.startsWith("/") || normalized.includes("\\")) {
		return false;
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("//") || normalized.includes("?") || normalized.includes("#")) {
		return false;
	}
	const segments = normalized.split("/");
	const decodedSegments = segments.map(decodeSafeResourceSegment);
	if (decodedSegments.some((segment) => segment === null)) {
		return false;
	}
	return decodedSegments[0] !== expectedChatId;
}

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

function decodedAbsoluteResourcePath(source: string): string | null {
	try {
		const decoded = decodeURIComponent(source);
		if (
			!decoded.startsWith("/")
			|| decoded.startsWith("//")
			|| decoded.includes("\\")
			|| decoded.includes("\u0000")
			|| source.includes("?")
			|| source.includes("#")
		) {
			return null;
		}
		const segments = decoded.slice(1).split("/");
		if (
			segments.length === 0
			|| segments.some((segment) => !segment || segment === "." || segment === "..")
		) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
}

export function classifyResourceUrl(
	value: string,
	chatId = "",
	options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const source = String(value || "").trim();
	if (isLegacyResourceUrl(source)) {
		return {
			kind: "invalid",
			source,
			fetchUrl: "",
			requiresPlatformAuth: false,
		};
	}
	if (/^https?:\/\//i.test(source)) {
		try {
			const parsed = new NativeURL(source);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				return {
					kind: "external",
					source,
					fetchUrl: source,
					requiresPlatformAuth: false,
				};
			}
		} catch {
			// Fall through to invalid.
		}
	}
	if (/^(?:data|blob):/i.test(source)) {
		return {
			kind: "inline",
			source,
			fetchUrl: source,
			requiresPlatformAuth: false,
		};
	}
	if (source.startsWith("/")) {
		const resourcePath = decodedAbsoluteResourcePath(source);
		if (!options.teamChat && resourcePath && chatId) {
			return {
				kind: "absolute",
				source,
				fetchUrl: buildResourceUrl(resourcePath, chatId),
				resourceKey: resourcePath,
				requiresPlatformAuth: true,
			};
		}
		return {
			kind: "invalid",
			source,
			fetchUrl: "",
			requiresPlatformAuth: false,
		};
	}
	if (isChatScopeResourceRef(source, chatId)) {
		return {
			kind: "chat",
			source,
			fetchUrl: buildResourceUrl(`${chatId}/${source}`),
			resourceKey: source,
			requiresPlatformAuth: true,
		};
	}
	return {
		kind: "invalid",
		source,
		fetchUrl: "",
		requiresPlatformAuth: false,
	};
}

export function resolveResourceFetchUrl(value: string, chatId = ""): string {
	const classified = classifyResourceUrl(value, chatId);
	return classified.fetchUrl;
}

function getResourceRequestTarget(
	value: string,
	chatId: string,
	fallbackMessage: string,
	options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const classified = classifyResourceUrl(value, chatId, options);
	if (classified.kind === "invalid") {
		throw new Error(fallbackMessage);
	}
	return classified;
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

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

function getErrorMessageFromText(
  rawText: string,
  fallbackMessage: string,
  status?: number,
): {
  message: string;
  code?: number | string | null;
  data?: unknown;
  platformError?: PlatformError | null;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    const display = formatPlatformErrorForDisplay({ status, message: fallbackMessage });
    return {
      message: display.message,
      code: display.code || null,
      data: rawText,
      platformError: display.error,
    };
  }

  try {
    const json = JSON.parse(trimmed) as unknown;
    if (isObjectRecord(json)) {
      const display = formatPlatformErrorForDisplay({
        ...json,
        status,
        ...(!(typeof json.message === "string" && json.message.trim())
          ? { message: fallbackMessage }
          : {}),
      });
      return {
        message: display.message,
        code:
          display.code ||
          (typeof json.code === "number" || typeof json.code === "string"
            ? json.code
            : null),
        data: "data" in json ? json.data : json,
        platformError: display.error,
      };
    }
  } catch {
    const display = formatPlatformErrorForDisplay({
      status,
      message: fallbackMessage,
      raw: rawText,
    });
    return {
      message: display.message,
      code: display.code || null,
      data: rawText,
      platformError: display.error,
    };
  }

  const display = formatPlatformErrorForDisplay({ status, message: fallbackMessage });
  return {
    message: display.message,
    code: display.code || null,
    data: rawText,
    platformError: display.error,
  };
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error(t("api.fileDownloadUnsupported"));
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export async function downloadResource(
  path: string,
  options: { filename?: string; signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<void> {
  const target = getResourceRequestTarget(
    path,
    options.chatId || "",
    t("rightSidebar.preview.error.download"),
    { teamChat: options.teamChat },
  );
  const response = await requestWithAuth(target.fetchUrl, {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
    authFailureSource: "download",
    includePlatformAuth: target.requiresPlatformAuth,
  });

  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }

  const blob = await response.blob();
  const filename =
    String(options.filename || "").trim()
    || filenameFromContentDisposition(response.headers?.get("Content-Disposition") ?? null)
    || "download";
  triggerBrowserDownload(blob, filename);
}

export async function getResourceText(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<string> {
  const target = getResourceRequestTarget(
    path,
    options.chatId || "",
    t("rightSidebar.preview.error.loadText"),
    { teamChat: options.teamChat },
  );
  const response = await requestWithAuth(target.fetchUrl, {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
    authFailureSource: "download",
    includePlatformAuth: target.requiresPlatformAuth,
  });

  if (!response.ok) {
    const fallbackMessage = t("api.loadResourceTextFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  return response.text();
}

export async function getResourceBlob(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<Blob> {
  const target = getResourceRequestTarget(
    path,
    options.chatId || "",
    t("rightSidebar.preview.error.loadText"),
    { teamChat: options.teamChat },
  );
  const response = await requestWithAuth(target.fetchUrl, {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
    authFailureSource: "download",
    includePlatformAuth: target.requiresPlatformAuth,
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", { status: response.status });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  return response.blob();
}

export async function getChatRawJsonl(
  chatId: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const query = endpointQuery(dataEndpoints.chatJsonl, { chatId });
  const response = await requestWithAuth(withQuery(dataEndpoints.chatJsonl.path, query), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });

  if (!response.ok) {
    const fallbackMessage = t("api.loadResourceTextFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }

  return response.text();
}

export async function getChatLLMTraceRaw(
  file: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const query = endpointQuery(dataEndpoints.chatLlmTrace, { file });
  const response = await requestWithAuth(withQuery(dataEndpoints.chatLlmTrace.path, query), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });

  if (!response.ok) {
    const fallbackMessage = t("api.loadResourceTextFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }

  return response.text();
}

export function extractUploadReferences(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data.filter((item) => item != null);
  }

  if (isObjectRecord(data) && Array.isArray(data.references)) {
    return data.references.filter((item) => item != null);
  }

  if (isObjectRecord(data) && isObjectRecord(data.upload)) {
    const upload = data.upload;
    const reference = {
      id: typeof upload.id === "string" ? upload.id : undefined,
      type: typeof upload.type === "string" ? upload.type : undefined,
      name: typeof upload.name === "string" ? upload.name : undefined,
      path: typeof upload.path === "string" ? upload.path : undefined,
      mimeType:
        typeof upload.mimeType === "string" ? upload.mimeType : undefined,
      sizeBytes:
        typeof upload.sizeBytes === "number" ? upload.sizeBytes : undefined,
      url: typeof upload.url === "string" ? upload.url : undefined,
      sha256: typeof upload.sha256 === "string" ? upload.sha256 : undefined,
    };
    return [reference];
  }

  return [];
}

export function getAgents(options: GetAgentsOptions = {}): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.agents, options);
  return requestJson(withQuery(dataEndpoints.agents.path, query));
}

export function getAdminAgents(): Promise<ApiResponse<AdminAgentSummary[]>> {
  return requestJson<AdminAgentSummary[]>(dataEndpoints.adminAgents.path);
}

export function getAdminRegistries(): Promise<ApiResponse<AdminRegistryListResponse>> {
  return requestJson<AdminRegistryListResponse>(dataEndpoints.adminRegistries.path);
}

export function getAdminServices(): Promise<ApiResponse<AdminServiceSummary[]>> {
  return requestJson<AdminServiceSummary[]>(dataEndpoints.adminServices.path);
}

export function getAdminRegistryDetail(
  category: AdminRegistryCategory,
  file: string,
): Promise<ApiResponse<AdminRegistryDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminRegistryDetail, { category, file });
  return requestJson<AdminRegistryDetailResponse>(
    withQuery(dataEndpoints.adminRegistryDetail.path, query),
  );
}

export function saveAdminRegistryDetail(
  params: AdminRegistryDetailRequest,
): Promise<ApiResponse<AdminRegistryDetailResponse>> {
  return requestJson<AdminRegistryDetailResponse>(dataEndpoints.adminRegistryDetail.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function validateAdminRegistry(
  params: AdminRegistryValidateRequest,
): Promise<ApiResponse<AdminRegistryValidateResponse>> {
  return postJson<AdminRegistryValidateResponse>(dataEndpoints.adminRegistryValidate.path, params);
}

export function getAgentOrder(): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.agentOrder.path);
}

export function putAgentOrder(
  params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.agentOrderUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params ?? { order: [] }),
  });
}

export function getAdminAgentOrder(): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.adminAgentOrder.path);
}

export function putAdminAgentOrder(
  params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
  return requestJson<AgentOrderResponse>(dataEndpoints.adminAgentOrderUpdate.path, {
    method: "PUT",
    body: JSON.stringify(params ?? { order: [] }),
  });
}

export function getAgent(agentKey: string): Promise<ApiResponse<AgentDetailResponse>> {
  const query = endpointQuery(dataEndpoints.agent, agentKey);
  return requestJson(withQuery(dataEndpoints.agent.path, query));
}

export function getAgentSkills(
  agentKey: string,
): Promise<ApiResponse<AgentSkillsResponse>> {
  const query = endpointQuery(dataEndpoints.agentSkills, agentKey);
  return requestJson<AgentSkillsResponse>(
    withQuery(dataEndpoints.agentSkills.path, query),
  );
}

export function getAgentFile(
  params: AgentFileRequest,
): Promise<ApiResponse<AgentFileResponse>> {
  const query = endpointQuery(dataEndpoints.agentFile, params);
  return requestJson<AgentFileResponse>(
    withQuery(dataEndpoints.agentFile.path, query),
  );
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

export function getAdminAgentDetail(agentKey: string): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminAgentDetail, agentKey);
  return requestJson<AdminAgentDetailResponse>(withQuery(dataEndpoints.adminAgentDetail.path, query));
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

export function createAgent(
  params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentCreate.path, params);
}

export function updateAgent(
  params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentUpdate.path, params);
}

export function updateAgentName(
  params: UpdateAgentNameRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>(dataEndpoints.adminAgentUpdateName.path, params);
}

export function updateAgentModelConfig(
  params: UpdateAgentModelConfigRequest,
): Promise<ApiResponse<AgentModelConfigResponse>> {
  return postJson<AgentModelConfigResponse>(dataEndpoints.agentModelConfig.path, params);
}

export function deleteAgent(
  params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
  return postJson<DeleteAgentResponse>(dataEndpoints.adminAgentDelete.path, params);
}

export function importAdminAgentPrivateSkill(params: {
  agentKey: string;
  file: File;
}): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const form = new FormData();
  form.append("agentKey", params.agentKey);
  form.append("file", params.file);
  return requestJson<AdminAgentDetailResponse>(dataEndpoints.adminAgentPrivateSkillImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function deleteAdminAgentPrivateSkill(params: {
  agentKey: string;
  key: string;
}): Promise<ApiResponse<AdminAgentDetailResponse>> {
  return postJson<AdminAgentDetailResponse>(dataEndpoints.adminAgentPrivateSkillDelete.path, params);
}

export function openAgentDirectory(
  params: OpenAgentDirectoryRequest,
): Promise<ApiResponse<OpenAgentDirectoryResponse>> {
  return postJson<OpenAgentDirectoryResponse>(dataEndpoints.agentOpenDirectory.path, params);
}

export function getAdminAgentEditorOptions(): Promise<ApiResponse<AgentEditorOptionsResponse>> {
  return requestJson<AgentEditorOptionsResponse>(dataEndpoints.adminAgentEditorOptions.path);
}

export function getModelOptions(agentKey?: string): Promise<ApiResponse<CoderModelOptionsResponse>> {
  const query = endpointQuery(dataEndpoints.modelOptions, agentKey);
  return requestJson<CoderModelOptionsResponse>(
    withQuery(dataEndpoints.modelOptions.path, query),
  );
}

export function getTeams(): Promise<ApiResponse> {
  return requestJson(dataEndpoints.teams.path);
}

export function getAdminSkills(): Promise<ApiResponse<AdminSkillSummary[]>> {
  return requestJson<AdminSkillSummary[]>(dataEndpoints.adminSkills.path);
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

export function getAdminSkillFile(
  key: string,
  path: string,
): Promise<ApiResponse<AdminSkillTextFile>> {
  const query = endpointQuery(dataEndpoints.adminSkillFile, { key, path });
  return requestJson<AdminSkillTextFile>(
    withQuery(dataEndpoints.adminSkillFile.path, query),
  );
}

export function saveAdminSkillFile(
  params: AdminSkillSaveFileRequest,
): Promise<ApiResponse<AdminSkillMutationResponse>> {
  return requestJson<AdminSkillMutationResponse>(dataEndpoints.adminSkillSaveFile.path, {
    method: "PUT",
    body: JSON.stringify(params),
  });
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

export function buildAdminSkillFileDownloadUrl(key: string, path: string): string {
  const query = endpointQuery(dataEndpoints.adminSkillFileDownload, { key, path });
  return withQuery(dataEndpoints.adminSkillFileDownload.path, query);
}

export function buildAdminSkillDownloadUrl(key: string): string {
  const query = endpointQuery(dataEndpoints.adminSkillDownload, { key });
  return withQuery(dataEndpoints.adminSkillDownload.path, query);
}

async function readAdminSkillDownload(path: string, fallbackFilename: string, signal?: AbortSignal): Promise<void> {
  const response = await requestWithAuth(path, {
    method: "GET",
    signal,
    jsonContentType: false,
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", { status: response.status });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(response.headers.get("Content-Disposition")) || fallbackFilename;
  triggerBrowserDownload(blob, filename);
}

export async function downloadAdminSkillFile(
  key: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const filename = path.split("/").filter(Boolean).at(-1) || "skill-file";
  return readAdminSkillDownload(buildAdminSkillFileDownloadUrl(key, path), filename, options.signal);
}

export async function downloadAdminSkill(
  key: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  return readAdminSkillDownload(buildAdminSkillDownloadUrl(key), `${key || "skill"}.zip`, options.signal);
}

export async function fetchAdminSkillIcon(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const path = url.trim();
  if (!/^\/api\/admin\/skills\/file\/download(?:[?#]|$)/.test(path)) {
    throw new ApiError("skill icon URL is invalid");
  }
  const response = await requestWithAuth(path, {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", { status: response.status });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new ApiError("skill icon response is not an image", { status: response.status });
  }
  return response.blob();
}

export async function fetchAdminSkillFileBlob(
  key: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await requestWithAuth(buildAdminSkillFileDownloadUrl(key, path), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", { status: response.status });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  return response.blob();
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
  key: string;
  file: File;
}): Promise<ApiResponse<AdminSkillDetailResponse>> {
  const form = new FormData();
  form.append("key", params.key);
  form.append("file", params.file);
  return requestJson<AdminSkillDetailResponse>(dataEndpoints.adminSkillImport.path, {
    method: "POST",
    body: form,
    jsonContentType: false,
  });
}

export function deleteAdminSkill(key: string): Promise<ApiResponse<AdminSkillDeleteResponse>> {
  return postJson<AdminSkillDeleteResponse>(dataEndpoints.adminSkillDelete.path, { key });
}

export function getAdminTools(): Promise<ApiResponse<AdminToolSummary[]>> {
  return requestJson<AdminToolSummary[]>(dataEndpoints.adminTools.path);
}

export function getChats(options: GetChatsOptions = {}): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.chats, options);
  return requestJson(withQuery(dataEndpoints.chats.path, query)).then((response) => ({
    ...response,
    data: normalizeChatSummariesPayload(response.data),
  }));
}

export function getChat(
  chatId: string,
  includeRawMessages = false,
): Promise<ApiResponse<ChatDetailResponse>> {
  const query = endpointQuery(dataEndpoints.chat, { chatId, includeRawMessages });
	return requestJson(withQuery(dataEndpoints.chat.path, query));
}

export function getChatSystemPrompt(
  params: ChatSystemPromptRequest,
): Promise<ApiResponse<ChatSystemPromptResponse>> {
  const query = endpointQuery(dataEndpoints.chatSystemPrompt, params);
  return requestJson<ChatSystemPromptResponse>(
    withQuery(dataEndpoints.chatSystemPrompt.path, query),
  );
}

export function archiveChats(
  params: ArchiveChatsRequest,
): Promise<ApiResponse<ArchiveChatsResponse>> {
  return postJson<ArchiveChatsResponse>(dataEndpoints.chatArchive.path, {
    chatIds: params.chatIds,
  });
}

export function deriveChat(
  params: DeriveChatRequest,
): Promise<ApiResponse<DeriveChatResponse>> {
  return postJson<DeriveChatResponse>(dataEndpoints.chatDerive.path, {
    sourceChatId: params.sourceChatId,
    sourceRunId: params.sourceRunId,
    chatId: params.chatId,
    chatName: params.chatName,
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

export function getViewport(viewportKey: string): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.viewport, viewportKey);
  return requestJson(withQuery(dataEndpoints.viewport.path, query));
}

function postJson<T>(path: string, payload: unknown): Promise<ApiResponse<T>> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function getAutomations(
  params: AutomationListRequest = {},
): Promise<ApiResponse<AutomationListResponse>> {
  return postJson<AutomationListResponse>(dataEndpoints.automations.path, params);
}

export function getAutomation(
  id: string,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automation.path, { id });
}

export function createAutomation(
  params: CreateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationCreate.path, params);
}

export function updateAutomation(
  params: UpdateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationUpdate.path, params);
}

export function deleteAutomation(
  params: DeleteAutomationRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return postJson<{ id: string; deleted: boolean }>(dataEndpoints.automationDelete.path, params);
}

export function toggleAutomation(
  params: ToggleAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationToggle.path, params);
}

export function getAutomationExecutions(
  params: AutomationExecutionsRequest,
): Promise<ApiResponse<AutomationExecutionListResponse>> {
  return postJson<AutomationExecutionListResponse>(dataEndpoints.automationExecutions.path, params);
}

export interface GetMemoryRecordsParams {
  agentKey?: string;
  keyword?: string;
  kind?: string;
  scopeType?: string;
  status?: string;
  category?: string;
  limit?: number;
  cursor?: string;
  chatId?: string;
}

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

export function getVoiceCapabilities(): Promise<ApiResponse> {
  return requestJson(dataEndpoints.voiceCapabilities.path);
}

export async function getVoiceCapabilitiesFlexible(): Promise<VoiceCapabilities | null> {
  const response = await requestWithAuth(dataEndpoints.voiceCapabilities.path);
  return readVoiceCapabilitiesResponse(response);
}

export function getVoiceVoices(): Promise<ApiResponse> {
  return requestJson(dataEndpoints.voiceVoices.path);
}

export async function getVoiceVoicesFlexible(path = dataEndpoints.voiceVoices.path): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const response = await requestWithAuth(path);
  return readVoiceVoicesResponse(response);
}

export function submitTool(params: {
  runId: string;
  owner: RunOwner;
  toolId: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse> {
  return requestJson(dataEndpoints.submit.path, {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      ...runOwnerPayload(params.owner),
      toolId: params.toolId,
      params: params.params,
    }),
  });
}

export function submitAwaiting(params: {
  chatId?: string;
  runId: string;
  owner: RunOwner;
  awaitingId: string;
  submitId?: string;
  params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
  return requestJson(dataEndpoints.submit.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      ...runOwnerPayload(params.owner),
      awaitingId: params.awaitingId,
      submitId: params.submitId,
      params: params.params,
    }),
  });
}

export interface UploadFileParams {
  file: Blob;
  filename?: string;
  requestId?: string;
  chatId?: string;
  sha256?: string;
  signal?: AbortSignal;
}

function getUploadFilename(params: UploadFileParams): string {
  const inferredFileName =
    typeof File !== "undefined" &&
    params.file instanceof File &&
    typeof params.file.name === "string" &&
    params.file.name.trim()
      ? params.file.name.trim()
      : "";

  return params.filename || inferredFileName || "upload.bin";
}

export function extractUploadChatId(data: unknown): string {
  return isObjectRecord(data) && typeof data.chatId === "string"
    ? data.chatId.trim()
    : "";
}

export async function uploadFile(
  params: UploadFileParams,
): Promise<ApiResponse> {
  const filename = getUploadFilename(params);
  const requestId = String(
    params.requestId || createRequestId("upload"),
  ).trim();
  const chatId = String(params.chatId || "").trim();
  const formData = new FormData();
  formData.append("requestId", requestId);
  if (chatId) {
    formData.append("chatId", chatId);
  }
  if (typeof params.sha256 === "string" && params.sha256.trim()) {
    formData.append("sha256", params.sha256.trim());
  }
  formData.append("file", params.file, filename);

  return requestJson(dataEndpoints.upload.path, {
    method: "POST",
    body: formData,
    signal: params.signal,
    jsonContentType: false,
  });
}

export interface QueryLikeParams {
  requestId: string;
  chatId?: string;
  runId?: string;
  steerId?: string;
  owner: RunOwner;
  message: string;
  planningMode?: boolean;
}

export interface BTWInterruptResponse {
  accepted: boolean;
  status: string;
  runId: string;
  detail: string;
}

export type QueryAccessLevel = "default" | "auto_approve" | "full_access";
export type QueryReasoningEffort =
  | "NONE"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "XHIGH"
  | "MAX";

export {
  ACTIVE_QUERY_REASONING_EFFORTS,
  QUERY_REASONING_EFFORTS,
  normalizeQueryReasoningEffort,
} from "@/shared/data/api/reasoningEffort";

export interface AccessLevelUpdateParams {
  requestId: string;
  runId: string;
  owner: RunOwner;
  accessLevel: QueryAccessLevel;
  reason?: string;
}

export interface AccessLevelUpdateResponse {
  accepted: boolean;
  status: string;
  runId: string;
  previousAccessLevel?: QueryAccessLevel | string;
  accessLevel: QueryAccessLevel | string;
  version: number;
  detail: string;
}

export interface QueryModelOverride {
  key?: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
}

export interface BackgroundCommandParams {
  requestId: string;
  chatId: string;
}

export interface CompactChatResponse {
  accepted: boolean;
  status: string;
  requestId?: string;
  chatId: string;
  compactId?: string;
  summarySource?: string;
  boundaryRunId?: string;
  boundarySeq?: number;
  generation?: number;
  keptRunCount?: number;
  compactedRunCount?: number;
  toolDigestCount?: number;
  digestedRunIds?: string[];
  originalMessages?: number;
  projectedMessages?: number;
  preCompactEstimatedTokens?: number;
  postCompactEstimatedTokens?: number;
  compressionRatio?: number;
  compactionUsage?: Record<string, unknown>;
  cacheMetrics?: Record<string, unknown>;
  elapsedMs?: number;
  detail?: string;
}

export interface MarkChatReadParams {
  chatId?: string;
  runId?: string;
  agentKey?: string;
}

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.read.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      agentKey: params.agentKey,
    }),
  });
}

export interface FeedbackParams {
  chatId: string;
  runId: string;
  type: "thumbs_down" | "clear" | string;
  comment?: string;
}

export function submitFeedback(params: FeedbackParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.feedback.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      type: params.type,
      comment: params.comment,
    }),
  });
}

export function deleteChat(params: { chatId: string }): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.chatDelete, params);
  return requestJson(withQuery(dataEndpoints.chatDelete.path, query), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function renameChat(
  params: RenameChatRequest,
): Promise<ApiResponse<RenameChatResponse>> {
  const query = toQueryString({ chatId: params.chatId });
  return requestJson<RenameChatResponse>(withQuery(dataEndpoints.chatRename.path, query), {
    method: "POST",
    body: JSON.stringify({ chatName: params.chatName }),
  });
}

export interface GlobalSearchParams {
  query: string;
  agentKey?: string;
  teamId?: string;
  limit?: number;
}

export interface GlobalSearchResult {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  runId?: string;
  kind: string;
  role?: string;
  timestamp: number;
  snippet: string;
  score: number;
}

export interface GlobalSearchResponse {
  query: string;
  count: number;
  results: GlobalSearchResult[];
}

export function searchGlobal(
  params: GlobalSearchParams,
): Promise<ApiResponse<GlobalSearchResponse>> {
  return requestJson(dataEndpoints.search.path, {
    method: "POST",
    body: JSON.stringify({
      query: params.query,
      agentKey: params.agentKey,
      teamId: params.teamId,
      limit: params.limit,
    }),
  }) as Promise<ApiResponse<GlobalSearchResponse>>;
}

function filenameFromContentDisposition(value: string | null): string {
  const header = String(value || "");
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1] ? plainMatch[1].trim() : "";
}

export async function downloadChatExport(chatId: string): Promise<void> {
  const path = `${dataEndpoints.chatExport.path}?chatId=${encodeURIComponent(chatId)}`;
  const response = await requestWithAuth(path, {
    method: "GET",
    jsonContentType: false,
    authFailureSource: "download",
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get("Content-Disposition"))
    || `${chatId || "chat"}.md`;
  triggerBrowserDownload(blob, filename);
}

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.interrupt.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      runId: params.runId,
      ...runOwnerPayload(params.owner),
      message: params.message,
    }),
  });
}

/**
 * BTW runs always use the HTTP control endpoint, independently of the main
 * conversation transport mode.
 */
export function interruptBTWRun(
  params: QueryLikeParams,
): Promise<ApiResponse<BTWInterruptResponse>> {
  return requestJson<BTWInterruptResponse>(dataEndpoints.interrupt.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      runId: params.runId,
      ...runOwnerPayload(params.owner),
      message: params.message,
    }),
  });
}

export function updateAccessLevel(
  params: AccessLevelUpdateParams,
): Promise<ApiResponse<AccessLevelUpdateResponse>> {
  return requestJson(dataEndpoints.accessLevelUpdate.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      runId: params.runId,
      ...runOwnerPayload(params.owner),
      accessLevel: params.accessLevel,
      reason: params.reason,
    }),
  });
}

export function steerChat(params: QueryLikeParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.steer.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      runId: params.runId,
      steerId: params.steerId,
      ...runOwnerPayload(params.owner),
      message: params.message,
    }),
  });
}

export function rememberChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse> {
  return requestJson(dataEndpoints.remember.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
    }),
  });
}

export function learnChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse> {
  return requestJson(dataEndpoints.learn.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
    }),
  });
}

export function compactChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse<CompactChatResponse>> {
  return requestJson(dataEndpoints.compact.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      trigger: "manual",
    }),
  });
}

export interface QueryStreamParams {
  requestId: string;
  message: string;
  planningMode?: boolean;
  editingMode?: boolean;
  mustUseSkills?: string[];
  agentMode?: string;
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  owner: RunOwner;
  chatId?: string;
  role?: string;
  references?: unknown[];
  params?: Record<string, unknown>;
  scene?: string;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface BTWStreamParams {
  requestId: string;
  runId?: string;
  chatId: string;
  btwId?: string;
  message: string;
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  references?: unknown[];
  params?: Record<string, unknown>;
  scene?: QueryStreamParams["scene"];
  stream?: boolean;
  includeUsage?: boolean;
  includeFullText?: boolean;
  signal?: AbortSignal;
}

export interface AttachStreamParams {
  runId: string;
  owner: RunOwner;
  lastSeq?: number;
  signal?: AbortSignal;
}

export function createQueryStream(
  options: QueryStreamParams,
): Promise<Response> {
  return requestWithAuth(dataEndpoints.query.path, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(isGatewayBackendMode()
        ? {}
        : {
            "X-Agent-WebClient-Device-Id": getClientDeviceId(),
            "X-Agent-WebClient-Surface-Id": getClientSurfaceId(),
          }),
    },
    body: JSON.stringify(buildQueryPayload(options)),
    signal: options.signal,
    authFailureSource: "sse",
  });
}

export type QueryOnceParams = Omit<QueryStreamParams, "stream">;

/** Runs a query to completion and returns the regular JSON response. */
export function executeQueryOnce(
  options: QueryOnceParams,
): Promise<ApiResponse<Record<string, unknown>>> {
  return requestJson<Record<string, unknown>>(dataEndpoints.query.path, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: JSON.stringify(buildQueryPayload({ ...options, stream: false })),
    signal: options.signal,
  });
}

export function createBTWStream(
  options: BTWStreamParams,
): Promise<Response> {
  return requestWithAuth(dataEndpoints.btw.path, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(buildBTWPayload(options)),
    signal: options.signal,
    authFailureSource: "sse",
  });
}

export { compactQueryModelOverride };

export function createAttachStream(
  options: AttachStreamParams,
): Promise<Response> {
  const query = endpointQuery(dataEndpoints.attach, options);

  return requestWithAuth(withQuery(dataEndpoints.attach.path, query), {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(isGatewayBackendMode()
        ? {}
        : {
            "X-Agent-WebClient-Device-Id": getClientDeviceId(),
            "X-Agent-WebClient-Surface-Id": getClientSurfaceId(),
          }),
    },
    jsonContentType: false,
    signal: options.signal,
    authFailureSource: "sse",
  });
}
