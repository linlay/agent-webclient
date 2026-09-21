import { getBackendMode } from "@/shared/config/backendMode";
import { getProjectGit } from "@/shared/data/api/routedClient";
import type { ProjectGitResponse } from "@/shared/data/api/dto/resources";

export type GitState = ProjectGitResponse | { agentKey: string; status: "loading"; commit?: never };
interface Entry {
  value: GitState;
  expiresAt: number;
  listeners: Set<() => void>;
  request?: { controller: AbortController; promise: Promise<void> };
}

export function projectGitCacheKey(agentKey: string, workspaceDir?: string): string {
  const workspace = workspaceDir?.trim();
  if (!agentKey.trim() || !workspace || workspace === "@chat") return "";
  return JSON.stringify([getBackendMode(), globalThis.location?.origin || "", agentKey.trim(), workspace]);
}

export function isProjectGitSnapshot(data: ProjectGitResponse | undefined, agentKey: string): data is ProjectGitResponse {
  return !!data && data.agentKey === agentKey &&
    ["branch", "detached", "not_repository", "no_workspace", "unavailable"].includes(data.status) &&
    (data.status !== "branch" || typeof data.branch === "string" && !!data.branch.trim()) &&
    (data.status !== "detached" || typeof data.commit === "string" && !!data.commit.trim());
}

// Domain TTLs: real HEAD 30s, non-repositories 5m, transient failures 10s.
// No timer polls; callers refresh only when a visible New Chat needs the data.
export class ProjectGitCache {
  private entries = new Map<string, Entry>();

  private entry(key: string, agentKey: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: { agentKey, status: "loading" }, expiresAt: 0, listeners: new Set() };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private prune(): void {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 64) break;
      if (!entry.listeners.size && !entry.request) this.entries.delete(key);
    }
  }

  snapshot(key: string, agentKey: string): GitState | null {
    return key ? this.entry(key, agentKey).value : null;
  }

  subscribe(key: string, agentKey: string, listener: () => void): () => void {
    if (!key) return () => {};
    const entry = this.entry(key, agentKey);
    entry.listeners.add(listener);
    this.prune();
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size) {
        // StrictMode re-subscribes synchronously after cleanup. Give it a
        // microtask to reuse the request before cancelling an unused entry.
        const request = entry.request;
        void Promise.resolve().then(() => {
          if (entry.listeners.size || entry.request !== request) return;
          request?.controller.abort();
          entry.request = undefined;
          this.prune();
        });
      }
    };
  }

  put(key: string, value: ProjectGitResponse): void {
    if (!key) return;
    const entry = this.entry(key, value.agentKey);
    // A list/mutation result supersedes any older in-flight snapshot.
    entry.request?.controller.abort();
    entry.request = undefined;
    entry.value = value;
    const ttl = value.status === "not_repository" || value.status === "no_workspace" ? 300_000
      : value.status === "unavailable" ? 10_000 : 30_000;
    entry.expiresAt = Date.now() + ttl;
    entry.listeners.forEach(listener => listener());
    this.prune();
  }

  invalidate(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.expiresAt = 0;
    entry.request?.controller.abort();
    entry.request = undefined;
  }

  async refresh(key: string, agentKey: string): Promise<void> {
    if (!key) return;
    const entry = this.entry(key, agentKey);
    if (entry.request) return entry.request.promise;
    if (entry.expiresAt > Date.now()) return;
    const controller = new AbortController();
    const request = { controller, promise: Promise.resolve() };
    entry.request = request;
    request.promise = (async () => {
      let value: ProjectGitResponse;
      try {
        const response = await getProjectGit(agentKey, { signal: controller.signal });
        if (response.code !== 0 || !isProjectGitSnapshot(response.data, agentKey)) {
          throw new Error("Invalid project Git response");
        }
        value = response.data;
      } catch {
        value = { agentKey, status: "unavailable" };
      }
      // WS requests may finish after cancellation. Never overwrite a newer result.
      if (entry.request !== request || controller.signal.aborted) return;
      this.put(key, value);
    })();
    return request.promise;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.request?.controller.abort();
    this.entries.clear();
  }
}

export const projectGitCache = new ProjectGitCache();
