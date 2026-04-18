import { isAppMode } from '@/shared/utils/routing';

export const AGENT_APP_ACCESS_TOKEN_STORAGE_KEY = 'agent-webclient.appAccessToken';

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

let tokenRefreshPromise: Promise<string | null> | null = null;

function readStoredToken(): string | null {
  try {
    const token = window.sessionStorage.getItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY);
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  const normalized = typeof token === 'string' && token.trim() ? token.trim() : null;

  try {
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

  const token =
    typeof window.__AGENT_APP_ACCESS_TOKEN === 'string'
      ? window.__AGENT_APP_ACCESS_TOKEN.trim()
      : '';
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
    !window.parent ||
    window.parent === window
  ) {
    const fallbackToken = getAppAccessToken();
    writeStoredToken(fallbackToken);
    return fallbackToken;
  }

  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  tokenRefreshPromise = new Promise<string | null>((resolve) => {
    const requestId = createRequestId();
    const requestMessage: AppAuthRequestMessage = {
      type: APP_AUTH_REQUEST_TYPE,
      requestId,
      action: getRequestAction(reason),
      reason,
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
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
      writeStoredToken(token);
      resolve(token);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      resolve(null);
    }, APP_AUTH_TIMEOUT_MS);

    window.addEventListener('message', handleMessage as EventListener);

    try {
      window.parent.postMessage(requestMessage, '*');
    } catch {
      cleanup(timeoutId);
      resolve(null);
    }
  }).finally(() => {
    tokenRefreshPromise = null;
  });

  return tokenRefreshPromise;
}
