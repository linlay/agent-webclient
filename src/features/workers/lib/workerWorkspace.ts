import type { WorkerRow } from "@/features/workers/lib/workerState";
import { openRegisteredAgentDirectory } from "@/shared/data/desktop/desktopFileSystem";

export function canOpenWorkerWorkspace(
  row: Pick<WorkerRow, "type" | "agentType" | "workspaceDir"> | null | undefined,
): boolean {
  return Boolean(
    row?.workspaceDir ||
      (row?.type === "agent" && row.agentType === "kbase"),
  );
}

export async function openWorkerDirectory(
  row: WorkerRow | undefined,
  directoryType: "workspace" | "config",
  t: (key: string) => string,
  appendDebug: (line: string) => void,
): Promise<void> {
  const isWorkspace = directoryType === "workspace";
  const path = String((isWorkspace ? row?.workspaceDir : row?.agentConfigDir) || "").trim();
  const agentKey = String(row?.sourceId || "").trim();
  const label = isWorkspace ? "workspace" : "config directory";
  const unavailable = t(isWorkspace
    ? "leftSidebar.workspaceUnavailable"
    : "leftSidebar.configDirectoryUnavailable");
  const canOpen = isWorkspace ? canOpenWorkerWorkspace(row) : Boolean(path && agentKey);
  if (!canOpen) {
    const reason = isWorkspace && row?.workspaceSourceKind === "browser-folder"
      ? t("leftSidebar.browserWorkspaceOpenUnavailable")
      : unavailable;
    appendDebug(`[${label}] ${reason}`);
    return;
  }
  try {
    const opened = await openRegisteredAgentDirectory({
      agentKey,
      directoryType,
      ...(path ? { desktopPath: path } : {}),
    });
    if (!opened) {
      appendDebug(`[${label}] ${unavailable}${path ? `: ${path}` : ""}`);
    }
  } catch (error) {
    appendDebug(`[${label} open error] ${(error as Error).message}`);
  }
}
