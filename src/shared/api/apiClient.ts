import type {
  AIAwaitSubmitParamData,
  VoiceCapabilities,
} from '@/app/state/types';
import {
  getAppAccessToken,
  refreshAppAccessToken,
  type AppAccessTokenRefreshReason,
} from '@/shared/api/appAuth';
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
} from '@/shared/api/memoryTypes';
import { t } from '@/shared/i18n';
import { createCompactId } from '@/shared/utils/compactId';
import { isAppMode } from '@/shared/utils/routing';

export class ApiError extends Error {
  name = "ApiError";
  status: number | null;
  code: number | string | null;
  data: unknown;

  constructor(
    message: string,
    details: {
      status?: number | null;
      code?: number | string | null;
      data?: unknown;
    } = {},
  ) {
    super(message);
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.data = details.data ?? null;
  }
}

export interface ApiResponse<T = unknown> {
  status: number;
  code: number;
  msg: string;
  data: T;
}

export interface GetAgentsOptions {
  includeChats?: number;
  scope?: "nav" | "copilot";
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
  wonders?: string[];
  model: string;
  mode: string;
  tools: string[];
  skills: string[];
  controls: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  definition?: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
  source?: AgentSource;
}

export interface CreateAgentRequest {
  key: string;
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
}

export interface CoderModelOption extends AgentEditorModelOption {
  isReasoner: boolean;
}

export interface ReasoningEffortOption {
  key: QueryReasoningEffort;
  label: string;
}

export interface CoderModelOptionsResponse {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  defaultModelKey?: string;
  defaultReasoningEffort: QueryReasoningEffort;
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
  cachedTokens?: number;
  reasoningTokens?: number;
}

export interface ChatUsageData {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: ChatUsageTokenDetails;
  completionTokensDetails?: ChatUsageTokenDetails;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
  llmChatCompletionCount?: number;
}

export interface ArchiveDeleteResponse {
  chatId: string;
  deleted: boolean;
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
  if (authToken) {
    merged.Authorization = `Bearer ${authToken}`;
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
    throw new ApiError((json?.msg as string) || `HTTP ${response.status}`, {
      status: response.status,
      code: json?.code as number | undefined,
      data: json?.data,
    });
  }

  if (!isApiResponseShape(json)) {
    throw new ApiError("Response is not ApiResponse shape", {
      status: response.status,
      data: json,
    });
  }

