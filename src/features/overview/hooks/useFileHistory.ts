import React from "react";
import { getFileHistory } from "@/shared/data";
import {
  buildFileHistoryCacheKey,
  type OverviewFileChangeItem,
} from "@/features/overview/lib/overviewViewModel";

export type FileHistoryCacheEntry =
  | { status: "loading" }
  | { status: "loaded"; original: string; current: string }
  | { status: "error" };

export type FileHistoryCache = Record<string, FileHistoryCacheEntry>;
type FileHistoryCacheUpdater = (
  update: (current: FileHistoryCache) => FileHistoryCache,
) => void;
type FileHistoryFetcher = typeof getFileHistory;

export async function loadFileHistoryForCache(params: {
  chatId: string;
  item: Pick<OverviewFileChangeItem, "runId" | "filePath">;
  cache: FileHistoryCache;
  updateCache: FileHistoryCacheUpdater;
  fetchHistory?: FileHistoryFetcher;
}): Promise<"loaded" | "error" | "skipped"> {
  const { chatId, item, cache, updateCache, fetchHistory = getFileHistory } = params;
  const cacheKey = buildFileHistoryCacheKey(chatId, item);
  if (!chatId || !item.runId || !item.filePath) {
    updateCache((current) => ({ ...current, [cacheKey]: { status: "error" } }));
    return "error";
  }
  const existing = cache[cacheKey];
  if (existing && existing.status !== "error") return "skipped";
  updateCache((current) => ({ ...current, [cacheKey]: { status: "loading" } }));
  try {
    const [original, current] = await Promise.all([
      fetchHistory({ chatId, runId: item.runId, filePath: item.filePath, version: "original" }),
      fetchHistory({ chatId, runId: item.runId, filePath: item.filePath, version: "current" }),
    ]);
    updateCache((nextCache) => ({
      ...nextCache,
      [cacheKey]: {
        status: "loaded",
        original: original.data.content || "",
        current: current.data.content || "",
      },
    }));
    return "loaded";
  } catch {
    updateCache((current) => ({ ...current, [cacheKey]: { status: "error" } }));
    return "error";
  }
}

export function useFileHistory(chatId: string) {
  const [cache, setCache] = React.useState<FileHistoryCache>({});
  React.useEffect(() => setCache({}), [chatId]);
  const load = React.useCallback(
    (item: OverviewFileChangeItem) => {
      void loadFileHistoryForCache({ chatId, item, cache, updateCache: setCache });
    },
    [cache, chatId],
  );
  return { cache, load };
}
