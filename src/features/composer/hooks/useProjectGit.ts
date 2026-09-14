import { useEffect, useState } from "react";
import { getProjectGit } from "@/shared/data/api/requests/projects";
import type { ProjectGitResponse } from "@/shared/data/api/dto/resources";

type GitState = ProjectGitResponse | { agentKey: string; status: "loading"; commit?: never };

// Scoped to the mounted New Chat context bar, never blocks Agent detail loading.
export function useProjectGit(agentKey: string, workspaceDir?: string, refreshKey = 0, paused = false): GitState | null {
  const key = agentKey.trim();
  const [snapshot, setSnapshot] = useState<{ workspaceDir?: string; value: GitState } | null>(null);
  useEffect(() => {
    if (!key) { setSnapshot(null); return; }
    if (paused) return;
    let disposed = false;
    let requestId = 0;
    let controller: AbortController | undefined;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending) return;
      pending = true;
      const id = ++requestId;
      controller = new AbortController();
      setSnapshot({ workspaceDir, value: { agentKey: key, status: "loading" } });
      try {
        const response = await getProjectGit(key, { signal: controller.signal });
        const data = response.data;
        if (!data || response.code !== 0 || data.agentKey !== key ||
          !["branch", "detached", "not_repository", "no_workspace", "unavailable"].includes(data.status) ||
          (data.status === "branch" && !data.branch?.trim()) ||
          (data.status === "detached" && !data.commit?.trim())) {
          throw new Error("Invalid project Git response");
        }
        if (!disposed && id === requestId) setSnapshot({ workspaceDir, value: data });
      } catch {
        if (!disposed && id === requestId) setSnapshot({ workspaceDir, value: { agentKey: key, status: "unavailable" } });
      } finally {
        if (id === requestId) pending = false;
      }
    };
    const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(); };
    void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key, workspaceDir, refreshKey, paused]);
  if (!key) return null;
  // Do not expose the previous Agent even during the render preceding effect cleanup.
  if (snapshot?.value.agentKey !== key || snapshot.workspaceDir !== workspaceDir) return { agentKey: key, status: "loading" };
  return snapshot.value;
}
