import { getClientStorage } from "@/shared/utils/clientStorage";
export const ACCESS_TOKEN_STORAGE_KEY = 'agent-webclient.accessToken';

export function readStoredAccessToken(): string {
  try {
    const storage = getClientStorage("local");
    return String(storage?.getItem(ACCESS_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}
