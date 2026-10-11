export const HTML_PREVIEW_LIMIT = 2;
export const HTML_PREVIEW_MIN_HEIGHT = 160;
export const HTML_PREVIEW_DEFAULT_HEIGHT = 360;
const CACHE_LIMIT = 200;

type CachedPreview = { height: number; blocked: boolean; enabled?: boolean };
const cache = new Map<string, CachedPreview>();
type SlotStatus = "active" | "queued";
const requests = new Map<string, { status?: SlotStatus; notify: (status: SlotStatus) => void }>();

export function htmlPreviewContentKey(source: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${source.length}:${left >>> 0}:${right >>> 0}`;
}

export function htmlPreviewCacheKey(contentKey: string, width: number): string {
  return `${contentKey}:${Math.round(width / 32) * 32}`;
}

export function getCachedHtmlPreview(key: string, fallbackKey?: string): CachedPreview {
  const value = cache.get(key);
  if (value) { cache.delete(key); cache.set(key, value); }
  return value || (fallbackKey ? cache.get(fallbackKey) : undefined) || { height: HTML_PREVIEW_DEFAULT_HEIGHT, blocked: false };
}

export function cacheHtmlPreview(key: string, patch: Partial<CachedPreview>): void {
  const value = { ...getCachedHtmlPreview(key), ...patch };
  if (!Number.isFinite(value.height) || value.height <= 0) value.height = HTML_PREVIEW_DEFAULT_HEIGHT;
  value.height = Math.max(HTML_PREVIEW_MIN_HEIGHT, value.height);
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function updateSlots(): void {
  let index = 0;
  for (const request of requests.values()) {
    const status = index++ < HTML_PREVIEW_LIMIT ? "active" : "queued";
    if (request.status !== status) { request.status = status; request.notify(status); }
  }
}

export function requestHtmlPreviewSlot(id: string, notify: (status: SlotStatus) => void): () => void {
  requests.set(id, { notify });
  updateSlots();
  return () => { requests.delete(id); updateSlots(); };
}

/** Let a visible waiting document take a slot without raising the iframe limit. */
export function prioritizeHtmlPreviewSlot(id: string): void {
  const request = requests.get(id);
  if (!request) return;
  const others = Array.from(requests).filter(([key]) => key !== id);
  requests.clear();
  requests.set(id, request);
  for (const [key, value] of others) requests.set(key, value);
  updateSlots();
}
