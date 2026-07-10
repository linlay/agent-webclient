export const ACCESS_TOKEN_STORAGE_KEY = 'agent-webclient.accessToken';

export function readStoredAccessToken(): string {
  try {
    const storage =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : typeof localStorage !== 'undefined'
          ? localStorage
          : null;
    return String(storage?.getItem(ACCESS_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}
