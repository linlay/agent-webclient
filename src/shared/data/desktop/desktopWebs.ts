import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export const DESKTOP_WEBS_LIST_REQUEST_TYPE = "desktop:webs:list";
export const DESKTOP_WEBS_LIST_RESPONSE_TYPE = "desktop:webs:list:response";
const DESKTOP_WEBS_LIST_TIMEOUT_MS = 15_000;

export interface DesktopWebEntry {
  id: string;
  entryKey: string;
  label: string;
  kind: "website" | "webapp";
  url?: string;
  updatedAt?: number;
}

interface DesktopWebsListResponseMessage {
  type: typeof DESKTOP_WEBS_LIST_RESPONSE_TYPE;
  requestId?: string;
  ok?: boolean;
  message?: string;
  items?: unknown;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value: unknown): number | undefined {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0
    ? normalized
    : undefined;
}

export function normalizeDesktopWebEntries(value: unknown): DesktopWebEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries = value.reduce<DesktopWebEntry[]>((items, candidate) => {
    if (!candidate || typeof candidate !== "object") {
      return items;
    }
    const record = candidate as Record<string, unknown>;
    const kind =
      record.kind === "website" || record.kind === "webapp"
        ? record.kind
        : null;
    const id = normalizeText(record.id);
    const entryKey =
      normalizeText(record.entryKey) || (kind && id ? `${kind}:${id}` : "");
    const label = normalizeText(record.label);
    if (!kind || !id || !entryKey || !label) {
      return items;
    }
    const url =
      normalizeText(record.url) ||
      normalizeText(record.webUrl) ||
      normalizeText(record.publicUrl);
    items.push({
      id,
      entryKey,
      label,
      kind,
      ...(url ? { url } : {}),
      ...(normalizeTimestamp(record.updatedAt) !== undefined
        ? { updatedAt: normalizeTimestamp(record.updatedAt) }
        : {}),
    });
    return items;
  }, []);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.entryKey)) {
      return false;
    }
    seen.add(entry.entryKey);
    return true;
  });
}

export function canUseDesktopWebsBridge(): boolean {
  return typeof window !== "undefined" && hasDesktopHostBridge();
}

export function listDesktopWebEntries(): Promise<DesktopWebEntry[]> {
  if (!canUseDesktopWebsBridge()) {
    return Promise.reject(new Error("Desktop Sites are unavailable"));
  }

  return new Promise<DesktopWebEntry[]>((resolve, reject) => {
    const requestId = `desktop_webs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) {
        return;
      }
      const payload = event.data as DesktopWebsListResponseMessage | null;
      if (
        !payload ||
        payload.type !== DESKTOP_WEBS_LIST_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }
      cleanup(timeoutId);
      if (!payload.ok) {
        reject(new Error(normalizeText(payload.message) || "Failed to load Desktop Sites"));
        return;
      }
      resolve(normalizeDesktopWebEntries(payload.items));
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(new Error("Loading Desktop Sites timed out"));
    }, DESKTOP_WEBS_LIST_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);
    if (
      !postDesktopHostMessage({
        type: DESKTOP_WEBS_LIST_REQUEST_TYPE,
        requestId,
      })
    ) {
      cleanup(timeoutId);
      reject(new Error("Desktop Sites bridge is unavailable"));
    }
  });
}
