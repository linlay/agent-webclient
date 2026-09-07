import type { TranslateParams } from "@/shared/i18n";
import { t as runtimeT } from "@/shared/i18n";
import { toText } from "@/shared/utils/eventUtils";

type Translate = (key: string, params?: TranslateParams) => string;

export interface TerminalWorkerSummary {
  type: "agent" | "team";
  sourceId: string;
  raw: Record<string, unknown> | null;
  row: { workspaceDir?: string };
}

export type TerminalAvailability =
  | { readonly supported: true }
  | { readonly supported: false; readonly reason: string };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isChatWorkspaceKey(workspaceKey: string): boolean {
  return toText(workspaceKey).toLowerCase() === "@chat";
}

export function resolveTerminalDockWorkspaceKey(
  worker: TerminalWorkerSummary | null,
): string {
  if (!worker || worker.type !== "agent") return "";
  const raw = isObjectRecord(worker.raw) ? worker.raw : {};
  const meta = isObjectRecord(raw.meta) ? raw.meta : {};
  const workspace = isObjectRecord(raw.workspace) ? raw.workspace : {};
  const metaWorkspace = isObjectRecord(meta.workspace) ? meta.workspace : {};
  return toText(
    raw.workspaceDir ||
      workspace.root ||
      metaWorkspace.root ||
      worker.row.workspaceDir,
  );
}

export function resolveTerminalAvailability(
  worker: TerminalWorkerSummary | null,
  _workspaceKey: string,
  t: Translate = runtimeT,
): TerminalAvailability {
  if (!worker || worker.type !== "agent") {
    return { supported: false, reason: t("terminal.singleAgentOnly") };
  }
  return { supported: true };
}

export function resolveTerminalAvailabilityKey(
  worker: TerminalWorkerSummary | null,
  workspaceKey: string,
): string {
  if (!worker || worker.type !== "agent") {
    return ["none", toText(workspaceKey)].join("\u0000");
  }
  return [
    worker.type,
    toText(worker.sourceId),
    toText(workspaceKey),
  ].join("\u0000");
}
