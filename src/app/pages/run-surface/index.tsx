import React, { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { OverviewContent } from "@/app/layout/sidebar/right/OverviewTab";
import { DebugPanelContent } from "@/app/layout/sidebar/right/DebugTab";
import { useReadonlyRunSurfaceRuntime } from "@/features/surfaces/useReadonlyRunSurfaceRuntime";
import { useI18n } from "@/shared/i18n";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import type { AttachmentPreviewKind, AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import { PlanningPreviewTab } from "@/app/layout/sidebar/right/PlanningPreviewTab";

const PREVIEW_KINDS = new Set<AttachmentPreviewKind>([
  "image", "pdf", "html", "text", "audio", "video", "office",
]);

function readArtifactPreview(searchParams: URLSearchParams): AttachmentPreviewState | null {
  if (searchParams.get("view") !== "artifact") return null;
  const kind = String(searchParams.get("kind") || "") as AttachmentPreviewKind;
  const name = String(searchParams.get("name") || "").trim();
  const url = String(searchParams.get("url") || "").trim();
  if (!name || !url || !PREVIEW_KINDS.has(kind) || kind === "unsupported") return null;
  const workspaceAgentKey = String(searchParams.get("workspaceAgentKey") || "").trim();
  const workspacePath = String(searchParams.get("workspacePath") || "").trim();
  const line = Number(searchParams.get("line") || 0);
  return {
    name,
    url,
    downloadUrl: String(searchParams.get("downloadUrl") || "").trim(),
    kind,
    type: String(searchParams.get("type") || "").trim() || undefined,
    mimeType: String(searchParams.get("mimeType") || "").trim() || undefined,
    sourcePath: String(searchParams.get("sourcePath") || "").trim() || undefined,
    line: Number.isFinite(line) && line > 0 ? line : undefined,
    workspaceFile: workspaceAgentKey && workspacePath
      ? { agentKey: workspaceAgentKey, path: workspacePath }
      : undefined,
  };
}

export const ReadonlyRunSurfacePage: React.FC<{
  kind: "overview" | "debug";
}> = ({ kind }) => {
  const params = useParams<{ agentKey?: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const chatId = useMemo(() => String(searchParams.get("chatId") || "").trim(), [searchParams]);
  const runId = useMemo(() => String(searchParams.get("runId") || "").trim(), [searchParams]);
  const agentKey = useMemo(
    () => String(searchParams.get("agentKey") || params.agentKey || "").trim(),
    [params.agentKey, searchParams],
  );
  const artifactPreview = useMemo(() => readArtifactPreview(searchParams), [searchParams]);
  const planningNodeId = useMemo(
    () => searchParams.get("view") === "planning" ? String(searchParams.get("nodeId") || "").trim() : "",
    [searchParams],
  );
  const runtime = useReadonlyRunSurfaceRuntime({
    chatId,
    runId: runId || undefined,
    agentKey: agentKey || undefined,
    role: kind,
  });

  return (
    <main className={`readonly-run-surface readonly-run-surface-${kind}`}>
      <header className="readonly-run-surface-header">
        <strong>{kind === "overview" ? t("copilot.panel.overview") : t("copilot.panel.debug")}</strong>
        <span>{chatId || t("platformError.code.invalid_request")}</span>
      </header>
      {runtime.status === "loading" ? <div className="status-line">{t("composer.addMenu.loading")}</div> : null}
      {runtime.error ? <div className="system-alert" role="alert">{runtime.error}</div> : null}
      <section className="readonly-run-surface-content">
        {kind === "debug" ? (
          <DebugPanelContent independentDetails />
        ) : artifactPreview ? (
          <AttachmentPreviewPanel preview={artifactPreview} />
        ) : planningNodeId ? (
          <PlanningPreviewTab nodeId={planningNodeId} />
        ) : (
          <OverviewContent />
        )}
      </section>
    </main>
  );
};
