import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppState } from "@/app/state/AppContext";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import {
  buildTextSearchMatches,
  isEditableKeyboardTarget,
  isMacPlatform,
  isSearchableTextNode,
  matchModifier,
  type TextSearchResult,
} from "@/features/timeline/lib/timelineTextSearch";
import {
  clearHighlights,
  highlightAllRendered,
} from "@/features/timeline/lib/timelineTextSearchDom";

export interface TimelineTextSearchContextValue {
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
  matches: TextSearchResult;
  searchableNodeIds: Set<string>;
}

const TimelineTextSearchContext =
  createContext<TimelineTextSearchContextValue | null>(null);

export interface TimelineTextSearchProviderProps {
  children?: React.ReactNode;
}

export const TimelineTextSearchProvider: React.FC<
  TimelineTextSearchProviderProps
> = ({ children }) => {
  const state = useAppState();
  const nodes = useMemo<TimelineNode[]>(
    () =>
      state.timelineOrder
        .map((id) => state.timelineNodes.get(id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node)),
    [state.timelineOrder, state.timelineNodes],
  );

  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(
    () => buildTextSearchMatches(nodes, query),
    [nodes, query],
  );
  const total = matches.total;

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
    if (open && searchableNodeIds.size === 0) {
      closeSearch();
    }
  }, [closeSearch, open, searchableNodeIds]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeSearch();
        return;
      }

      if (event.defaultPrevented) return;

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

  const value = useMemo<TimelineTextSearchContextValue>(
    () => ({
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
      matches,
      searchableNodeIds,
    }),
    [
      activeIndex,
      closeSearch,
      goNext,
      goPrev,
      matches,
      open,
      openSearch,
      query,
      refreshHighlights,
      searchableNodeIds,
      total,
    ],
  );

  return (
    <TimelineTextSearchContext.Provider value={value}>
      {children}
    </TimelineTextSearchContext.Provider>
  );
};

export function useTimelineTextSearch(): TimelineTextSearchContextValue | null {
  return useContext(TimelineTextSearchContext);
}
