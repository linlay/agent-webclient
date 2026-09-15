import { useCallback, useEffect, useMemo, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { TimelineDisplayItem } from "@/features/timeline/lib/timelineDisplay";
import {
  buildNodeCollapseTargets,
  buildNodeVirtualIndexMap,
  buildTextSearchMatches,
  isEditableKeyboardTarget,
  isMacPlatform,
  isSearchableTextNode,
  matchModifier,
} from "@/features/timeline/lib/timelineTextSearch";

const MARK_CLASS = "timeline-text-search-mark";
const MARK_CURRENT_CLASS = "timeline-text-search-mark-current";

function applyMarkStyle(mark: HTMLElement, current: boolean): void {
  if (current) {
    mark.style.backgroundColor = "orange";
  } else {
    mark.style.backgroundColor = "yellow";
  }
}

function clearHighlights(): void {
  if (typeof document === "undefined") return;
  const marks = document.querySelectorAll(`mark.${MARK_CLASS}`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
  });
}

function collectTextNodes(root: Element): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  return textNodes;
}

function highlightContainer(
  root: Element,
  query: string,
  ordinal: number,
  scrollToCurrent: boolean,
): void {
  const needle = query.trim();
  const lowerNeedle = needle.toLowerCase();

  const textNodes = collectTextNodes(root);
  const texts = textNodes.map((node) => node.nodeValue || "");
  const offsets: number[] = [0];
  for (let i = 0; i < texts.length; i += 1) {
    offsets.push(offsets[i] + texts[i].length);
  }

  const fullText = texts.join("");
  const lowerFull = fullText.toLowerCase();

  const matchRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  let index = lowerFull.indexOf(lowerNeedle, cursor);
  while (index !== -1) {
    matchRanges.push({ start: index, end: index + needle.length });
    cursor = index + needle.length;
    index = lowerFull.indexOf(lowerNeedle, cursor);
  }

  if (matchRanges.length === 0) return;

  const matchMarks: HTMLElement[][] = matchRanges.map(() => []);

  for (let i = 0; i < textNodes.length; i += 1) {
    const node = textNodes[i];
    const text = texts[i];
    if (!text) continue;
    const nodeStart = offsets[i];
    const nodeEnd = offsets[i + 1];

    const fragments: Array<{
      matchIndex: number;
      start: number;
      end: number;
    }> = [];
    for (let m = 0; m < matchRanges.length; m += 1) {
      const start = Math.max(matchRanges[m].start, nodeStart);
      const end = Math.min(matchRanges[m].end, nodeEnd);
      if (start < end) {
        fragments.push({
          matchIndex: m,
          start: start - nodeStart,
          end: end - nodeStart,
        });
      }
    }
    if (fragments.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursorPos = 0;
    for (const piece of fragments) {
      if (piece.start > cursorPos) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursorPos, piece.start)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(piece.start, piece.end);
      applyMarkStyle(mark, false);
      fragment.appendChild(mark);
      matchMarks[piece.matchIndex].push(mark);
      cursorPos = piece.end;
    }
    if (cursorPos < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursorPos)));
    }
    node.parentNode?.replaceChild(fragment, node);
  }

  if (ordinal < 0) return;
  const currentGroup =
    matchMarks[Math.max(0, Math.min(ordinal - 1, matchMarks.length - 1))];
  for (const mark of currentGroup) {
    mark.classList.add(MARK_CURRENT_CLASS);
    applyMarkStyle(mark, true);
  }
  if (scrollToCurrent && currentGroup[0]) {
    currentGroup[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function highlightAllRendered(
  query: string,
  searchableNodeIds: Set<string>,
  activeNodeId: string | undefined,
  activeOrdinal: number,
  scrollToCurrent: boolean,
): void {
  clearHighlights();
  const needle = query.trim();
  if (!needle) return;
  document.querySelectorAll("[data-node-id]").forEach((container) => {
    const nodeId = container.getAttribute("data-node-id");
    if (!nodeId || !searchableNodeIds.has(nodeId)) return;
    const isActive = nodeId === activeNodeId;
    highlightContainer(
      container,
      needle,
      isActive ? activeOrdinal : -1,
      isActive && scrollToCurrent,
    );
  });
}

function waitForCurrentThenHighlightAll(
  nodeId: string,
  query: string,
  searchableNodeIds: Set<string>,
  activeNodeId: string | undefined,
  activeOrdinal: number,
): void {
  let attempts = 0;
  const attempt = () => {
    const root = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (root) {
      highlightAllRendered(
        query,
        searchableNodeIds,
        activeNodeId,
        activeOrdinal,
        true,
      );
      return;
    }
    attempts += 1;
    if (attempts < 60) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

export interface TimelineTextSearchApi {
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  total: number;
  activeIndex: number;
  goNext: () => void;
  goPrev: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  refreshHighlights: () => void;
}

export function useTimelineTextSearch(args: {
  nodes: TimelineNode[];
  displayItems: TimelineDisplayItem[];
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  expandedRunCollapses: Record<string, boolean>;
  expandedTaskGroups: Record<string, boolean>;
  onExpandRun: (key: string) => void;
  onExpandTaskGroup: (key: string) => void;
}): TimelineTextSearchApi {
  const {
    nodes,
    displayItems,
    virtuosoRef,
    expandedRunCollapses,
    expandedTaskGroups,
    onExpandRun,
    onExpandTaskGroup,
  } = args;
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(
    () => buildTextSearchMatches(nodes, query),
    [nodes, query],
  );
  const total = matches.total;
  const nodeVirtualIndexMap = useMemo(
    () => buildNodeVirtualIndexMap(displayItems),
    [displayItems],
  );
  const collapseTargets = useMemo(
    () => buildNodeCollapseTargets(displayItems),
    [displayItems],
  );
  const searchableNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const node of nodes) {
      if (isSearchableTextNode(node)) set.add(node.id);
    }
    return set;
  }, [nodes]);
  const activeMatch =
    activeIndex >= 0 ? matches.matches[activeIndex] : undefined;
  const activeNodeId = activeMatch?.nodeId;
  const activeOrdinal = activeMatch ? activeMatch.ordinalInNode : -1;
  const isMac = useMemo(() => isMacPlatform(), []);

  const refreshHighlights = useCallback(() => {
    if (!open) {
      clearHighlights();
      return;
    }
    highlightAllRendered(
      query,
      searchableNodeIds,
      activeNodeId,
      activeOrdinal,
      false,
    );
  }, [activeNodeId, activeOrdinal, open, query, searchableNodeIds]);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQueryState("");
    setActiveIndex(-1);
    clearHighlights();
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((current) => {
      if (total === 0) return -1;
      return (current + 1) % total;
    });
  }, [total]);

  const goPrev = useCallback(() => {
    setActiveIndex((current) => {
      if (total === 0) return -1;
      return current <= 0 ? total - 1 : current - 1;
    });
  }, [total]);

  useEffect(() => {
    setActiveIndex(total > 0 ? 0 : -1);
  }, [total]);

  useEffect(() => {
    if (!open) return;
    clearHighlights();
    if (activeIndex < 0) return;
    const match = matches.matches[activeIndex];
    if (!match) return;

    const runKey = collapseTargets.runKeyByNodeId.get(match.nodeId);
    if (runKey && !expandedRunCollapses[runKey]) onExpandRun(runKey);
    const taskGroupKey = collapseTargets.taskGroupKeyByNodeId.get(match.nodeId);
    if (taskGroupKey && !expandedTaskGroups[taskGroupKey]) {
      onExpandTaskGroup(taskGroupKey);
    }

    const virtualIndex = nodeVirtualIndexMap.get(match.nodeId);
    if (virtualIndex != null) {
      virtuosoRef.current?.scrollToIndex({
        index: virtualIndex,
        behavior: "smooth",
        align: "center",
      });
    }
    waitForCurrentThenHighlightAll(
      match.nodeId,
      query,
      searchableNodeIds,
      match.nodeId,
      match.ordinalInNode,
    );
  }, [
    activeIndex,
    collapseTargets,
    expandedRunCollapses,
    expandedTaskGroups,
    matches,
    nodeVirtualIndexMap,
    onExpandRun,
    onExpandTaskGroup,
    open,
    query,
    searchableNodeIds,
    virtuosoRef,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;

      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeSearch();
        return;
      }

      const target = event.target;
      if (
        isEditableKeyboardTarget(target) &&
        (target as HTMLElement).id !== "message-input"
      ) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(".ant-modal-wrap, .ant-drawer, .modal")
      ) {
        return;
      }
      if (matchModifier(event, isMac) && event.code === "KeyF") {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, isMac, open, openSearch]);

  useEffect(() => {
    return () => clearHighlights();
  }, []);

  return {
    open,
    query,
    setQuery: setQueryState,
    total,
    activeIndex,
    goNext,
    goPrev,
    openSearch,
    closeSearch,
    refreshHighlights,
  };
}
