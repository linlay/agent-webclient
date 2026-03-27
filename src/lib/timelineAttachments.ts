import type { TimelineAttachment } from '../context/types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function normalizeTimelineAttachments(items: unknown): TimelineAttachment[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.reduce<TimelineAttachment[]>((acc, item) => {
    if (!isObjectRecord(item)) {
      return acc;
    }

    const name = String(item.name || '').trim();
    if (!name) {
      return acc;
    }

    const rawSize = Number(item.size ?? item.sizeBytes);
    acc.push({
      name,
      size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : undefined,
    });
    return acc;
  }, []);
}
