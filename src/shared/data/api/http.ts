import {
  type PlatformError,
  formatPlatformErrorForDisplay,
} from "@/shared/data/errors/platformError";
import {
  isGatewayBackendMode,
} from "@/shared/config/backendMode";
import {
  getGatewaySession,
} from "@/shared/data/auth/gatewaySession";
import {
  isAppMode,
} from "@/shared/utils/routing";
import {
  readStoredAccessToken,
} from "@/shared/data/auth/accessTokenStorage";
import {
  getAppAccessToken,
  type AppAccessTokenRefreshReason,
  refreshAppAccessToken,
} from "@/shared/data/auth/appAuth";
import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import {
  type AuthFailureSource,
  handleFinalUnauthorized,
} from "@/shared/data/auth/authCoordinator";
import {
  createCompactId,
} from "@/shared/utils/compactId";

export const NativeURL = globalThis.URL;

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

let authToken = "";

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalizedName = name.toLowerCase();
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === normalizedName,
  );
}

export function isApiResponseShape(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && "code" in value;
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

export function createPlatformApiError(input: unknown, options: {
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

export async function requestJson<T = unknown>(
  path: string,
  options: RequestInit & {
    headers?: Record<string, string>;
    jsonContentType?: boolean;
  } = {},
): Promise<ApiResponse<T>> {
  const response = await requestWithAuth(path, options);
  return readJsonResponse<T>(response);
}

export async function requestWithAuth(
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

export function getErrorMessageFromText(
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

export function postJson<T>(path: string, payload: unknown): Promise<ApiResponse<T>> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}
