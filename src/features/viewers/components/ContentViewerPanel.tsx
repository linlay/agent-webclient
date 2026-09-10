import React from "react";
import {
  commitDocument,
  getAgentFile,
  type AgentFileResponse,
} from "@/shared/data";
import {
  downloadViewerTarget,
  limitViewerText,
  readViewerResourceDocument,
  readViewerResourceMetadata,
} from "@/features/viewers/lib/viewerRuntime";
import {
  detectDocumentContentKind,
  detectViewerContentKind,
  isViewerContentSupported,
  isKnownTextDocumentName,
  type ViewerContentKind,
  type ViewerTarget,
  viewerContentKindForDocument,
} from "@/features/viewers/lib/viewerTarget";
import type { DocumentContentKind } from "@/shared/types/document";
import { t } from "@/shared/i18n";
import { Button, Image, message } from "antd";
import { useAppState } from "@/app/state/AppContext";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import {
  useDesktopContextMenuTarget,
  useDesktopCurrentResourceDownload,
} from "@/shared/data/desktop/desktopContextMenu";
import { useDesktopHtmlPreviewReview } from "@/features/viewers/hooks/useDesktopHtmlPreviewReview";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  canUseDesktopCurrentResourceActions,
  checkDesktopCurrentResourceActionsAvailable,
  detectDesktopFileManager,
  requestDesktopCurrentResourceAction,
  resolveDesktopCurrentResourceIdentity,
  type DesktopCurrentResourceAction,
  type DesktopCurrentResourceIdentity,
} from "@/shared/data/desktop/desktopCurrentResourceAction";
import { DocumentTextEditor } from "@/features/viewers/components/DocumentTextEditor";
import { BrowserImageEditor } from "@/features/viewers/components/BrowserImageEditor";
import { StandaloneDocumentPanel } from "@/features/viewers/components/StandaloneDocumentPanel";
import { OnlineDocumentPreview, OnlinePreviewAction } from "./OnlineDocumentPreview";
import { useOnlineDocumentPreview } from "../hooks/useOnlineDocumentPreview";
import { getDocumentPreviewTabKey, type DocumentPreviewTabState } from "../lib/documentPreview";
import { isAppMode } from "@/shared/utils/routing";
import { isDocxDocument } from "@/features/viewers/lib/docxPreview";
import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

const PdfDocumentViewer = process.env.NODE_ENV === "test"
  ? ({ url, title }: { url: string; title: string }) => <iframe src={url} title={title} />
  : React.lazy(async () => {
      const module = await import("@/features/viewers/components/PdfDocumentViewer");
      return { default: module.PdfDocumentViewer };
    });

const DocxDocumentViewer = React.lazy(async () => {
  const module = await import("@/features/viewers/components/DocxDocumentViewer");
  return { default: module.DocxDocumentViewer };
});

const CONTENT_VIEWER_PANEL_CLASS_NAME =
  "content-viewer-panel tw:flex tw:h-full tw:flex-col";

const CONTENT_VIEWER_BODY_CLASS_NAME =
  "content-viewer-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2.5 tw:overflow-auto";

const CONTENT_VIEWER_STATUS_CLASS_NAME = "status-line tw:m-2.5";

const CONTENT_VIEWER_VIDEO_CLASS_NAME =
  "content-viewer-video tw:block tw:h-auto tw:max-h-full tw:w-full tw:rounded-[14px] tw:bg-[color-mix(in_srgb,var(--bg-input)_82%,white)] tw:object-contain";

const CONTENT_VIEWER_FRAME_CLASS_NAME =
  "content-viewer-frame tw:min-h-[480px] tw:w-full tw:flex-1 tw:border-0 tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))]";

const CONTENT_VIEWER_TEXT_CLASS_NAME =
  "content-viewer-text tw:m-0 tw:min-h-full tw:flex-1 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:p-3.5 tw:font-code tw:text-xs tw:leading-[1.6] tw:text-ink-1";

const CONTENT_VIEWER_TEXT_WITH_LINES_CLASS_NAME =
  "content-viewer-text content-viewer-text-lines tw:m-0 tw:min-h-full tw:flex-1 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:p-0 tw:font-code tw:text-xs tw:leading-[1.6] tw:text-ink-1";

const CONTENT_VIEWER_LINE_CLASS_NAME =
  "content-viewer-line tw:grid tw:min-h-[1.6em] tw:grid-cols-[4.25rem_minmax(0,1fr)] tw:py-0";

const CONTENT_VIEWER_LINE_NUMBER_CLASS_NAME =
  "content-viewer-line-number tw:select-none tw:border-r tw:border-line-soft tw:pr-3 tw:text-right tw:text-ink-muted";

