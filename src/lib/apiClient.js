export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.data = details.data ?? null;
  }
}

let authToken = '';

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

function buildAuthHeaders(headers = {}) {
  const merged = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (authToken) {
    merged.Authorization = `Bearer ${authToken}`;
  } else if ('Authorization' in merged) {
    delete merged.Authorization;
  }
  return merged;
}

export function setAccessToken(token = '') {
  authToken = String(token || '').trim();
}

async function readJsonResponse(response) {
  const rawText = await response.text();
  let json;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${error.message}`, {
      status: response.status,
      data: rawText
    });
  }

  if (!response.ok) {
    throw new ApiError(json?.msg || `HTTP ${response.status}`, {
      status: response.status,
      code: json?.code,
      data: json?.data
    });
  }

  if (!json || typeof json !== 'object' || !('code' in json)) {
    throw new ApiError('Response is not ApiResponse shape', {
      status: response.status,
      data: json
    });
  }

  if (json.code !== 0) {
    throw new ApiError(json.msg || 'API returned non-zero code', {
      status: response.status,
      code: json.code,
      data: json.data
    });
  }

  return {
    status: response.status,
    code: json.code,
    msg: json.msg,
    data: json.data
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    method: options.method || 'GET',
    headers: buildAuthHeaders(options.headers || {})
  });

  return readJsonResponse(response);
}

export function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAgents() {
  return requestJson('/api/agents');
}

export function getChats() {
  return requestJson('/api/chats');
}

export function getChat(chatId, includeRawMessages = false) {
  const query = toQueryString({ chatId, includeRawMessages: includeRawMessages ? 'true' : undefined });
  return requestJson(`/api/chat?${query}`);
}

export function getViewport(viewportKey) {
  const query = toQueryString({ viewportKey });
  return requestJson(`/api/viewport?${query}`);
}

export function submitTool({ runId, toolId, params }) {
  return requestJson('/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      runId,
      toolId,
      params
    })
  });
}

export function createQueryStream({ message, agentKey, chatId, role, references, params, scene, stream, signal }) {
  return fetch('/api/query', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      message,
      agentKey,
      chatId,
      role,
      references,
      params,
      scene,
      stream
    }),
    signal
  });
}