  if (json.code !== 0) {
    throw new ApiError((json.msg as string) || "API returned non-zero code", {
      status: response.status,
      code: json.code as number,
      data: json.data,
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
    throw new ApiError((apiJson?.msg as string) || `HTTP ${response.status}`, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw new ApiError((json.msg as string) || "API returned non-zero code", {
        status: response.status,
        code: json.code as number,
        data: json.data,
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
    throw new ApiError((apiJson?.msg as string) || `HTTP ${response.status}`, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw new ApiError((json.msg as string) || "API returned non-zero code", {
        status: response.status,
        code: json.code as number,
        data: json.data,
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
  return `/api/resource?file=${encodeURIComponent(file)}`;
}

function getErrorMessageFromText(
  rawText: string,
  fallbackMessage: string,
): {
  message: string;
  code?: number | string | null;
  data?: unknown;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { message: fallbackMessage, data: rawText };
  }

  try {
    const json = JSON.parse(trimmed) as unknown;
    if (isObjectRecord(json)) {
      const message =
        typeof json.msg === "string" && json.msg.trim()
          ? json.msg.trim()
          : fallbackMessage;
      return {
        message,
        code:
          typeof json.code === "number" || typeof json.code === "string"
            ? json.code
            : null,
        data: "data" in json ? json.data : json,
      };
    }
  } catch {
    return { message: trimmed, data: rawText };
  }

  return { message: fallbackMessage, data: rawText };
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
    const error = getErrorMessageFromText(rawText, fallbackMessage);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
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
    const error = getErrorMessageFromText(rawText, fallbackMessage);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
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
  const query = toQueryString({ includeChats: options.includeChats, scope: options.scope });
  return requestJson(query ? `/api/agents?${query}` : "/api/agents");
}

export function getAgent(agentKey: string): Promise<ApiResponse> {
  const query = toQueryString({ agentKey });
  return requestJson(query ? `/api/agent?${query}` : "/api/agent");
}

export function createAgent(
  params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>("/api/agent/create", params);
}

export function updateAgent(
  params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
  return postJson<AgentDetailResponse>("/api/agent/update", params);
}

export function deleteAgent(
  params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
  return postJson<DeleteAgentResponse>("/api/agent/delete", params);
}

export function openAgentWorkspace(
  params: OpenAgentWorkspaceRequest,
): Promise<ApiResponse<OpenAgentWorkspaceResponse>> {
  return postJson<OpenAgentWorkspaceResponse>("/api/agent/open-workspace", params);
}

export function getAgentEditorOptions(): Promise<ApiResponse<AgentEditorOptionsResponse>> {
  return requestJson<AgentEditorOptionsResponse>("/api/agent/editor-options");
}

export function getModelOptions(): Promise<ApiResponse<CoderModelOptionsResponse>> {
  return requestJson<CoderModelOptionsResponse>("/api/model-options");
}

export function getTeams(): Promise<ApiResponse> {
  return requestJson("/api/teams");
}

export function getSkills(tag?: string): Promise<ApiResponse> {
  const query = toQueryString({ tag });
  return requestJson(query ? `/api/skills?${query}` : "/api/skills");
}

export function getTools(
  options: { tag?: string; kind?: string } = {},
): Promise<ApiResponse> {
  const query = toQueryString({ tag: options.tag, kind: options.kind });
  return requestJson(query ? `/api/tools?${query}` : "/api/tools");
}

export function getTool(toolName: string): Promise<ApiResponse> {
  const query = toQueryString({ toolName });
  return requestJson(query ? `/api/tool?${query}` : "/api/tool");
}

export function getChats(options: GetChatsOptions = {}): Promise<ApiResponse> {
  const query = toQueryString({ agentKey: options.agentKey });
  return requestJson(query ? `/api/chats?${query}` : "/api/chats").then((response) => ({
    ...response,
    data: normalizeChatSummariesPayload(response.data),
  }));
}

export function getChat(
  chatId: string,
  includeRawMessages = false,
): Promise<ApiResponse> {
  const query = toQueryString({
    chatId,
    includeRawMessages: includeRawMessages ? "true" : undefined,
  });
  return requestJson(`/api/chat?${query}`);
}

export function archiveChats(
  params: ArchiveChatsRequest,
): Promise<ApiResponse<ArchiveChatsResponse>> {
  return postJson<ArchiveChatsResponse>("/api/chat/archive", {
    chatIds: params.chatIds,
  });
}

export function getArchives(
  params: ArchivesRequest = {},
): Promise<ApiResponse<ArchivesResponse>> {
  const query = toQueryString({
    agentKey: params.agentKey,
    limit: params.limit,
    offset: params.offset,
  });
  return requestJson<ArchivesResponse>(query ? `/api/archives?${query}` : "/api/archives");
}

export function getArchive(
  chatId: string,
  includeRawMessages = false,
): Promise<ApiResponse<ArchiveDetailResponse>> {
  const query = toQueryString({
    chatId,
    includeRawMessages: includeRawMessages ? "true" : undefined,
  });
  return requestJson<ArchiveDetailResponse>(`/api/archive?${query}`);
}

export function searchArchives(
  params: ArchiveSearchParams,
): Promise<ApiResponse<ArchiveSearchResponse>> {
  return postJson<ArchiveSearchResponse>("/api/archive/search", {
    query: params.query,
    agentKey: params.agentKey,
    limit: params.limit,
  });
}

export function deleteArchive(params: {
  chatId: string;
}): Promise<ApiResponse<ArchiveDeleteResponse>> {
  const query = toQueryString({ chatId: params.chatId });
  return requestJson<ArchiveDeleteResponse>(`/api/archive/delete?${query}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
  const query = toQueryString({ viewportKey });
  return requestJson(`/api/viewport?${query}`);
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
  return postJson<AutomationListResponse>("/api/automations", params);
}

export function getAutomation(
  id: string,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>("/api/automation", { id });
}

export function createAutomation(
  params: CreateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>("/api/automation/create", params);
}

export function updateAutomation(
  params: UpdateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>("/api/automation/update", params);
}

export function deleteAutomation(
  params: DeleteAutomationRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return postJson<{ id: string; deleted: boolean }>("/api/automation/delete", params);
}

export function toggleAutomation(
  params: ToggleAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>("/api/automation/toggle", params);
}

export function getAutomationExecutions(
  params: AutomationExecutionsRequest,
): Promise<ApiResponse<AutomationExecutionListResponse>> {
  return postJson<AutomationExecutionListResponse>("/api/automation/executions", params);
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
  const query = toQueryString({
    agentKey: params.agentKey,
    keyword: params.keyword,
    kind: params.kind,
    scopeType: params.scopeType,
    status: params.status,
    category: params.category,
    limit: params.limit,
    cursor: params.cursor,
    chatId: params.chatId,
  });
  return requestJson<MemoryRecordsPayload>(`/api/memory/record/list?${query}`);
}

export function getMemoryRecord(
  agentKey: string | undefined,
  id: string,
): Promise<ApiResponse<MemoryRecordDetail>> {
  const query = toQueryString({ agentKey, recordId: id });
  return requestJson<MemoryRecordDetail>(`/api/memory/record/detail?${query}`);
}

export function getMemoryScopes(
  agentKey: string,
): Promise<ApiResponse<MemoryScopesResponse>> {
  const query = toQueryString({ agentKey });
  return requestJson<MemoryScopesResponse>(`/api/memory/scope/list?${query}`);
}

export function getMemoryMeta(): Promise<ApiResponse<MemoryMeta>> {
  return requestJson<MemoryMeta>("/api/memory/meta");
}

export function getMemoryScope(
  agentKey: string,
  scopeType: string,
  scopeKey?: string,
): Promise<ApiResponse<MemoryScopeDetail>> {
  const query = toQueryString({ agentKey, scopeType, scopeKey });
  return requestJson<MemoryScopeDetail>(`/api/memory/scope/detail?${query}`);
}

export function validateMemoryScope(
  agentKey: string,
  scopeType: string,
  markdown: string,
): Promise<ApiResponse<MemoryScopeValidationResult>> {
  return requestJson<MemoryScopeValidationResult>("/api/memory/scope/validate", {
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
  return requestJson<MemoryContextPreviewResponse>("/api/memory/context-preview", {
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
  return requestJson<MemoryScopeSaveResult>("/api/memory/scope/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getVoiceCapabilities(): Promise<ApiResponse> {
  return requestJson("/api/voice/capabilities");
}

export async function getVoiceCapabilitiesFlexible(): Promise<VoiceCapabilities | null> {
  const response = await requestWithAuth('/api/voice/capabilities');
  return readVoiceCapabilitiesResponse(response);
}

export function getVoiceVoices(): Promise<ApiResponse> {
  return requestJson("/api/voice/tts/voices");
}

export async function getVoiceVoicesFlexible(path = '/api/voice/tts/voices'): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const response = await requestWithAuth(path);
  return readVoiceVoicesResponse(response);
}

export function submitTool(params: {
  runId: string;
  agentKey: string;
  toolId: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse> {
  return requestJson("/api/submit", {
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
  runId: string;
  agentKey: string;
  awaitingId: string;
  params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
  return requestJson("/api/submit", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      agentKey: params.agentKey,
      awaitingId: params.awaitingId,
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

  return requestJson("/api/upload", {
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
export type QueryReasoningEffort = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface QueryModelOverride {
  key?: string;
  reasoningEffort?: QueryReasoningEffort;
}

export interface BackgroundCommandParams {
  requestId: string;
  chatId: string;
}

export interface MarkChatReadParams {
  chatId?: string;
  runId?: string;
  agentKey?: string;
}

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
  return requestJson("/api/read", {
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
  return requestJson("/api/feedback", {
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
  const query = toQueryString({ chatId: params.chatId });
  return requestJson(`/api/chat/delete?${query}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function renameChat(
  params: RenameChatRequest,
): Promise<ApiResponse<RenameChatResponse>> {
  const query = toQueryString({ chatId: params.chatId });
  return requestJson<RenameChatResponse>(`/api/chat/rename?${query}`, {
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
  return requestJson("/api/search", {
    method: "POST",
    body: JSON.stringify({
      query: params.query,
      agentKey: params.agentKey,
      teamId: params.teamId,
      limit: params.limit,
    }),
  }) as Promise<ApiResponse<GlobalSearchResponse>>;
}

function recoverLegacyUtf8Filename(value: string): string {
  if (!value || /[\u4e00-\u9fff]/.test(value)) {
    return value;
  }
  if (typeof TextDecoder === "undefined") {
    return value;
  }

  try {
    const bytes = Uint8Array.from(
      Array.from(value, (char) => char.charCodeAt(0) & 0xff),
    );
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded || value;
  } catch {
    return value;
  }
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
  if (quotedMatch?.[1]) return recoverLegacyUtf8Filename(quotedMatch[1].trim());
  const plainMatch = /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1]
    ? recoverLegacyUtf8Filename(plainMatch[1].trim())
    : "";
}

export async function downloadChatExport(chatId: string): Promise<void> {
  const path = `/api/chat-export?chatId=${encodeURIComponent(chatId)}`;
  const response = await fetch(path, {
    method: "GET",
    headers: buildAuthHeaders({}, { includeJsonContentType: false }),
  });
  if (!response.ok) {
    const fallbackMessage = t("api.downloadFailedWithStatus", {
      status: response.status,
    });
    const rawText = await response.text();
    const error = getErrorMessageFromText(rawText, fallbackMessage);
    throw new ApiError(error.message, {
      status: response.status,
      code: error.code,
      data: error.data,
    });
  }
  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get("Content-Disposition"))
    || `${chatId || "chat"}.md`;
  triggerBrowserDownload(blob, filename);
}

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
  return requestJson("/api/interrupt", {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      runId: params.runId,
      agentKey: params.agentKey,
      teamId: params.teamId,
      message: params.message,
      planningMode: params.planningMode ?? false,
    }),
  });
}

export function steerChat(params: QueryLikeParams): Promise<ApiResponse> {
  return requestJson("/api/steer", {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
      runId: params.runId,
      steerId: params.steerId,
      agentKey: params.agentKey,
      teamId: params.teamId,
      message: params.message,
      planningMode: params.planningMode ?? false,
    }),
  });
}

export function rememberChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse> {
  return requestJson("/api/remember", {
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
  return requestJson("/api/learn", {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
    }),
  });
}

export interface QueryStreamParams {
  requestId: string;
  message: string;
  planningMode?: boolean;
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
  const body: Record<string, unknown> = {
    requestId: options.requestId,
    planningMode: options.planningMode ?? false,
    message: options.message,
  };

  if (options.agentKey) body.agentKey = options.agentKey;
  if (options.teamId) body.teamId = options.teamId;
  if (options.chatId) body.chatId = options.chatId;
  if (options.accessLevel) body.accessLevel = options.accessLevel;
  const model = compactQueryModelOverride(options.model);
  if (model) body.model = model;
  if (options.role) body.role = options.role;
  if (options.references !== undefined) body.references = options.references;
  if (options.params !== undefined) body.params = options.params;
  if (options.scene) body.scene = options.scene;
  if (options.stream !== undefined) body.stream = options.stream;

  return requestWithAuth('/api/query', {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export function compactQueryModelOverride(
  model: QueryModelOverride | undefined,
): QueryModelOverride | null {
  if (!model) {
    return null;
  }
  const key = String(model.key || "").trim();
  const reasoningEffort = String(model.reasoningEffort || "").trim() as
    | QueryReasoningEffort
    | "";
  if (!key && !reasoningEffort) {
    return null;
  }
  return {
    ...(key ? { key } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

export function createAttachStream(
  options: AttachStreamParams,
): Promise<Response> {
  const runId = String(options.runId || '').trim();
  const agentKey = String(options.agentKey || '').trim();
  const lastSeq = Number(options.lastSeq ?? 0);
  const query = new URLSearchParams({
    runId,
    agentKey,
    lastSeq: String(Number.isFinite(lastSeq) && lastSeq >= 0 ? lastSeq : 0),
  });

  return requestWithAuth(`/api/attach?${query.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    jsonContentType: false,
    signal: options.signal,
  });
}
