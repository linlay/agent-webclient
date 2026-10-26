import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { ViewReference } from "@/shared/contracts/view";
import { parseContentSegments } from "@/features/events/lib/contentSegments";

export interface ViewPreviewAddress { chatId: string; runId: string; sourceId: string; viewIndex: string; }
export interface ViewPreviewContent { view?: ViewReference; viewError?: string; payloadRaw: string; rawData?: string; }
export const VIEW_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
export function viewPreviewKey(address: ViewPreviewAddress): string {
  return JSON.stringify([address.chatId, address.runId, address.sourceId, address.viewIndex]);
}
export function validViewPreviewAddress(value: unknown): value is ViewPreviewAddress {
  if (!value || typeof value !== "object") return false;
  const address = value as ViewPreviewAddress;
  return [address.chatId, address.runId, address.sourceId].every(part => typeof part === "string" && part.length > 0 && part.length <= 512 && !/[\u0000-\u001f]/u.test(part))
    && typeof address.viewIndex === "string" && /^(?:tool|0|[1-9]\d{0,5})$/u.test(address.viewIndex);
}
/** Resolves only the source node and Platform-bound block; never accepts a template from a URL. */
export function resolveViewPreview(nodes: ReadonlyMap<string, TimelineNode>, address: ViewPreviewAddress): ViewPreviewContent | null {
  if (!validViewPreviewAddress(address)) return null;
  const node = Array.from(nodes.values()).find(candidate => candidate.runId === address.runId &&
    (address.viewIndex === "tool" ? candidate.toolId === address.sourceId : candidate.contentId === address.sourceId));
  if (!node || node.runId !== address.runId) return null;
  if (address.viewIndex === "tool") {
    if (node.kind !== "tool" || !node.view || (node.viewChatId && node.viewChatId !== address.chatId)) return null;
    return { view: node.view, viewError: node.viewError, payloadRaw: node.result?.text || "{}" };
  }
  if (node.kind !== "content") return null;
  const index = Number(address.viewIndex);
  const segment = (node.segments || parseContentSegments(node.contentId || node.id, node.text || ""))
    .find(item => item.kind === "view" && item.closed && item.index === index);
  const binding = node.viewBindings?.[index];
  if (!segment || !binding) return null;
  return { view: binding.view, viewError: binding.viewError, payloadRaw: segment.payloadRaw || "{}", rawData: segment.payloadRaw };
}
