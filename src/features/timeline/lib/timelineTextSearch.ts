import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type {
  TimelineDisplayItem,
  TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { stripSpecialBlocksFromText } from "@/features/events/lib/contentSegments";
import { marked } from "marked";

export interface TextSearchMatch {
  nodeId: string;
  nodeIndex: number;
  ordinalInNode: number;
  start: number;
  end: number;
}

export interface TextSearchResult {
  matches: TextSearchMatch[];
  total: number;
}

export function isSearchableTextNode(node: TimelineNode): boolean {
  if (node.kind === "content") return true;
  return node.kind === "message" && node.role === "user";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

export function markdownToPlainText(markdown: string): string {
  const raw = String(markdown ?? "").trim();
  if (!raw) return "";
  const html = marked.parse(raw, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;
  return decodeHtmlEntities(stripHtmlTags(html)).trim();
}

export function getNodeSearchableText(node: TimelineNode): string {
  if (node.kind === "content") {
    return markdownToPlainText(stripSpecialBlocksFromText(node.text || ""));
  }
  return node.text || "";
}

export function buildTextSearchMatches(
  nodes: TimelineNode[],
  query: string,
): TextSearchResult {
  const needle = String(query || "").trim();
  if (!needle) {
    return { matches: [], total: 0 };
  }

  const lowerNeedle = needle.toLowerCase();
  const matches: TextSearchMatch[] = [];

  nodes.forEach((node, nodeIndex) => {
    if (!isSearchableTextNode(node)) return;
    const text = getNodeSearchableText(node);
    if (!text) return;

    const lowerText = text.toLowerCase();
    let ordinalInNode = 0;
    let cursor = 0;
    let index = lowerText.indexOf(lowerNeedle, cursor);
    while (index !== -1) {
      ordinalInNode += 1;
      matches.push({
        nodeId: node.id,
        nodeIndex,
        ordinalInNode,
        start: index,
        end: index + needle.length,
      });
      cursor = index + needle.length;
      index = lowerText.indexOf(lowerNeedle, cursor);
    }
  });

  return { matches, total: matches.length };
}

function walkRenderEntry(
  entry: TimelineRenderEntry,
  virtualIndex: number,
  map: Map<string, number>,
): void {
  if (entry.kind === "node") {
    map.set(entry.node.id, virtualIndex);
    return;
  }
  if (entry.kind === "tool-group") {
    for (const node of entry.nodes) map.set(node.id, virtualIndex);
    return;
  }
  // task-group
  for (const node of entry.nodes) map.set(node.id, virtualIndex);
  for (const child of entry.renderEntries) {
    walkRenderEntry(child, virtualIndex, map);
  }
}

export function buildNodeVirtualIndexMap(
  displayItems: TimelineDisplayItem[],
): Map<string, number> {
  const map = new Map<string, number>();
  displayItems.forEach((item, index) => {
    if (item.kind === "query") {
      map.set(item.node.id, index);
      return;
    }
    if (item.kind === "run") {
      for (const node of item.nodes) map.set(node.id, index);
      return;
    }
    walkRenderEntry(item.renderEntry, index, map);
  });
  return map;
}

export interface NodeCollapseTargets {
  runKeyByNodeId: Map<string, string>;
  taskGroupKeyByNodeId: Map<string, string>;
}

function collectTaskGroupKeys(
  entries: TimelineRenderEntry[],
  taskGroupKeyByNodeId: Map<string, string>,
): void {
  for (const entry of entries) {
    if (entry.kind !== "task-group") continue;
    for (const node of entry.nodes) {
      taskGroupKeyByNodeId.set(node.id, entry.key);
    }
    collectTaskGroupKeys(entry.renderEntries, taskGroupKeyByNodeId);
  }
}

export function buildNodeCollapseTargets(
  displayItems: TimelineDisplayItem[],
): NodeCollapseTargets {
  const runKeyByNodeId = new Map<string, string>();
  const taskGroupKeyByNodeId = new Map<string, string>();
  for (const item of displayItems) {
    if (item.kind === "query") continue;
    if (item.kind === "run") {
      for (const node of item.nodes) runKeyByNodeId.set(node.id, item.key);
      collectTaskGroupKeys(item.renderEntries, taskGroupKeyByNodeId);
    } else {
      collectTaskGroupKeys([item.renderEntry], taskGroupKeyByNodeId);
    }
  }
  return { runKeyByNodeId, taskGroupKeyByNodeId };
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function matchModifier(
  event: KeyboardEvent,
  isMac: boolean,
): boolean {
  if (isMac)
    return event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName;
  return (
    tagName === "INPUT" || tagName === "TEXTAREA" || element.isContentEditable
  );
}
