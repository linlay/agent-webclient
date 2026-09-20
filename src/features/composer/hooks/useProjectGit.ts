import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { projectGitCache, projectGitCacheKey } from "@/features/composer/lib/projectGitCache";

// Scoped to the mounted New Chat context bar, never blocks Agent detail loading.
export function useProjectGit(agentKey: string, workspaceDir?: string, refreshKey = 0, paused = false) {
  const agent = agentKey.trim();
  const key = projectGitCacheKey(agent, workspaceDir);
  const previousRefresh = useRef({ key, refreshKey });
  const subscribe = useCallback((listener: () => void) => projectGitCache.subscribe(key, agent, listener), [key, agent]);
  const snapshot = useCallback(() => projectGitCache.snapshot(key, agent), [key, agent]);
  const git = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    const force = previousRefresh.current.key === key && previousRefresh.current.refreshKey !== refreshKey;
    previousRefresh.current = { key, refreshKey };
    if (!key || paused) return;
    if (force) projectGitCache.invalidate(key);
    const refresh = () => {
      if (document.visibilityState !== "hidden") void projectGitCache.refresh(key, agent);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, agent, refreshKey, paused]);
  return git;
}
