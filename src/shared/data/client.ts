import type {
  AIAwaitSubmitParamData,
  VoiceCapabilities,
} from '@/app/state/types';
import {
  getAppAccessToken,
  refreshAppAccessToken,
  type AppAccessTokenRefreshReason,
} from '@/shared/data/appAuth';
import { readStoredAccessToken } from '@/shared/data/accessTokenStorage';
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
} from '@/shared/data/memoryTypes';
import { t } from '@/shared/i18n';
import { createCompactId } from '@/shared/utils/compactId';
import { isAppMode } from '@/shared/utils/routing';
import {
  formatPlatformErrorForDisplay,
  type PlatformError,
} from "@/shared/data/platformError";
import {
  buildAttachPayload,
  buildQueryPayload,
  compactQueryModelOverride,
  dataEndpoints,
} from "@/shared/data/endpoints";
import {
  resolveEndpointPayload,
  type EndpointDefinition,
} from "@/shared/data/endpointRegistry";

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

export interface GetAgentsOptions {
  includeChats?: number;
  scope?: "nav" | "copilot" | "invoke" | "internal" | "all";
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
  completedAt?: number;
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

export type RegistryConsoleTab = AdminRegistryCategory | "tools";

export type AdminRegistryStatus = "ready" | "invalid" | "disabled";

export interface AdminToolSummary {
  key?: string;
  name?: string;
  label?: string;
  description?: string;
  kind?: string;
  tags?: string[];
  source?: string;
  summary?: Record<string, unknown>;
  status?: string;
  [key: string]: unknown;
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

export interface AdminRegistrySummary {
  category: AdminRegistryCategory;
  file: string;
  key?: string;
  name?: string;
  status: AdminRegistryStatus;
  diagnostics?: AdminRegistryDiagnostic[];
  source?: AgentSource;
  summary?: Record<string, unknown>;
  updatedAt?: number;
  size?: number;
}

export interface AdminRegistryListResponse {
  items: AdminRegistrySummary[];
  total: number;
}

export interface AdminRegistryDetailResponse extends AdminRegistrySummary {
  content: string;
  parsed?: Record<string, unknown>;
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

export interface OpenAgentWorkspaceRequest {
  key?: string;
  agentKey?: string;
  workspaceDir?: string;
}

export interface OpenAgentWorkspaceResponse {
  agentKey?: string;
  workspaceDir: string;
  opened: boolean;
}

export interface AgentEditorOption {
  key: string;
  label: string;
}

export interface AgentEditorModelOption {
  key: string;
  name?: string;
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

export interface ChatSummaryResponse {
  chatId: string;
  chatName?: string;
  agentKey?: string;
  teamId?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunId?: string;
  lastRunContent?: string;
  read?: {
    isRead?: boolean;
    readAt?: number;
    readRunId?: string;
  };
  usage?: ChatUsageData;
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

function toQueryString(
  params: Record<string, string | number | boolean | undefined | null> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

type QueryParamValue = string | number | boolean | undefined | null;

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
      item == null
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
  options: { includeJsonContentType?: boolean } = {},
): Record<string, string> {
  const includeJsonContentType = options.includeJsonContentType ?? true;
  const merged: Record<string, string> = {
    ...headers,
  };
  if (includeJsonContentType && !hasHeader(merged, "Content-Type")) {
    merged["Content-Type"] = "application/json";
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

    return {
      ...item,
      hasPendingAwaiting: Boolean(item.awaiting),
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
    throw new ApiError(`Invalid JSON response: ${(error as Error).message}`, {
      status: response.status,
      data: rawText,
    });
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
  } = {},
): Promise<Response> {
  const {
    jsonContentType = true,
    retryUnauthorized = true,
    ...requestOptions
  } = options;

  if (isAppMode()) {
    await ensureAccessToken('missing');
  }

  const buildRequestOptions = (): RequestInit => ({
    ...requestOptions,
    method: requestOptions.method || "GET",
    headers: buildAuthHeaders(requestOptions.headers || {}, {
      includeJsonContentType: jsonContentType,
    }),
  });

  let response = await fetch(path, buildRequestOptions());

  if (retryUnauthorized && isAppMode() && response.status === 401) {
    const refreshedToken = await ensureAccessToken('unauthorized');
    if (refreshedToken) {
      response = await fetch(path, buildRequestOptions());
    }
  }

  return response;
}

export function createRequestId(prefix = "req"): string {
  return createCompactId(prefix);
}

export function buildResourceUrl(file: string): string {
  return `${dataEndpoints.resource.path}?file=${encodeURIComponent(file)}`;
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
  options: { filename?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const response = await fetch(path, {
    method: "GET",
    signal: options.signal,
    headers: buildAuthHeaders({}, { includeJsonContentType: false }),
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
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const response = await fetch(path, {
    method: "GET",
    signal: options.signal,
    headers: buildAuthHeaders({}, { includeJsonContentType: false }),
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

export function getAgent(agentKey: string): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.agent, agentKey);
  return requestJson(withQuery(dataEndpoints.agent.path, query));
}

export function getAdminAgentDetail(agentKey: string): Promise<ApiResponse<AdminAgentDetailResponse>> {
  const query = endpointQuery(dataEndpoints.adminAgentDetail, agentKey);
  return requestJson<AdminAgentDetailResponse>(withQuery(dataEndpoints.adminAgentDetail.path, query));
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

export function openAgentWorkspace(
  params: OpenAgentWorkspaceRequest,
): Promise<ApiResponse<OpenAgentWorkspaceResponse>> {
  return postJson<OpenAgentWorkspaceResponse>(dataEndpoints.agentOpenWorkspace.path, params);
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

export function getAdminSkills(tag?: string): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.adminSkills, tag);
  return requestJson(withQuery(dataEndpoints.adminSkills.path, query));
}

export function getAdminTools(
  options: { tag?: string; kind?: string } = {},
): Promise<ApiResponse<AdminToolSummary[]>> {
  const query = endpointQuery(dataEndpoints.adminTools, options);
  return requestJson<AdminToolSummary[]>(withQuery(dataEndpoints.adminTools.path, query));
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
): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.chat, { chatId, includeRawMessages });
  return requestJson(withQuery(dataEndpoints.chat.path, query));
}

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
  agentKey: string;
  toolId: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse> {
  return requestJson(dataEndpoints.submit.path, {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      agentKey: params.agentKey,
      toolId: params.toolId,
      params: params.params,
    }),
  });
}

export function submitAwaiting(params: {
  chatId?: string;
  runId: string;
  agentKey: string;
  awaitingId: string;
  submitId?: string;
  params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
  return requestJson(dataEndpoints.submit.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      agentKey: params.agentKey,
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
  agentKey?: string;
  teamId?: string;
  message: string;
  planningMode?: boolean;
}

export type QueryAccessLevel = "default" | "auto_approve" | "full_access";
export type QueryReasoningEffort =
  | "NONE"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "XHIGH"
  | "MAX";

export interface AccessLevelUpdateParams {
  requestId: string;
  runId: string;
  agentKey: string;
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
  const response = await fetch(path, {
    method: "GET",
    headers: buildAuthHeaders({}, { includeJsonContentType: false }),
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
      agentKey: params.agentKey,
      teamId: params.teamId,
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
      agentKey: params.agentKey,
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
      agentKey: params.agentKey,
      teamId: params.teamId,
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
  agentMode?: string;
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  agentKey?: string;
  teamId?: string;
  chatId?: string;
  role?: string;
  references?: unknown[];
  params?: Record<string, unknown>;
  scene?: string;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface AttachStreamParams {
  runId: string;
  agentKey: string;
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
    },
    body: JSON.stringify(buildQueryPayload(options)),
    signal: options.signal,
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
    },
    jsonContentType: false,
    signal: options.signal,
  });
}
