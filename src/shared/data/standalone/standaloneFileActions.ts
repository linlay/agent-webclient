import { isAppMode } from "@/shared/utils/routing";
import { t } from "@/shared/i18n";

const FILE_ACTIONS_PATH = "/__webclient_local__/files";

export type StandaloneFileAction = "reveal" | "open-default";
export type StandaloneFileCapabilities = {
  token: string;
  platform: "darwin" | "win32" | "linux";
  maxBytes: number;
};

export function canUseStandaloneFileActions(): boolean {
  return typeof window !== "undefined" && !isAppMode() &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

export async function getStandaloneFileCapabilities(): Promise<StandaloneFileCapabilities | null> {
  if (!canUseStandaloneFileActions()) return null;
  try {
    const response = await fetch(FILE_ACTIONS_PATH, {
      headers: { "X-Webclient-Local": "1" },
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.ok !== true || result.available !== true ||
        !/^[a-f0-9]{64}$/u.test(result.token) ||
        !["darwin", "win32", "linux"].includes(result.platform) ||
        !Number.isSafeInteger(result.maxBytes) || result.maxBytes <= 0) return null;
    return { token: result.token, platform: result.platform, maxBytes: result.maxBytes };
  } catch {
    return null;
  }
}

export async function requestStandaloneFileAction(
  action: StandaloneFileAction,
  filename: string,
  blob: Blob,
  capabilities: StandaloneFileCapabilities,
): Promise<void> {
  if (!canUseStandaloneFileActions()) throw new Error(t("contentViewer.localAction.unavailable"));
  if (blob.size > capabilities.maxBytes) throw new Error(t("contentViewer.localAction.tooLarge"));
  const response = await fetch(FILE_ACTIONS_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Webclient-Local": "1",
      "X-Webclient-Token": capabilities.token,
      "X-File-Action": action,
      "X-File-Name": encodeURIComponent(filename),
    },
    body: blob,
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error(t(result.code === "too_large"
      ? "contentViewer.localAction.tooLarge"
      : result.code === "unsupported_type"
        ? "contentViewer.localAction.unsupportedType"
        : "contentViewer.localAction.failed"));
  }
}
