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

  if (!json || typeof json !== 'object' || !('code' in json)) {
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
  return requestJson('/api/ap/agents');
}

export function getTeams(): Promise<ApiResponse> {
  return requestJson('/api/ap/teams');
}

export function getAgent(agentKey: string): Promise<ApiResponse> {
  const query = toQueryString({ agentKey });
  return requestJson(query ? `/api/ap/agent?${query}` : '/api/ap/agent');
}

export function getSkills(tag?: string): Promise<ApiResponse> {
  const query = toQueryString({ tag });
  return requestJson(query ? `/api/ap/skills?${query}` : '/api/ap/skills');
}

export function getSkill(skillId: string): Promise<ApiResponse> {
  const query = toQueryString({ skillId });
  return requestJson(query ? `/api/ap/skill?${query}` : '/api/ap/skill');
}

export function getTools(options: { tag?: string; kind?: string } = {}): Promise<ApiResponse> {
  const query = toQueryString({ tag: options.tag, kind: options.kind });
  return requestJson(query ? `/api/ap/tools?${query}` : '/api/ap/tools');
}

export function getTool(toolName: string): Promise<ApiResponse> {
  const query = toQueryString({ toolName });
  return requestJson(query ? `/api/ap/tool?${query}` : '/api/ap/tool');
}

export function getChats(): Promise<ApiResponse> {
  return requestJson('/api/ap/chats');
}

export function getChat(chatId: string, includeRawMessages = false): Promise<ApiResponse> {
  const query = toQueryString({ chatId, includeRawMessages: includeRawMessages ? 'true' : undefined });
  return requestJson(`/api/ap/chat?${query}`);
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
  const query = toQueryString({ viewportKey });
  return requestJson(`/api/ap/viewport?${query}`);
}

export function submitTool(params: { runId: string; toolId: string; params: Record<string, unknown> }): Promise<ApiResponse> {
  return requestJson('/api/ap/submit', {
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
  return requestJson('/api/ap/interrupt', {
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
  return requestJson('/api/ap/steer', {
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

  return fetch('/api/ap/query', {
    method: 'POST',
    headers: buildAuthHeaders({
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    }),
    body: JSON.stringify(body),
    signal: options.signal,
  });
}
