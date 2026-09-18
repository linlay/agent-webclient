import { readSelectedText, reserveAnnotationIndex } from "@/shared/contracts/selectedTextReference";
import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function normalizeTimelineAttachments(items: unknown): TimelineAttachment[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const attachments = items.reduce<TimelineAttachment[]>((acc, item) => {
    if (!isObjectRecord(item)) {
      return acc;
    }

    if (item.type === "selection" && !readSelectedText(item).trim()) return acc;

    const name = String(item.name || (item.type === 'selection' ? 'Selected text' : '')).trim();
    if (!name) {
      return acc;
    }

    const rawSize = Number(item.size ?? item.sizeBytes);
    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : undefined;
    const type =
      typeof item.type === 'string' && item.type.trim()
        ? item.type.trim()
        : undefined;
    const mimeType =
      typeof item.mimeType === 'string' && item.mimeType.trim()
        ? item.mimeType.trim()
        : undefined;
    const url =
      typeof item.url === 'string' && item.url.trim()
        ? item.url.trim()
        : undefined;
    acc.push({
      name,
      ...(item.type === "selection" ? { text: readSelectedText(item), ...(reserveAnnotationIndex(item.annotationIndex) ? { annotationIndex: Number(item.annotationIndex) } : {}), ...(typeof item.annotation === "string" ? { annotation: item.annotation } : {}) } : {}),
      ...(id ? { id } : {}),
      ...(Number.isFinite(rawSize) && rawSize >= 0 ? { size: rawSize } : {}),
      ...(type ? { type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(url ? { url } : {}),
      ...(isObjectRecord(item.meta) ? { meta: { ...item.meta } } : {}),
    });
    return acc;
  }, []);

  const seenNames = new Set<string>();
  const latestAttachments: TimelineAttachment[] = [];
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const attachment = attachments[index];
    const identity = `${attachment.type || ''}\u0000${attachment.id || attachment.name}`;
    if (seenNames.has(identity)) {
      continue;
    }
    seenNames.add(identity);
    latestAttachments.push(attachment);
  }

  return latestAttachments.reverse();
}

export function hasTimelineAttachmentContent(attachments: readonly TimelineAttachment[]): boolean {
  return attachments.some(item => Boolean(item.url?.trim()) ||
    (item.type === 'selection' && Boolean(readSelectedText(item).trim())));
}