const CONTENT_VIEWER_LINE_CONTENT_CLASS_NAME =
  "content-viewer-line-content tw:min-w-0 tw:whitespace-pre-wrap tw:break-words tw:px-3.5";

const CONTENT_VIEWER_TARGET_LINE_CLASS_NAME =
  "is-target tw:bg-[color-mix(in_srgb,var(--accent-electric)_16%,transparent)] tw:text-ink-1";

const CONTENT_VIEWER_MEDIA_SHELL_CLASS_NAME =
  "content-viewer-media-shell tw:rounded-[14px] tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_82%,white)] tw:px-3.5 tw:py-[18px] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))]";

const CONTENT_VIEWER_AUDIO_CLASS_NAME =
  "content-viewer-audio tw:w-full";

const CONTENT_VIEWER_NOTE_CLASS_NAME =
  "content-viewer-note tw:px-3 tw:pb-3 tw:pt-0 tw:text-[11px] tw:leading-[1.5] tw:text-ink-muted";

const CONTENT_VIEWER_LOCAL_ACTIONS_CLASS_NAME =
  "content-viewer-local-actions tw:flex tw:min-h-0 tw:flex-1 tw:items-center tw:justify-center tw:p-6";

const CONTENT_VIEWER_LOCAL_ACTIONS_GROUP_CLASS_NAME =
  "content-viewer-local-actions-group tw:flex tw:w-full tw:max-w-[240px] tw:flex-col tw:gap-3";

const CONTENT_VIEWER_LOCAL_ACTION_ERROR_CLASS_NAME =
  "content-viewer-local-action-error tw:rounded-lg tw:bg-[color-mix(in_srgb,#ff4d4f_10%,transparent)] tw:px-3 tw:py-2 tw:text-center tw:text-xs tw:leading-[1.5] tw:text-[#cf1322]";

interface ContentViewerPanelProps {
  target: ViewerTarget;
  showLineNumbers?: boolean;
  fullscreenRequest?: number;
  refreshRequest?: number;
  enableDesktopCurrentResourceDownload?: boolean;
  enableDesktopLocalResourceActions?: boolean;
  enableDesktopPreviewReview?: boolean;
  onOpenOnlinePreview?: (preview: DocumentPreviewTabState) => void;
  surfaceContext?: {
    chatId: string;
    teamChat?: boolean;
  };
}

export interface ViewerTextLine {
  lineNumber: number;
  text: string;
  target: boolean;
}

export function buildViewerTextLines(
  content: string,
  targetLine?: number,
): ViewerTextLine[] {
  const normalizedTargetLine =
    Number.isFinite(targetLine) && Number(targetLine) > 0
      ? Math.floor(Number(targetLine))
      : 0;
  const lines = content.split(/\r\n|\n|\r/);
  return lines.map((text, index) => {
    const lineNumber = index + 1;
    return {
      lineNumber,
      text,
      target: lineNumber === normalizedTargetLine,
    };
  });
}

export function resolveFileViewerContentKind(
  response: AgentFileResponse | null,
  fallbackKind: ViewerContentKind,
): ViewerContentKind {
  if (!response) {
    return fallbackKind;
  }
  if (response.documentKind) {
    return viewerContentKindForDocument(response.documentKind);
  }
  const detectedKind = detectViewerContentKind({
    name: response.name,
    mimeType: response.mimeType,
  });
  if (detectedKind === "html") {
    return "html";
  }
  if (response.contentKind === "text") {
    return "text";
  }
  return detectedKind;
}

export function resolveViewerDocumentKind(
  response: AgentFileResponse | null,
  target: ViewerTarget,
  resourceKind?: DocumentContentKind,
): DocumentContentKind {
  return response?.documentKind
    || resourceKind
    || target.documentKind
    || detectDocumentContentKind({
      name: response?.name || target.name,
      mimeType: response?.mimeType || (target.type === "resource" ? target.mimeType : undefined),
      contentKind: response ? undefined : target.contentKind,
    });
}

export function resolveFileViewerHtml(
  response: AgentFileResponse | null,
): string | null {
  if (
    !response ||
    response.contentKind !== "text" ||
    response.truncated
  ) {
    return null;
  }
  return response.content || "";
}

export function resolveContentViewerErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback;
}

export function shouldRequestDesktopLocalResourceActions(input: {
  bridgeAvailable: boolean;
  contentKind: ViewerContentKind;
  enabled: boolean;
  identityAvailable: boolean;
  targetType: ViewerTarget["type"];
}): boolean {
  return input.enabled &&
    input.bridgeAvailable &&
    input.identityAvailable &&
    input.targetType === "resource" &&
    (input.contentKind === "office" || input.contentKind === "unsupported");
}

