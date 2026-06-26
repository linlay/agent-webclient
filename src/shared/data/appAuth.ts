import { isAppMode } from '@/shared/utils/routing';
import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from '@/shared/data/desktopHostBridge';

export const AGENT_APP_ACCESS_TOKEN_STORAGE_KEY = 'agent-webclient.appAccessToken';
export const AGENT_APP_AUTH_CONTEXT_STORAGE_KEY = 'agent-webclient.appAuthContext';

export type AppAccessTokenRefreshReason = 'missing' | 'unauthorized';

type AppAuthRequestAction = 'getAccessToken' | 'refreshAccessToken';

interface AppAuthRequestMessage {
  type: 'zenmind:agent-app-auth:request';
  requestId: string;
  action: AppAuthRequestAction;
  reason: AppAccessTokenRefreshReason;
}

interface AppAuthResponseMessage {
  type: 'zenmind:agent-app-auth:response';
  requestId: string;
  token?: string | null;
}

const APP_AUTH_REQUEST_TYPE = 'zenmind:agent-app-auth:request';
const APP_AUTH_RESPONSE_TYPE = 'zenmind:agent-app-auth:response';
const APP_AUTH_TIMEOUT_MS = 10_000;
const APP_AUTH_SEEDED_TOKEN_POLL_MS = 25;
const APP_AUTH_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

let tokenRefreshPromise: Promise<string | null> | null = null;
let tokenRefreshPromiseReason: AppAccessTokenRefreshReason | null = null;
let latestRefreshRequestSeq = 0;

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = globalThis.atob(padded);
    const jsonText = decodeURIComponent(
      Array.from(decoded)
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed != null && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  const payload = decodeBase64UrlJson(parts[1]);
  const rawExp = payload?.exp;
  const expSeconds =
    typeof rawExp === 'number'
      ? rawExp
      : typeof rawExp === 'string'
        ? Number(rawExp)
        : NaN;
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    return null;
  }
  return expSeconds * 1000;
}

function normalizeUsableAccessToken(token: string | null | undefined): string | null {
  const normalized = typeof token === 'string' && token.trim() ? token.trim() : null;
  if (!normalized) {
    return null;
  }

  const expiresAt = readJwtExpiryMs(normalized);
  if (expiresAt != null && expiresAt - Date.now() <= APP_AUTH_TOKEN_REFRESH_SKEW_MS) {
    return null;
  }
  return normalized;
}

function readStoredToken(): string | null {
  try {
    syncStoredAuthContext();
    const token = window.sessionStorage.getItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY);
    const usableToken = normalizeUsableAccessToken(token);
    if (token && !usableToken) {
      window.sessionStorage.removeItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY);
    }
    return usableToken;
  } catch {
    return null;
  }
}

function readDesktopAuthContext(): string {
  if (typeof window === 'undefined' || !isAppMode()) {
    return '';
  }
  try {
    return new URLSearchParams(window.location.search || '')
      .get('desktopAuthContext')
      ?.trim() || '';
  } catch {
    return '';
  }
}

function syncStoredAuthContext(): void {
  const currentContext = readDesktopAuthContext();
  if (!currentContext) {
    return;
  }
  const storedContext = window.sessionStorage.getItem(AGENT_APP_AUTH_CONTEXT_STORAGE_KEY) || '';
  if (storedContext === currentContext) {
    return;
  }
  window.sessionStorage.removeItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY);
  window.sessionStorage.setItem(AGENT_APP_AUTH_CONTEXT_STORAGE_KEY, currentContext);
  if (typeof window !== 'undefined') {
    window.__AGENT_APP_ACCESS_TOKEN = undefined;
  }
}

function writeStoredToken(token: string | null): void {
  const normalized = normalizeUsableAccessToken(token);

  try {
    syncStoredAuthContext();
    if (normalized) {
      window.sessionStorage.setItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in embedded contexts.
  }

  if (typeof window !== 'undefined') {
    window.__AGENT_APP_ACCESS_TOKEN = normalized ?? undefined;
  }
}

function resolveWindowToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = normalizeUsableAccessToken(
    typeof window.__AGENT_APP_ACCESS_TOKEN === 'string'
      ? window.__AGENT_APP_ACCESS_TOKEN.trim()
      : '',
  );
  return token || null;
}

function createRequestId(): string {
  return `agent_app_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRequestAction(reason: AppAccessTokenRefreshReason): AppAuthRequestAction {
  return reason === 'unauthorized' ? 'refreshAccessToken' : 'getAccessToken';
}

export function getAppAccessToken(): string | null {
  return readStoredToken() ?? resolveWindowToken();
}

export async function refreshAppAccessToken(
  reason: AppAccessTokenRefreshReason,
): Promise<string | null> {
  if (
    typeof window === 'undefined' ||
    !isAppMode() ||
    !hasDesktopHostBridge()
  ) {
    const fallbackToken = getAppAccessToken();
    writeStoredToken(fallbackToken);
    return fallbackToken;
  }

  if (reason === 'unauthorized') {
    writeStoredToken(null);
  }

  if (
    tokenRefreshPromise &&
    !(reason === 'unauthorized' && tokenRefreshPromiseReason !== 'unauthorized')
  ) {
    return tokenRefreshPromise;
  }

  const refreshRequestSeq = ++latestRefreshRequestSeq;
  tokenRefreshPromiseReason = reason;

  const refreshPromise = new Promise<string | null>((resolve) => {
    const requestId = createRequestId();
    const requestMessage: AppAuthRequestMessage = {
      type: APP_AUTH_REQUEST_TYPE,
      requestId,
      action: getRequestAction(reason),
      reason,
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.clearInterval(seedPollId);
      window.removeEventListener('message', handleMessage as EventListener);
    };

    const finish = (token: string | null) => {
      const normalized = normalizeUsableAccessToken(token);
      if (refreshRequestSeq === latestRefreshRequestSeq) {
        writeStoredToken(normalized);
      }
      resolve(normalized);
    };

    const seedPollId = window.setInterval(() => {
      if (reason === 'unauthorized') {
        return;
      }
      const seededToken = getAppAccessToken();
      if (!seededToken) {
        return;
      }
      cleanup(timeoutId);
      finish(seededToken);
    }, APP_AUTH_SEEDED_TOKEN_POLL_MS);

    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) {
        return;
      }

      const payload = event.data as AppAuthResponseMessage | null;
      if (
        !payload ||
        payload.type !== APP_AUTH_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }

      cleanup(timeoutId);
      const token =
        typeof payload.token === 'string' && payload.token.trim()
          ? payload.token.trim()
          : null;
      finish(token);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      finish(null);
    }, APP_AUTH_TIMEOUT_MS);

    window.addEventListener('message', handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      finish(null);
    }
  }).finally(() => {
    if (tokenRefreshPromise === refreshPromise) {
      tokenRefreshPromise = null;
      tokenRefreshPromiseReason = null;
    }
  });

  tokenRefreshPromise = refreshPromise;
  return tokenRefreshPromise;
}
