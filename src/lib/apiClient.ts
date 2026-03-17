import type { VoiceCapabilities } from '../context/types';

export class ApiError extends Error {
  name = 'ApiError';
  status: number | null;
  code: number | string | null;
  data: unknown;

  constructor(message: string, details: { status?: number | null; code?: number | string | null; data?: unknown } = {}) {
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

let authToken = '';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function isApiResponseShape(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && 'code' in value;
}

function isVoiceCapabilitiesShape(value: unknown): value is VoiceCapabilities {
  return (
    isObjectRecord(value) &&
    ('websocketPath' in value || 'asr' in value || 'tts' in value)
  );
}

function isVoiceVoicesPayloadShape(value: unknown): value is { voices?: unknown[]; defaultVoice?: unknown } {
  return isObjectRecord(value) && ('voices' in value || 'defaultVoice' in value);
}

function toQueryString(params: Record<string, string | number | boolean | undefined | null> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

function buildAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const merged: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (authToken) {
    merged.Authorization = `Bearer ${authToken}`;
  } else if ('Authorization' in merged) {
    delete merged.Authorization;
  }
  return merged;
}

export function setAccessToken(token = ''): void {
  authToken = String(token || '').trim();
}

async function readJsonResponse(response: Response): Promise<ApiResponse> {
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
    throw new ApiError('Response is not ApiResponse shape', {
      status: response.status,
      data: json,
    });
  }

  if (json.code !== 0) {
    throw new ApiError((json.msg as string) || 'API returned non-zero code', {
      status: response.status,
      code: json.code as number,
      data: json.data,
    });
  }

  return {
    status: response.status,
    code: json.code as number,
    msg: json.msg as string,
    data: json.data,
  };
}

async function readVoiceCapabilitiesResponse(response: Response): Promise<VoiceCapabilities | null> {
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
      throw new ApiError((json.msg as string) || 'API returned non-zero code', {
        status: response.status,
        code: json.code as number,
        data: json.data,
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceCapabilitiesShape(json.data)) {
      throw new ApiError('Response is not VoiceCapabilities shape', {
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
    throw new ApiError('Response is not VoiceCapabilities shape', {
      status: response.status,
      data: json,
    });
  }

  return json;
}

async function readVoiceVoicesResponse(response: Response): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
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
      throw new ApiError((json.msg as string) || 'API returned non-zero code', {
        status: response.status,
        code: json.code as number,
        data: json.data,
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceVoicesPayloadShape(json.data)) {
      throw new ApiError('voice voices response is invalid', {
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
    throw new ApiError('voice voices response is invalid', {
      status: response.status,
      data: json,
    });
  }

  return json;
}

async function requestJson(path: string, options: RequestInit & { headers?: Record<string, string> } = {}): Promise<ApiResponse> {
  const response = await fetch(path, {
    ...options,
    method: options.method || 'GET',
    headers: buildAuthHeaders(options.headers || {}),
  });

  return readJsonResponse(response);
}

export function createRequestId(prefix = 'req'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAgents(): Promise<ApiResponse> {
  return requestJson('/api/agents');
}

export function getTeams(): Promise<ApiResponse> {
  return requestJson('/api/teams');
}


export function getSkills(tag?: string): Promise<ApiResponse> {
  const query = toQueryString({ tag });
  return requestJson(query ? `/api/skills?${query}` : '/api/skills');
}


export function getTools(options: { tag?: string; kind?: string } = {}): Promise<ApiResponse> {
  const query = toQueryString({ tag: options.tag, kind: options.kind });
  return requestJson(query ? `/api/tools?${query}` : '/api/tools');
}

export function getTool(toolName: string): Promise<ApiResponse> {
  const query = toQueryString({ toolName });
  return requestJson(query ? `/api/tool?${query}` : '/api/tool');
}

export function getChats(): Promise<ApiResponse> {
  return requestJson('/api/chats');
}

export function getChat(chatId: string, includeRawMessages = false): Promise<ApiResponse> {
  const query = toQueryString({ chatId, includeRawMessages: includeRawMessages ? 'true' : undefined });
  return requestJson(`/api/chat?${query}`);
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
  const query = toQueryString({ viewportKey });
  return requestJson(`/api/viewport?${query}`);
}

export function getVoiceCapabilities(): Promise<ApiResponse> {
  return requestJson('/api/voice/capabilities');
}

export async function getVoiceCapabilitiesFlexible(): Promise<VoiceCapabilities | null> {
  const response = await fetch('/api/voice/capabilities', {
    method: 'GET',
    headers: buildAuthHeaders(),
  });
  return readVoiceCapabilitiesResponse(response);
}

export function getVoiceVoices(): Promise<ApiResponse> {
  return requestJson('/api/voice/tts/voices');
}

export async function getVoiceVoicesFlexible(path = '/api/voice/tts/voices'): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const response = await fetch(path, {
    method: 'GET',
    headers: buildAuthHeaders(),
  });
  return readVoiceVoicesResponse(response);
}

export function submitTool(params: { runId: string; toolId: string; params: Record<string, unknown> }): Promise<ApiResponse> {
  return requestJson('/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      runId: params.runId,
      toolId: params.toolId,
      params: params.params,
    }),
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

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
  return requestJson('/api/interrupt', {
    method: 'POST',
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
  return requestJson('/api/steer', {
    method: 'POST',
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

export function createQueryStream(options: QueryStreamParams): Promise<Response> {
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

  return fetch('/api/query', {
    method: 'POST',
    headers: buildAuthHeaders({
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    }),
    body: JSON.stringify(body),
    signal: options.signal,
  });
}