export const DesktopLocalResourceActions: React.FC<{
  resource: DesktopCurrentResourceIdentity;
}> = ({ resource }) => {
  const [pendingAction, setPendingAction] =
    React.useState<DesktopCurrentResourceAction | null>(null);
  const [actionError, setActionError] = React.useState("");
  const fileManager = detectDesktopFileManager();
  const revealLabel = t(
    fileManager === "finder"
      ? "contentViewer.desktopAction.revealInFinder"
      : fileManager === "explorer"
        ? "contentViewer.desktopAction.revealInExplorer"
        : "contentViewer.desktopAction.revealInFileManager",
  );
  const handleAction = React.useCallback(async (
    action: DesktopCurrentResourceAction,
  ) => {
    if (pendingAction) return;
    setPendingAction(action);
    setActionError("");
    try {
      const result = await requestDesktopCurrentResourceAction(action, resource);
      if (!result.ok) {
        setActionError(
          result.message || t("contentViewer.desktopAction.failed"),
        );
      }
    } catch {
      setActionError(t("contentViewer.desktopAction.failed"));
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, resource]);

  return (
    <div className={CONTENT_VIEWER_LOCAL_ACTIONS_CLASS_NAME}>
      <div
        className={CONTENT_VIEWER_LOCAL_ACTIONS_GROUP_CLASS_NAME}
        role="group"
        aria-label={t("contentViewer.desktopAction.groupLabel")}
      >
        <Button
          block
          disabled={pendingAction !== null}
          icon={<MaterialIcon name="folder_open" />}
          loading={pendingAction !== null}
          onClick={() => void handleAction("reveal")}
        >
          {revealLabel}
        </Button>
        <Button
          block
          type="primary"
          disabled={pendingAction !== null}
          icon={<MaterialIcon name="open_in_new" />}
          loading={pendingAction !== null}
          onClick={() => void handleAction("open-default")}
        >
          {t("contentViewer.desktopAction.openDefault")}
        </Button>
        {actionError ? (
          <div
            className={CONTENT_VIEWER_LOCAL_ACTION_ERROR_CLASS_NAME}
            role="alert"
          >
            {actionError}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const ContentViewerPanel: React.FC<ContentViewerPanelProps> = ({
  target,
  showLineNumbers = false,
  fullscreenRequest,
  refreshRequest = 0,
  enableDesktopCurrentResourceDownload = false,
  enableDesktopLocalResourceActions = false,
  enableDesktopPreviewReview = false,
  onOpenOnlinePreview,
  surfaceContext,
}) => {
  const appState = useAppState();
  const chatId = String(surfaceContext?.chatId ?? (target.type === "resource" ? target.source?.chatId : undefined) ?? appState.chatId ?? "").trim();
  const currentChat = appState.chats?.find((chat) => chat.chatId === chatId);
  const teamChat = surfaceContext?.teamChat ?? Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  const [workspaceFile, setWorkspaceFile] =
    React.useState<AgentFileResponse | null>(null);
  const [textContent, setTextContent] = React.useState("");
  const [savedTextContent, setSavedTextContent] = React.useState("");
  const [documentRevision, setDocumentRevision] = React.useState("");
  const [resourceDocumentKind, setResourceDocumentKind] =
    React.useState<DocumentContentKind | undefined>();
  const [resourceMimeType, setResourceMimeType] = React.useState("");
  const [resourceSizeBytes, setResourceSizeBytes] = React.useState<number | undefined>();
  const [documentReloadRequest, setDocumentReloadRequest] = React.useState(0);
  const [documentSaving, setDocumentSaving] = React.useState(false);
  const [documentAnnotationCount, setDocumentAnnotationCount] = React.useState(0);
  const [browserImageState, setBrowserImageState] = React.useState({ dirty: false, busy: false, annotationCount: 0 });
  const [resourceHtmlContent, setResourceHtmlContent] = React.useState<string | null>(null);
  const [textTruncated, setTextTruncated] = React.useState(false);
  const [textLoading, setTextLoading] = React.useState(false);
  const [textError, setTextError] = React.useState("");
  const [mediaError, setMediaError] = React.useState("");
  const [desktopLocalActionsAvailable, setDesktopLocalActionsAvailable] =
    React.useState(false);
  const textContainerRef = React.useRef<HTMLPreElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const contextTargetId = React.useId();
  const fileRequest = React.useMemo(
    () => target.type === "file"
      ? { agentKey: target.agentKey, path: target.path }
      : undefined,
    [target],
  );
  const workspaceFileResponse =
    fileRequest &&
    workspaceFile?.agentKey === fileRequest.agentKey &&
    workspaceFile.requestedPath === fileRequest.path
      ? workspaceFile
      : null;
  const fallbackContentKind = resolveFileViewerContentKind(
    workspaceFileResponse,
    target.contentKind,
  );
  const documentKind = resolveViewerDocumentKind(
    workspaceFileResponse,
    target,
    resourceDocumentKind,
  );
  const contentKind = workspaceFileResponse?.documentKind || resourceDocumentKind
    ? viewerContentKindForDocument(documentKind)
    : fallbackContentKind;
  const viewerUrl = fileRequest
    ? workspaceFileResponse?.contentUrl || ""
    : target.type === "resource" ? target.url : "";
  const mediaSource = ["image", "pdf", "html", "audio", "video"].includes(contentKind)
    ? viewerUrl
    : "";
  const authenticatedResource = useAuthenticatedResourceUrl(mediaSource, chatId, {
    teamChat,
    refreshKey: documentReloadRequest ? `${contextTargetId}:${documentReloadRequest}` : undefined,
  });
  const mediaUrl = authenticatedResource.url;
  const viewerName = workspaceFileResponse?.name || target.name;
  const docxPreview = documentKind === "document-office" && isDocxDocument(viewerName);
  const onlinePreview = useOnlineDocumentPreview({
    target, chatId, name: viewerName,
    sizeBytes: workspaceFileResponse?.sizeBytes ?? resourceSizeBytes ?? (target.type === "resource" ? target.sizeBytes : undefined),
    refreshKey: documentReloadRequest,
    onReady: onOpenOnlinePreview ? (result) => onOpenOnlinePreview({
      key: getDocumentPreviewTabKey(target, chatId),
      target: { ...target, name: viewerName },
      chatId,
      teamChat,
      result,
    }) : undefined,
  });
  const fileHtml = resolveFileViewerHtml(
    workspaceFileResponse,
  );
  const viewerHtml = fileRequest ? fileHtml : resourceHtmlContent;
  const htmlReview = useDesktopHtmlPreviewReview({
    enabled: enableDesktopPreviewReview && contentKind === "html" && viewerHtml !== null,
    fileName: viewerName,
    sourceKey: JSON.stringify(target),
    html: viewerHtml,
    baseUrl: viewerUrl,
  });
  const handleDownload = React.useCallback(async () => {
    try {
      await downloadViewerTarget(target, {
        chatId,
        teamChat,
      });
    } catch (error: unknown) {
      message.error(
        error instanceof Error
          ? error.message
          : t("contentViewer.error.download"),
      );
    }
  }, [chatId, target, teamChat]);
  useDesktopCurrentResourceDownload(
    enableDesktopCurrentResourceDownload ? handleDownload : null,
  );
  const contextTarget = React.useMemo(() => ({
    targetId: `viewer-resource:${contextTargetId}`,
    kind: "chat-resource" as const,
    name: viewerName,
    mediaType: contentKind === "image" ? "image" as const : "file" as const,
    handlers: {
      "download-resource": handleDownload,
    },
  }), [contentKind, contextTargetId, handleDownload, viewerName]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  const setPanelElement = React.useCallback((element: HTMLDivElement | null) => {
    panelRef.current = element;
    contextTargetRef(element);
  }, [contextTargetRef]);

  React.useEffect(() => {
    setMediaError("");
  }, [contentKind, viewerUrl]);

  React.useEffect(() => {
    if (authenticatedResource.error) {
      setMediaError(t("contentViewer.error.loadText"));
    }
  }, [authenticatedResource.error]);

  React.useEffect(() => {
    setWorkspaceFile(null);
    setResourceHtmlContent(null);
    setSavedTextContent("");
    setDocumentRevision("");
    setResourceDocumentKind(undefined);
    setResourceMimeType("");
    setResourceSizeBytes(undefined);
    setDocumentSaving(false);
    setDocumentAnnotationCount(0);
    setBrowserImageState({ dirty: false, busy: false, annotationCount: 0 });

    if (fileRequest) {
      let disposed = false;
      setTextLoading(true);
      setTextError("");
      setTextContent("");
      setTextTruncated(false);

      void getAgentFile(fileRequest)
        .then((response) => {
          if (disposed) return;
          const file = response.data;
          setWorkspaceFile(file);
          const content = file.contentKind === "text" ? file.content || "" : "";
          setTextContent(content);
          setSavedTextContent(content);
          setDocumentRevision(String(file.revision || ""));
          setTextTruncated(file.truncated);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          setTextError(resolveContentViewerErrorMessage(
            error,
            t("contentViewer.error.loadText"),
          ));
        })
        .finally(() => {
          if (!disposed) {
            setTextLoading(false);
          }
        });

      return () => {
        disposed = true;
      };
    }

    if (
      target.type !== "resource" ||
      (target.contentKind !== "text" && target.contentKind !== "html")
    ) {
      setTextContent("");
      setTextTruncated(false);
      setTextLoading(false);
      setTextError("");
      return;
    }

    const controller = new AbortController();
    setTextLoading(true);
    setTextError("");
    setTextContent("");
    setTextTruncated(false);

    void readViewerResourceDocument(target.url, chatId, controller.signal, teamChat)
      .then((document) => {
        const limitedText = limitViewerText(document.content);
        setDocumentRevision(document.revision || target.revision || "");
        setResourceDocumentKind(document.documentKind);
        setResourceMimeType(document.mimeType || target.mimeType || "");
        setResourceSizeBytes(document.sizeBytes);
        const loadedKind = document.documentKind || target.documentKind;
        if (loadedKind === "document-html" || target.contentKind === "html") {
          setResourceHtmlContent(limitedText.content);
          setTextContent(limitedText.content);
          setSavedTextContent(limitedText.content);
        } else {
          setTextContent(limitedText.content);
          setSavedTextContent(limitedText.content);
        }
        setTextTruncated(limitedText.truncated);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setTextError(
          error instanceof Error
            ? error.message
            : t("contentViewer.error.loadText"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTextLoading(false);
        }
      });

    return () => controller.abort();
  }, [chatId, documentReloadRequest, fileRequest, target, teamChat]);

  React.useEffect(() => {
    if (target.type !== "resource") return;
    const controller = new AbortController();
    void readViewerResourceMetadata(target.url, chatId, controller.signal, teamChat)
      .then(async (metadata) => {
        if (controller.signal.aborted) return;
        setDocumentRevision(metadata.revision || target.revision || "");
        setResourceDocumentKind(metadata.documentKind);
        setResourceMimeType(metadata.mimeType || target.mimeType || "");
        setResourceSizeBytes(metadata.sizeBytes);
        const textKind = metadata.documentKind === "document-html" ||
          metadata.documentKind === "document-markdown" ||
          metadata.documentKind === "document-text" ||
          metadata.documentKind === "document-code";
        if (!textKind || target.contentKind === "text" || target.contentKind === "html") return;
        setTextLoading(true);
        const document = await readViewerResourceDocument(target.url, chatId, controller.signal, teamChat);
        if (controller.signal.aborted) return;
        const limited = limitViewerText(document.content);
        setTextContent(limited.content);
        setSavedTextContent(limited.content);
        setTextTruncated(limited.truncated);
        if (document.documentKind === "document-html") setResourceHtmlContent(limited.content);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setTextLoading(false);
      });
    return () => controller.abort();
  }, [chatId, documentReloadRequest, target, teamChat]);

  React.useEffect(() => {
    if (
      fullscreenRequest !== undefined &&
      fullscreenRequest > 0 &&
      panelRef.current
    ) {
      panelRef.current.requestFullscreen().catch(() => {
        // Fullscreen 可能被浏览器拒绝，静默忽略
      });
    }
  }, [fullscreenRequest]);

  React.useEffect(() => {
    if (target.type !== "file" || !target.line || contentKind !== "text" || textLoading || textError) {
      return;
    }
    const container = textContainerRef.current;
    if (!container) return;

    const lineElement = container.querySelector<HTMLElement>(
      `[data-viewer-line="${target.line}"]`,
    );
    if (!lineElement) return;

    window.requestAnimationFrame(() => {
      lineElement.scrollIntoView({ block: "center" });
    });
  }, [contentKind, target, textContent, textError, textLoading]);

  const editableTextDocument =
    documentKind === "document-html" ||
    documentKind === "document-markdown" ||
    documentKind === "document-text" ||
    documentKind === "document-code";
  const resourceSource = target.type === "resource" ? target.source : undefined;
  const imageMimeType = workspaceFileResponse?.mimeType || (target.type === "resource" ? target.mimeType : "") || "";
  const imageCommitSource = target.type === "file"
    ? { kind: "workspace-file" as const, agentKey: target.agentKey, path: target.path }
    : resourceSource;
  const browserImageEditable = !hasDesktopHostBridge() && contentKind === "image" &&
    ["image/png", "image/jpeg", "image/webp"].includes(imageMimeType) &&
    Boolean(imageCommitSource && documentRevision);
  const documentDirty = editableTextDocument && textContent !== savedTextContent;
  const handleDocumentReload = React.useCallback(() => {
    if (documentSaving || browserImageState.busy) return;
    if ((documentDirty || browserImageState.dirty || documentAnnotationCount > 0 || browserImageState.annotationCount > 0)
      && !window.confirm(t("contentViewer.reload.confirmDiscard"))) {
      return;
    }
    setDocumentReloadRequest((current) => current + 1);
  }, [documentDirty, documentSaving, documentAnnotationCount, browserImageState]);
  const lastRefreshRequest = React.useRef(refreshRequest);
  React.useEffect(() => {
    if (lastRefreshRequest.current === refreshRequest) return;
    lastRefreshRequest.current = refreshRequest;
    handleDocumentReload();
  }, [refreshRequest, handleDocumentReload]);
  const canSaveDocument = editableTextDocument && !textTruncated && Boolean(
    documentRevision && (target.type === "file" || resourceSource),
  );
  const documentSaveProfile = target.type === "file"
    ? "workspace-file" as const
    : resourceSource?.kind || "reference";
  const handleDocumentSave = React.useCallback(async (
    mode: "overwrite" | "new-artifact",
  ) => {
    if (!canSaveDocument || documentSaving || !documentRevision) return;
    setDocumentSaving(true);
    try {
      const mimeType = workspaceFileResponse?.mimeType
        || resourceMimeType
        || (documentKind === "document-markdown" ? "text/markdown" : "text/plain");
      const source = target.type === "file"
        ? { kind: "workspace-file" as const, agentKey: target.agentKey, path: target.path }
        : resourceSource;
      if (!source) return;
      const response = await commitDocument({
        operation: "document.commit",
        source,
        mode: target.type === "file" ? "overwrite" : mode,
        expectedRevision: documentRevision,
        payload: {
          kind: documentKind,
          mimeType,
          encoding: "utf-8",
          text: textContent,
        },
      });
      setSavedTextContent(textContent);
      if (mode === "overwrite" || target.type === "file") {
        setDocumentRevision(response.data.revision);
      }
      message.success(t("contentViewer.save.success"));
    } catch (error: unknown) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
      message.error(
        status === 409
          ? t("contentViewer.save.conflict")
          : resolveContentViewerErrorMessage(error, t("contentViewer.error.loadText")),
      );
    } finally {
      setDocumentSaving(false);
    }
  }, [
    canSaveDocument,
    documentKind,
    documentRevision,
    documentSaving,
    resourceMimeType,
    resourceSource,
    target,
    textContent,
    workspaceFileResponse?.mimeType,
  ]);

  React.useEffect(() => {
    if (!hasDesktopHostBridge() || (!editableTextDocument && !browserImageEditable)) return;
    postDesktopHostMessage({
      type: "desktop:agent-webclient:document-state",
      requestId: `document_state_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dirty: editableTextDocument ? documentDirty : browserImageState.dirty,
      busy: editableTextDocument ? documentSaving : browserImageState.busy,
      annotationCount: editableTextDocument ? documentAnnotationCount : browserImageState.annotationCount,
      targetKey: target.type === "file"
        ? `file:${target.agentKey}:${target.path}`
        : `resource:${target.url}`,
    });
  }, [browserImageEditable, browserImageState, documentAnnotationCount, documentDirty, documentSaving, editableTextDocument, target]);

  const targetLine =
    target.type === "file" && Number.isFinite(target.line) && Number(target.line) > 0
      ? Math.floor(Number(target.line))
      : undefined;
  const textLines = React.useMemo(
    () => buildViewerTextLines(textContent, targetLine),
    [targetLine, textContent],
  );
  const metadataOnly = (documentKind === "document-office" && !docxPreview) ||
    documentKind === "document-archive" || documentKind === "document-binary";
  const unsupportedTextEncoding = documentKind === "document-binary" &&
    isKnownTextDocumentName(viewerName);
  const viewable = isViewerContentSupported(contentKind) || metadataOnly || docxPreview;
  const desktopLocalResourceIdentity = target.type === "resource"
    ? resolveDesktopCurrentResourceIdentity(chatId, target.url)
    : null;
  const localActionsCandidate = shouldRequestDesktopLocalResourceActions({
    bridgeAvailable: canUseDesktopCurrentResourceActions(),
    contentKind,
    enabled: enableDesktopLocalResourceActions,
    identityAvailable: desktopLocalResourceIdentity !== null,
    targetType: target.type,
  });
  const localActionsSourceKey = desktopLocalResourceIdentity
    ? `${desktopLocalResourceIdentity.chatId}\u0000${desktopLocalResourceIdentity.profile}\u0000${desktopLocalResourceIdentity.relativePath}`
    : "";

  React.useEffect(() => {
    let disposed = false;
    setDesktopLocalActionsAvailable(false);
    if (!localActionsCandidate || !desktopLocalResourceIdentity) {
      return () => {
        disposed = true;
      };
    }
    void checkDesktopCurrentResourceActionsAvailable(desktopLocalResourceIdentity)
      .then((available) => {
        if (!disposed) setDesktopLocalActionsAvailable(available);
      })
      .catch(() => {
        if (!disposed) setDesktopLocalActionsAvailable(false);
      });
    return () => {
      disposed = true;
    };
  }, [localActionsCandidate, localActionsSourceKey]);

  if (onlinePreview.result) {
    return <div ref={setPanelElement} className={CONTENT_VIEWER_PANEL_CLASS_NAME}>
      <OnlineDocumentPreview preview={onlinePreview} name={viewerName} onDownload={handleDownload} />
    </div>;
  }

  return (
    <div ref={setPanelElement} className={CONTENT_VIEWER_PANEL_CLASS_NAME}>
      {docxPreview ? <OnlinePreviewAction preview={onlinePreview} /> : null}
      {!docxPreview && localActionsCandidate && desktopLocalActionsAvailable && desktopLocalResourceIdentity
        ? <DesktopLocalResourceActions resource={desktopLocalResourceIdentity} />
        : null}
      {viewable ? <div key={documentReloadRequest} className={CONTENT_VIEWER_BODY_CLASS_NAME}>
        {docxPreview ? (
          viewerUrl ? <React.Suspense fallback={<div role="status" className={CONTENT_VIEWER_STATUS_CLASS_NAME}>{t("contentViewer.docx.loading")}</div>}>
            <DocxDocumentViewer key={`${chatId}:${viewerUrl}`} url={viewerUrl} name={viewerName} chatId={chatId} teamChat={teamChat}
              sizeBytes={workspaceFileResponse?.sizeBytes ?? resourceSizeBytes ?? (target.type === "resource" ? target.sizeBytes : undefined)}
              onDownload={handleDownload} />
          </React.Suspense> : <div role={textError ? "alert" : "status"} className={CONTENT_VIEWER_STATUS_CLASS_NAME}>{textError || t("contentViewer.docx.loading")}</div>
        ) : null}
        {contentKind === "image" && mediaUrl && browserImageEditable && imageCommitSource ? (
          <BrowserImageEditor
            url={mediaUrl}
            name={viewerName}
            mimeType={imageMimeType as "image/png" | "image/jpeg" | "image/webp"}
            source={imageCommitSource}
            revision={documentRevision}
            onRevisionChange={setDocumentRevision}
            onStateChange={setBrowserImageState}
          />
        ) : contentKind === "image" && mediaUrl ? (
          <div className="content-viewer-image-review-host tw:inline-block tw:max-w-full tw:self-start">
            <Image
              className="content-viewer-image"
              src={mediaUrl}
              alt={viewerName}
              onError={() => setMediaError(t("contentViewer.error.image"))}
            />
          </div>
        ) : null}

        {contentKind === "pdf" && mediaUrl ? (
          <React.Suspense fallback={<div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>{t("contentViewer.pdf.loading")}</div>}>
            <PdfDocumentViewer url={mediaUrl} title={viewerName} />
          </React.Suspense>
        ) : null}

        {metadataOnly ? (
          !isAppMode() ? <StandaloneDocumentPanel
            target={target}
            chatId={chatId}
            teamChat={teamChat}
            name={viewerName}
            mimeType={workspaceFileResponse?.mimeType || resourceMimeType || (target.type === "resource" ? target.mimeType : "") || "application/octet-stream"}
            sizeBytes={workspaceFileResponse?.sizeBytes ?? resourceSizeBytes ?? (target.type === "resource" ? target.sizeBytes : undefined)}
            note={unsupportedTextEncoding ? t("contentViewer.metadata.unsupportedTextEncodingDetail") : undefined}
            previewAction={<OnlinePreviewAction preview={onlinePreview} />}
            onDownload={handleDownload}
          /> :
          <div className="tw:flex tw:min-h-[360px] tw:flex-1 tw:items-center tw:justify-center tw:p-6">
            <div className="tw:w-full tw:max-w-md tw:rounded-xl tw:border tw:border-line-soft tw:bg-bg-elev-1 tw:p-5">
              <div className="tw:mb-4 tw:text-base tw:font-semibold tw:text-ink-1">{viewerName}</div>
              <dl className="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-4 tw:gap-y-2 tw:text-sm">
                <dt className="tw:text-ink-muted">{t("contentViewer.metadata.type")}</dt>
                <dd>{t(unsupportedTextEncoding
                  ? "contentViewer.metadata.unsupportedTextEncoding"
                  : `contentViewer.metadata.${documentKind}`)}</dd>
                <dt className="tw:text-ink-muted">MIME</dt>
                <dd className="tw:break-all">{workspaceFileResponse?.mimeType || resourceMimeType || (target.type === "resource" ? target.mimeType : "") || "application/octet-stream"}</dd>
                <dt className="tw:text-ink-muted">{t("contentViewer.metadata.size")}</dt>
                <dd>{workspaceFileResponse?.sizeBytes ?? resourceSizeBytes ?? (target.type === "resource" ? target.sizeBytes : undefined) ?? "–"}</dd>
              </dl>
              {unsupportedTextEncoding ? (
                <p className="tw:mt-4 tw:text-sm tw:text-ink-muted">
                  {t("contentViewer.metadata.unsupportedTextEncodingDetail")}
                </p>
              ) : null}
              <OnlinePreviewAction preview={onlinePreview} />
              <Button className="tw:mt-5" type="primary" onClick={() => void handleDownload()}>
                {t("contentViewer.action.download")}
              </Button>
            </div>
          </div>
        ) : null}

        {contentKind === "html" ? (
          textLoading ? (
            <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
              {t("contentViewer.text.loading")}
            </div>
          ) : textError ? (
            mediaUrl ? (
              <iframe
                className={CONTENT_VIEWER_FRAME_CLASS_NAME}
                src={mediaUrl}
                title={viewerName}
                sandbox="allow-forms allow-modals allow-popups allow-scripts"
              />
            ) : (
              <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
                {textError}
              </div>
            )
          ) : textTruncated ? (
            <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
              {t("contentViewer.text.truncated")}
            </div>
          ) : editableTextDocument ? (
            <DocumentTextEditor
              value={textContent}
              name={viewerName}
              kind={documentKind}
              chatId={chatId}
              teamChat={teamChat}
              saving={documentSaving}
              dirty={documentDirty}
              canSave={canSaveDocument}
              saveProfile={documentSaveProfile}
              revision={documentRevision}
              onAnnotationCountChange={setDocumentAnnotationCount}
              onChange={setTextContent}
              onReload={handleDocumentReload}
              onSave={(mode) => void handleDocumentSave(mode)}
            />
          ) : htmlReview.srcDoc !== null ? (
            <iframe
              ref={htmlReview.frameRef}
              className={CONTENT_VIEWER_FRAME_CLASS_NAME}
              srcDoc={htmlReview.srcDoc}
              title={viewerName}
              sandbox="allow-forms allow-modals allow-popups allow-scripts"
              onLoad={htmlReview.onLoad}
            />
          ) : (
            <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
              {t("contentViewer.error.loadText")}
            </div>
          )
        ) : null}

        {contentKind === "text" ? (
          textLoading ? (
            <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
              {t("contentViewer.text.loading")}
            </div>
          ) : textError ? (
            <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
              {textError}
            </div>
          ) : editableTextDocument && !textTruncated ? (
            <DocumentTextEditor
              value={textContent}
              name={viewerName}
              kind={documentKind}
              chatId={chatId}
              teamChat={teamChat}
              saving={documentSaving}
              dirty={documentDirty}
              canSave={canSaveDocument}
              saveProfile={documentSaveProfile}
              revision={documentRevision}
              onAnnotationCountChange={setDocumentAnnotationCount}
              onChange={setTextContent}
              onReload={handleDocumentReload}
              onSave={(mode) => void handleDocumentSave(mode)}
            />
          ) : targetLine || showLineNumbers ? (
            <pre
              ref={textContainerRef}
              className={CONTENT_VIEWER_TEXT_WITH_LINES_CLASS_NAME}
            >
              {textLines.map((line) => (
                <span
                  key={line.lineNumber}
                  className={[
                    CONTENT_VIEWER_LINE_CLASS_NAME,
                    line.target
                      ? CONTENT_VIEWER_TARGET_LINE_CLASS_NAME
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-viewer-line={line.lineNumber}
                >
                  <span className={CONTENT_VIEWER_LINE_NUMBER_CLASS_NAME} aria-hidden="true">
                    {line.lineNumber}
                  </span>
                  <span className={CONTENT_VIEWER_LINE_CONTENT_CLASS_NAME}>
                    {line.text || " "}
                  </span>
                </span>
              ))}
            </pre>
          ) : (
            <pre className={CONTENT_VIEWER_TEXT_CLASS_NAME}>
              {textContent || t("contentViewer.text.empty")}
            </pre>
          )
        ) : null}

        {contentKind === "audio" && mediaUrl ? (
          <div className={CONTENT_VIEWER_MEDIA_SHELL_CLASS_NAME}>
            <audio
              className={CONTENT_VIEWER_AUDIO_CLASS_NAME}
              src={mediaUrl}
              controls
              preload="metadata"
              onError={() =>
                setMediaError(t("contentViewer.error.audio"))
              }
            />
          </div>
        ) : null}

        {contentKind === "video" && mediaUrl ? (
          <video
            className={CONTENT_VIEWER_VIDEO_CLASS_NAME}
            src={mediaUrl}
            controls
            preload="metadata"
            onError={() => setMediaError(t("contentViewer.error.video"))}
          />
        ) : null}

        {mediaError ? (
          <div className={CONTENT_VIEWER_STATUS_CLASS_NAME}>
            {mediaError}
          </div>
        ) : null}
      </div> : null}

      {textTruncated && contentKind !== "html" ? (
        <div className={CONTENT_VIEWER_NOTE_CLASS_NAME}>
          {t("contentViewer.text.truncated")}
        </div>
      ) : null}
    </div>
  );
};
