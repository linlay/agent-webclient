import type { WorkerRow } from "@/features/workers/lib/workerState";

export function canOpenWorkerWorkspace(
  row: Pick<WorkerRow, "type" | "agentType" | "workspaceDir"> | null | undefined,
): boolean {
  return Boolean(
    row?.workspaceDir ||
      (row?.type === "agent" && row.agentType === "kbase"),
  );
}
