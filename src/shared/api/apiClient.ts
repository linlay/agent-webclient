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

export interface ScheduleListRequest {
  tag?: string;
}

export interface ScheduleListResponse {
  items: ScheduleSummaryResponse[];
  total: number;
}

export interface ScheduleExecutionListResponse {
  items: ScheduleExecutionResponse[];
  total: number;
}

export interface ScheduleSummaryResponse {
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
  lastExecution?: ScheduleExecutionBrief;
}

export interface ScheduleDetailResponse extends ScheduleSummaryResponse {
  query: ScheduleQueryResponse;
}

export interface ScheduleQueryResponse {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface ScheduleExecutionBrief {
  id: string;
  status: string;
  startedAt: number;
  durationMs?: number;
  error?: string;
}

export interface ScheduleExecutionResponse {
  id: string;
  scheduleId: string;
  scheduleName: string;
  sourceFile: string;
  agentKey: string;
  teamId: string;
  status: string;
  error: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

export interface ScheduleQueryRequest {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface CreateScheduleRequest {
  name: string;
  description: string;
  cron: string;
  agentKey: string;
  enabled?: boolean;
  teamId?: string;
  zoneId?: string;
  remainingRuns?: number;
  query: ScheduleQueryRequest;
}

export interface UpdateScheduleRequest {
  id: string;
  name?: string;
  description?: string;
  cron?: string;
  agentKey?: string;
  teamId?: string;
  zoneId?: string;
  enabled?: boolean;
  remainingRuns?: number;
  query?: ScheduleQueryRequest;
}

export interface ToggleScheduleRequest {
  id: string;
  enabled: boolean;
}

export interface DeleteScheduleRequest {
  id: string;
}

export interface ScheduleExecutionsRequest {
  id: string;
  limit?: number;
  offset?: number;
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
  const filename = String(options.filename || "").trim() || "download";
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

export function getAgents(): Promise<ApiResponse> {
  return requestJson("/api/agents");
}

export function getAgent(agentKey: string): Promise<ApiResponse> {
  const query = toQueryString({ agentKey });
  return requestJson(query ? `/api/agent?${query}` : "/api/agent");
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

export function getChats(): Promise<ApiResponse> {
  return requestJson("/api/chats").then((response) => ({
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

export function getSchedules(
  params: ScheduleListRequest = {},
): Promise<ApiResponse<ScheduleListResponse>> {
  return postJson<ScheduleListResponse>("/api/schedules", params);
}

export function getSchedule(
  id: string,
): Promise<ApiResponse<ScheduleDetailResponse>> {
  return postJson<ScheduleDetailResponse>("/api/schedule", { id });
}

export function createSchedule(
  params: CreateScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
  return postJson<ScheduleDetailResponse>("/api/schedule-create", params);
}

export function updateSchedule(
  params: UpdateScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
  return postJson<ScheduleDetailResponse>("/api/schedule-update", params);
}

export function deleteSchedule(
  params: DeleteScheduleRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return postJson<{ id: string; deleted: boolean }>("/api/schedule-delete", params);
}

export function toggleSchedule(
  params: ToggleScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
  return postJson<ScheduleDetailResponse>("/api/schedule-toggle", params);
}

export function getScheduleExecutions(
  params: ScheduleExecutionsRequest,
): Promise<ApiResponse<ScheduleExecutionListResponse>> {
  return postJson<ScheduleExecutionListResponse>("/api/schedule-executions", params);
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
  return requestJson<MemoryRecordsPayload>(`/api/memory/records?${query}`);
}

export function getMemoryRecord(
  agentKey: string | undefined,
  id: string,
): Promise<ApiResponse<MemoryRecordDetail>> {
  const query = toQueryString({ agentKey, id });
  return requestJson<MemoryRecordDetail>(`/api/memory/record?${query}`);
}

export function getMemoryScopes(
  agentKey: string,
): Promise<ApiResponse<MemoryScopesResponse>> {
  const query = toQueryString({ agentKey });
  return requestJson<MemoryScopesResponse>(`/api/memory/scopes?${query}`);
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
  return requestJson<MemoryScopeDetail>(`/api/memory/scope?${query}`);
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
  return requestJson<MemoryContextPreviewResponse>("/api/memory/context/preview", {
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
  return requestJson<MemoryScopeSaveResult>("/api/memory/scope", {
    method: "PUT",
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
  toolId: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse> {
  return requestJson("/api/submit", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      toolId: params.toolId,
      params: params.params,
    }),
  });
}

export function submitAwaiting(params: {
  runId: string;
  awaitingId: string;
  params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
  return requestJson("/api/submit", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
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
  return requestJson("/api/chat-delete", {
    method: "POST",
    body: JSON.stringify({ chatId: params.chatId }),
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
  return plainMatch?.[1]?.trim() || "";
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
