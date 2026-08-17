import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAppState } from "@/app/state/AppContext";
import { OverviewContent } from "@/app/layout/sidebar/right/OverviewTab";
import { DebugPanelContent } from "@/app/layout/sidebar/right/DebugTab";
import { PlanningPreviewTab } from "@/app/layout/sidebar/right/PlanningPreviewTab";
import { SourceDetailTab } from "@/app/layout/sidebar/right/SourceDetailTab";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import {
  buildAttachmentPreviewState,
  getAttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import {
  findPersistedBTWSource,
  BTW_SESSION_STORAGE_KEY,
} from "@/features/btw/lib/btwPersistence";
import { BtwTab } from "@/features/btw/components/BtwTab";
import { useBTW } from "@/features/btw/components/BtwProvider";
import { useReadonlyRunSurfaceRuntime } from "@/features/surfaces/useReadonlyRunSurfaceRuntime";
import { WebPreviewPanel } from "@/features/web-preview/components/WebPreviewPanel";
import { isAllowedWebSurfaceUrl } from "@/features/surfaces/surfaceRoutes";
import { useI18n } from "@/shared/i18n";

type ChatSurfaceKind =
  | "overview"
  | "debug"
  | "planning"
  | "source"
  | "artifact"
  | "reference"
  | "btw";

const SURFACE_TITLE_KEYS: Record<ChatSurfaceKind, string> = {
  overview: "copilot.panel.overview",
  debug: "copilot.panel.debug",
  planning: "rightSidebar.overview.planning.title",
  source: "copilot.panel.sourceDetail",
  artifact: "rightSidebar.overview.artifacts.title",
  reference: "attachments.kind.file",
  btw: "btw.title",
};

const IndependentSurfaceFrame: React.FC<{
  kind: string;
  title: string;
  identity?: string;
  loading?: boolean;
  error?: string;
  children: React.ReactNode;
}> = ({ kind, title, identity, loading, error, children }) => (
  <main className={`readonly-run-surface readonly-run-surface-${kind}`}>
    <header className="readonly-run-surface-header">
      <strong>{title}</strong>
      <span>{identity || ""}</span>
    </header>
    {loading ? <div className="status-line">Loading…</div> : null}
    {error ? <div className="system-alert" role="alert">{error}</div> : null}
    <section className="readonly-run-surface-content">{children}</section>
  </main>
);

function findReferencePreview(
  state: ReturnType<typeof useAppState>,
  referenceId: string,
): AttachmentPreviewState | null {
  for (const node of state.timelineNodes.values()) {
    const reference = node.attachments?.find((item) => item.id === referenceId);
    if (!reference) continue;
    return buildAttachmentPreviewState(reference);
  }
  return null;
}

export const ChatSurfacePage: React.FC<{ kind: ChatSurfaceKind }> = ({ kind }) => {
  const params = useParams<{ agentKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useAppState();
  const { t } = useI18n();
  const agentKey = String(params.agentKey || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const planningId = String(searchParams.get("planningId") || "").trim();
  const publishId = String(searchParams.get("publishId") || "").trim();
  const sourceId = String(searchParams.get("sourceId") || "").trim();
  const btwId = String(searchParams.get("btwId") || "").trim();
  const artifactId = String(searchParams.get("artifactId") || "").trim();
  const referenceId = String(searchParams.get("referenceId") || "").trim();
  const runtime = useReadonlyRunSurfaceRuntime({
    chatId,
    agentKey,
    role: kind === "debug" ? "debug" : "overview",
  });
  const btw = useBTW();
  const btwSession = kind === "btw" ? btw.getSession(chatId) : null;
  const [storageRevision, setStorageRevision] = React.useState(0);
  const initializedBTWRouteRef = React.useRef("");
  const [btwRouteResolution, setBtwRouteResolution] = React.useState<"idle" | "ready" | "missing">("idle");

  React.useEffect(() => {
    if (kind !== "source" || !btwId) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === BTW_SESSION_STORAGE_KEY) setStorageRevision((value) => value + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [btwId, kind]);

  React.useEffect(() => {
    if (kind !== "btw" || runtime.status !== "ready" || !chatId) return;
    const routeKey = `${agentKey}\u0000${chatId}\u0000${btwId || "__new__"}`;
    if (initializedBTWRouteRef.current === routeKey) return;
    initializedBTWRouteRef.current = routeKey;
    const selected = btwId
      ? btwSession?.btwId === btwId || btw.selectBranch(chatId, btwId, agentKey)
      : btw.startNewBranch(chatId, agentKey);
    setBtwRouteResolution(selected ? "ready" : "missing");
    if (selected) btw.openBTW({ parentChatId: chatId });
  }, [agentKey, btw, btwId, btwSession?.btwId, chatId, kind, runtime.status]);

  React.useEffect(() => {
    if (kind !== "btw" || btwId || !btwSession?.btwId) return;
    const next = new URLSearchParams(searchParams);
    next.set("btwId", btwSession.btwId);
    setSearchParams(next, { replace: true });
  }, [btwId, btwSession?.btwId, kind, searchParams, setSearchParams]);

  const source = React.useMemo(() => {
    if (kind !== "source") return null;
    if (btwId) {
      return findPersistedBTWSource({ agentKey, parentChatId: chatId, btwId, publishId, sourceId });
    }
    for (const node of state.timelineNodes.values()) {
      if (node.kind !== "source" || node.sourcePublishId !== publishId) continue;
      return node.sources?.find((item) => item.id === sourceId) || null;
    }
    return null;
  }, [agentKey, btwId, chatId, kind, publishId, sourceId, state.timelineNodes, storageRevision]);

  const artifactPreview = React.useMemo(() => {
    if (kind !== "artifact") return null;
    const item = state.artifacts.find((candidate) => candidate.artifactId === artifactId);
    return item ? buildAttachmentPreviewState(item.artifact) : null;
  }, [artifactId, kind, state.artifacts]);

  const referencePreview = React.useMemo(
    () => kind === "reference" ? findReferencePreview(state, referenceId) : null,
    [kind, referenceId, state],
  );

  const identityMissing = !agentKey || !chatId ||
    (kind === "planning" && !planningId) ||
    (kind === "source" && (!publishId || !sourceId)) ||
    (kind === "artifact" && !artifactId) ||
    (kind === "reference" && !referenceId);
  const targetMissing = runtime.status === "ready" && (
    (kind === "planning" && !Array.from(state.timelineNodes.values()).some(
      (node) => node.kind === "planning" && node.planningId === planningId,
    )) ||
    (kind === "source" && !source) ||
    (kind === "artifact" && !artifactPreview) ||
    (kind === "reference" && !referencePreview) ||
    (kind === "btw" && btwRouteResolution === "missing")
  );
  const pageError = identityMissing || targetMissing
    ? t("platformError.code.invalid_request")
    : runtime.error;

  let content: React.ReactNode = null;
  if (!identityMissing && !targetMissing && (kind !== "btw" || btwRouteResolution === "ready")) {
    if (kind === "overview") content = <OverviewContent />;
    if (kind === "debug") content = <DebugPanelContent independentDetails />;
    if (kind === "planning") content = <PlanningPreviewTab planningId={planningId} />;
    if (kind === "source") content = <SourceDetailTab source={source} />;
    if (kind === "artifact" && artifactPreview) content = <AttachmentPreviewPanel preview={artifactPreview} />;
    if (kind === "reference" && referencePreview) content = <AttachmentPreviewPanel preview={referencePreview} />;
    if (kind === "btw") content = <BtwTab />;
  }

  return (
    <IndependentSurfaceFrame
      kind={kind}
      title={t(SURFACE_TITLE_KEYS[kind])}
      identity={chatId}
      loading={!identityMissing && (
        runtime.status === "loading" || (kind === "btw" && btwRouteResolution === "idle")
      )}
      error={pageError}
    >
      {content}
    </IndependentSurfaceFrame>
  );
};

export const FileSurfacePage: React.FC = () => {
  const params = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = String(params.agentKey || "").trim();
  const path = String(searchParams.get("path") || "").trim();
  const line = Number(searchParams.get("line") || 0);
  const name = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
  const detectedKind = getAttachmentPreviewKind({ name });
  const preview: AttachmentPreviewState | null = agentKey && path ? {
    name,
    url: `workspace-file:${encodeURIComponent(agentKey)}:${encodeURIComponent(path)}`,
    downloadUrl: "",
    kind: detectedKind === "unsupported" ? "text" : detectedKind,
    sourcePath: path,
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : undefined,
    workspaceFile: { agentKey, path },
  } : null;
  return (
    <IndependentSurfaceFrame
      kind="file"
      title={name || t("attachments.kind.file")}
      identity={path}
      error={preview ? "" : t("platformError.code.invalid_request")}
    >
      {preview ? <AttachmentPreviewPanel preview={preview} showLineNumbers /> : null}
    </IndependentSurfaceFrame>
  );
};

export const WebSurfacePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const url = String(searchParams.get("url") || "").trim();
  const title = String(searchParams.get("title") || "").trim() || url;
  const valid = isAllowedWebSurfaceUrl(url);
  return (
    <IndependentSurfaceFrame
      kind="web"
      title={title || t("copilot.panel.web")}
      identity={url}
      error={valid ? "" : t("platformError.code.invalid_request")}
    >
      {valid ? <WebPreviewPanel preview={{ url, title }} /> : null}
    </IndependentSurfaceFrame>
  );
};
