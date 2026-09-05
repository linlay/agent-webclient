import type {
  AdminAgentDetailResponse,
  AdminAgentDiagnostic,
} from "@/shared/data";

export const ADMIN_AGENT_IMPORT_MAX_BYTES = 32 * 1024 * 1024;

export type AgentArchiveFileValidationCode = "" | "type" | "empty" | "size";

export interface AgentImportConflict {
  agentKey: string;
  existingName: string;
}

export function validateAgentArchiveFile(
  file: Pick<File, "name" | "size"> | null,
): AgentArchiveFileValidationCode {
  if (!file || !file.name.toLowerCase().endsWith(".zip")) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > ADMIN_AGENT_IMPORT_MAX_BYTES) return "size";
  return "";
}

export function agentImportDiagnostics(error: unknown): AdminAgentDiagnostic[] {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return [];
  const errorData = (data as { error?: unknown }).error;
  if (!errorData || typeof errorData !== "object") return [];
  const diagnostics = (errorData as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const diagnostic = item as Record<string, unknown>;
    const message = String(diagnostic.message || "").trim();
    if (!message) return [];
    return [{
      severity: String(diagnostic.severity || "").trim() || "error",
      code: String(diagnostic.code || "").trim() || "invalid_archive",
      message,
      sourcePath: String(diagnostic.sourcePath || "").trim() || undefined,
    }];
  });
}

export function agentImportConflict(error: unknown): AgentImportConflict | null {
  if ((error as { status?: unknown } | null)?.status !== 409) return null;
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const errorData = (data as { error?: unknown }).error;
  if (!errorData || typeof errorData !== "object") return null;
  const conflict = errorData as Record<string, unknown>;
  if (conflict.overwriteRequired !== true) return null;
  const agentKey = String(conflict.agentKey || "").trim();
  if (!agentKey) return null;
  return {
    agentKey,
    existingName: String(conflict.existingName || "").trim(),
  };
}

export function confirmAgentDraftDiscard(
  hasUnsavedChanges: boolean,
  prompt: string,
  confirm: (message: string) => boolean = window.confirm,
): boolean {
  return !hasUnsavedChanges || confirm(prompt);
}

export function agentImportSuccessMessageKey(status: string): string {
  return status === "invalid"
    ? "agentConsole.import.invalid"
    : "agentConsole.import.success";
}

export function formatAgentArchiveSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

export async function importAgentArchiveWithOverwrite(
  file: File,
  importArchive: (
    file: File,
    overwrite: boolean,
  ) => Promise<AdminAgentDetailResponse>,
  confirmOverwrite: (conflict: AgentImportConflict) => Promise<boolean>,
): Promise<AdminAgentDetailResponse | null> {
  try {
    return await importArchive(file, false);
  } catch (error) {
    const conflict = agentImportConflict(error);
    if (!conflict) throw error;
    if (!(await confirmOverwrite(conflict))) return null;
    return importArchive(file, true);
  }
}
