import { getAgents, type GetAgentsOptions } from "@/shared/data";
import type { WorkerListItem } from "./workerState";

// Projects use the complete workspace catalog; the general picker uses nav scope.
export async function readSidebarAgents(options: GetAgentsOptions = {}): Promise<WorkerListItem[]> {
  const responses = await Promise.all([
    getAgents({ ...options, scope: "nav",  hasWorkspace: false }),
    getAgents({ ...options, scope: undefined,  hasWorkspace: true }),
  ]);
  const byKey = new Map<string, WorkerListItem>();
  for (const response of responses) {
    for (const item of Array.isArray(response.data) ? response.data as WorkerListItem[] : []) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.key || "").trim();
      if (id) byKey.set(`agent:${id}`, item);
    }
  }
  return [...byKey.values()];
}
