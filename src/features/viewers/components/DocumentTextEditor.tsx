import React from "react";
import { Button, Dropdown, Input, Modal, Space } from "antd";
import type * as MonacoTypes from "monaco-editor";
import { CodeEditor } from "@/shared/ui/CodeEditor";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { resolveHtmlVisualizationAssets } from "@/shared/utils/htmlVisualizationAssets";
import { t } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import type { DocumentContentKind } from "@/shared/types/document";
import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";
import { DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT } from "@/shared/data/desktop/desktopContextMenu";
import { registerViewerCloseGuard } from "@/shared/data/viewerCloseGuard";
import {
  AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
  AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT,
  type AgentWebclientComposerDraftAction,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { useHtmlElementReview } from "../hooks/useHtmlElementReview";
import { HTML_ELEMENT_REVIEW_MAX } from "../lib/htmlElementReview";
import { HtmlElementReviewEditor, HtmlElementReviewPanel } from "./HtmlElementReviewPanel";
import { HtmlElementReviewToolbar } from "./HtmlElementReviewToolbar";

const MarkdownPreview: React.FC<{
  content: string;
  chatId: string;
  teamChat: boolean;
}> = process.env.NODE_ENV === "test"
  ? ({ content }) => <div>{content}</div>
  : React.lazy(async () => {
      const module = await import("@/features/viewers/components/MarkdownContent");
      return { default: module.MarkdownContent };
    });

export type MarkdownViewMode = "source" | "preview" | "split";
export type DocumentSaveMode = "overwrite" | "new-artifact";
export type DocumentSaveProfile = "workspace-file" | "artifact" | "reference";

export function defaultDocumentViewMode(previewable: boolean): MarkdownViewMode {
  return previewable ? "preview" : "source";
}

export function documentViewModes(markdown: boolean): readonly MarkdownViewMode[] {
  return markdown
    ? ["preview", "source"]
    : ["preview", "source", "split"];
}

export function documentSaveModes(
  profile: DocumentSaveProfile,
): readonly DocumentSaveMode[] {
  if (profile === "artifact") return ["overwrite", "new-artifact"];
  if (profile === "reference") return ["new-artifact"];
  return ["overwrite"];
}

export function preferredDocumentSaveMode(
  profile: DocumentSaveProfile,
): DocumentSaveMode {
  return profile === "workspace-file" ? "overwrite" : "new-artifact";
}

type TextAnnotation = {
  id: string;
  origin: "source" | "preview";
  revision: string;
  range: MonacoTypes.IRange | null;
  selectedText: string;
  selectedTextHash: string;
  note: string;
  invalid: boolean;
};

function sourcePositionAt(value: string, offset: number) {
  let lineNumber = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (value[index] === "\r") {
      if (value[index + 1] === "\n" && index + 1 < offset) index += 1;
      lineNumber += 1;
      column = 1;
    } else if (value[index] === "\n") {
      lineNumber += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { lineNumber, column };
}

export function findPreviewSelectionSourceRange(
  value: string,
  selectedText: string,
): MonacoTypes.IRange | null {
  const selected = selectedText.trim();
  if (!selected) return null;
  const startOffset = value.indexOf(selected);
  if (startOffset < 0) return null;
  if (value.indexOf(selected, startOffset + selected.length) >= 0) return null;
  const start = sourcePositionAt(value, startOffset);
  const end = sourcePositionAt(value, startOffset + selected.length);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

function hashSelectedText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fileExtension(name: string): string {
  const clean = name.split(/[?#]/u, 1)[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1) : "";
}

export function documentEditorLanguage(
  kind: DocumentContentKind,
  name: string,
): string {
  if (kind === "document-markdown") return "markdown";
  if (kind === "document-html") return "html";
  if (kind === "document-text") return "plaintext";
  const extension = fileExtension(name);
  const aliases: Record<string, string> = {
    h: "c", cc: "cpp", jsx: "javascript", mjs: "javascript", py: "python",
    rb: "ruby", rs: "rust", sh: "shell", tsx: "typescript", yml: "yaml",
  };
  return aliases[extension] || extension || "plaintext";
}

export const DocumentTextEditor: React.FC<{
  value: string;
  name: string;
  kind: DocumentContentKind;
  chatId: string;
  teamChat: boolean;
  disabled?: boolean;
  saving?: boolean;
  dirty?: boolean;
  canSave?: boolean;
  saveProfile: DocumentSaveProfile;
  revision: string;
  reloadToken?: number;
  closeGuardKey?: string;
  onAnnotationCountChange?: (count: number) => void;
  onChange: (value: string) => void;
  onReload: () => void;
  onSave: (mode: DocumentSaveMode) => void;
}> = ({
  value,
  name,
  kind,
  chatId,
  teamChat,
  disabled = false,
  saving = false,
  dirty = false,
  canSave = false,
  saveProfile,
  revision,
  reloadToken = 0,
  closeGuardKey = "",
  onAnnotationCountChange,
  onChange,
  onReload,
  onSave,
}) => {
  const markdown = kind === "document-markdown";
  const isHtml = kind === "document-html";
  const previewable = markdown || isHtml;
  const message = useAppMessage();
  const [mode, setMode] = React.useState<MarkdownViewMode>(
    defaultDocumentViewMode(previewable),
  );
  const editorRef = React.useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = React.useRef<MonacoTypes.editor.IEditorDecorationsCollection | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = React.useState<MonacoTypes.Selection | null>(null);
  const [previewSelection, setPreviewSelection] = React.useState("");
  const [annotations, setAnnotations] = React.useState<TextAnnotation[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [htmlHandoffBusy, setHtmlHandoffBusy] = React.useState(false);
  const htmlHandoffBusyRef = React.useRef(false);
  const annotateButtonRef = React.useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const wasHtmlReviewingRef = React.useRef(false);
  const htmlReview = useHtmlElementReview({
    enabled: isHtml,
    html: value,
    fileName: name,
    revision,
    reloadToken,
    onLimitReached: () => message.warning(t("contentViewer.htmlReview.limitReached", {
      max: HTML_ELEMENT_REVIEW_MAX,
    })),
  });
  React.useEffect(() => {
    setMode(defaultDocumentViewMode(previewable));
    htmlReview.reset();
  }, [htmlReview.reset, kind, name, previewable]);

  React.useEffect(() => {
    setSelection(null);
    setPreviewSelection("");
  }, [mode, value]);

  React.useEffect(() => {
    setAnnotations((current) => current.map((annotation) => ({
      ...annotation,
      invalid: annotation.revision !== revision,
    })));
  }, [revision]);

  const textAnnotationCount = annotations.filter((annotation) => !annotation.invalid).length;
  React.useEffect(() => {
    onAnnotationCountChange?.(textAnnotationCount + htmlReview.protectionCount);
  }, [htmlReview.protectionCount, onAnnotationCountChange, textAnnotationCount]);

  React.useEffect(() => {
    if (!isHtml || !closeGuardKey || htmlReview.protectionCount === 0) return;
    return registerViewerCloseGuard(closeGuardKey, () =>
      window.confirm(t("contentViewer.htmlReview.closeConfirm")));
  }, [closeGuardKey, htmlReview.protectionCount, isHtml]);

  React.useEffect(() => {
    if (wasHtmlReviewingRef.current && !htmlReview.annotating) {
      annotateButtonRef.current?.focus();
    }
    wasHtmlReviewingRef.current = htmlReview.annotating;
  }, [htmlReview.annotating]);

  React.useEffect(() => {
    if (!htmlReview.annotating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (htmlReview.pending) htmlReview.cancelPending();
      else htmlReview.stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [htmlReview.annotating, htmlReview.cancelPending, htmlReview.pending, htmlReview.stop]);

  React.useEffect(() => {
    const decorations = decorationsRef.current;
    if (!decorations) return;
    decorations.set(annotations.filter((annotation) => annotation.range).map((annotation) => ({
      range: annotation.range,
      options: {
        className: annotation.invalid
          ? "document-annotation-invalid"
          : "document-annotation-range",
        stickiness: 1,
      },
    })) as Array<{ range: MonacoTypes.IRange; options: MonacoTypes.editor.IModelDecorationOptions }>);
  }, [annotations, mode]);

  const mountEditor = React.useCallback((editor: MonacoTypes.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection();
    const selectionSubscription = editor.onDidChangeCursorSelection((event) => {
      setSelection(event.selection.isEmpty() ? null : event.selection);
    });
    const contentSubscription = editor.onDidChangeModelContent(() => {
      const ranges = decorationsRef.current?.getRanges() || [];
      if (ranges.length === 0) return;
      setAnnotations((current) => {
        let rangeIndex = 0;
        return current.map((annotation) => {
          if (!annotation.range) return annotation;
          const range = ranges[rangeIndex];
          rangeIndex += 1;
          return {
            ...annotation,
            ...(range ? { range } : { invalid: true }),
          };
        });
      });
    });
    editor.onDidDispose(() => {
      selectionSubscription.dispose();
      contentSubscription.dispose();
      decorationsRef.current = null;
      editorRef.current = null;
    });
  }, []);

  const capturePreviewSelection = React.useCallback(() => {
    const root = previewRef.current;
    const selected = window.getSelection();
    if (!root || !selected || selected.rangeCount === 0 || selected.isCollapsed) {
      setPreviewSelection("");
      return;
    }
    const range = selected.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setPreviewSelection("");
      return;
    }
    setPreviewSelection(selected.toString().trim().slice(0, 4_000));
  }, []);

  const addAnnotation = () => {
    if (markdown && mode === "preview") {
      const selectedText = previewSelection.trim().slice(0, 4_000);
      if (!selectedText) return;
      setAnnotations((current) => [...current, {
        id: globalThis.crypto.randomUUID(),
        origin: "preview",
        revision,
        range: findPreviewSelectionSourceRange(value, selectedText),
        selectedText,
        selectedTextHash: hashSelectedText(selectedText),
        note: "",
        invalid: false,
      }]);
      window.getSelection()?.removeAllRanges();
      setPreviewSelection("");
      return;
    }
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !selection || selection.isEmpty()) return;
    const selectedText = model.getValueInRange(selection).slice(0, 4_000);
    if (!selectedText) return;
    setAnnotations((current) => [...current, {
      id: globalThis.crypto.randomUUID(),
      origin: "source",
      revision,
      range: selection,
      selectedText,
      selectedTextHash: hashSelectedText(selectedText),
      note: "",
      invalid: false,
    }]);
  };

  const saveModes = documentSaveModes(saveProfile);
  const preferredSaveMode = preferredDocumentSaveMode(saveProfile);
  const chooseSaveMode = (saveMode: DocumentSaveMode) => {
    setSaveDialogOpen(false);
    onSave(saveMode);
  };

  const handoffAnnotations = () => {
    const valid = annotations.filter((annotation) => !annotation.invalid && annotation.note.trim());
    if (valid.length === 0) return;
    const text = [
      `${t("contentViewer.annotation.request")} ${name} (revision: ${revision})`,
      "",
      ...valid.map((annotation, index) =>
        `${index + 1}. ${annotation.range
          ? `L${annotation.range.startLineNumber}:C${annotation.range.startColumn}` +
            `–L${annotation.range.endLineNumber}:C${annotation.range.endColumn}`
          : t("contentViewer.annotation.previewSelection")}` +
        ` [selectedTextHash:${annotation.selectedTextHash}]\n` +
        `   ${annotation.note.trim()}\n` +
        `   > ${annotation.selectedText.replace(/\s+/gu, " ").slice(0, 240)}`),
    ].join("\n");
    if (hasDesktopHostBridge()) {
      postDesktopHostMessage({
        type: "desktop:agent-webclient:document-handoff",
        requestId: `document_handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text,
      });
    } else {
      window.dispatchEvent(new CustomEvent("agent:set-composer-draft", { detail: { draft: text } }));
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
    }
    setAnnotations([]);
  };

  const switchDocumentMode = (next: MarkdownViewMode) => {
    if (next === mode) return;
    if (isHtml && next !== "preview" && (htmlReview.count > 0 || htmlReview.pending)) {
      if (!window.confirm(t("contentViewer.htmlReview.leaveConfirm"))) return;
      htmlReview.reset();
    }
    if (isHtml && htmlReview.annotating) htmlReview.stop();
    setMode(next);
  };

  const startHtmlReview = () => {
    if (!htmlReview.ready || htmlReview.bridgeFailed) return;
    if (mode !== "preview") setMode("preview");
    htmlReview.start();
  };

  const closeHtmlReviewPanel = () => {
    htmlReview.closeList();
  };

  const dispatchHtmlReviewDraft = (action: AgentWebclientComposerDraftAction) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: number | undefined;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener(
          AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT,
          onResult,
        );
        if (timer !== undefined) window.clearTimeout(timer);
        resolve(ok);
      };
      const onResult = (event: Event) => {
        const detail = (event as CustomEvent).detail as
          | { event?: string; requestId?: string; ok?: boolean }
          | undefined;
        if (
          !detail ||
          detail.event !== "composer-draft-result" ||
          detail.requestId !== action.requestId
        ) return;
        finish(detail.ok !== false);
      };
      window.addEventListener(
        AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT,
        onResult,
      );
      timer = window.setTimeout(() => finish(false), 1200);
      try {
        window.dispatchEvent(new CustomEvent(DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT, {
          detail: action,
        }));
      } catch {
        finish(false);
      }
    });

  const handoffHtmlReview = async () => {
    if (htmlHandoffBusyRef.current || htmlReview.pending) return;
    const prepared = htmlReview.prepareHandoff();
    if (!prepared) return;
    htmlHandoffBusyRef.current = true;
    setHtmlHandoffBusy(true);
    try {
      if (prepared.text.length > 50_000) {
        window.dispatchEvent(new CustomEvent("agent:set-composer-draft", {
          detail: { draft: prepared.text, append: true },
        }));
        window.dispatchEvent(new CustomEvent("agent:focus-composer"));
      } else {
        const action: AgentWebclientComposerDraftAction = {
          action: AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
          version: AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
          requestId: `html_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ownerChatId: chatId,
          text: prepared.text,
          reviewData: {
            version: 1,
            sourceKind: saveProfile,
            kind: "html",
            source: { fileName: name, revision },
            annotations: prepared.payload.annotations,
          },
        };
        const accepted = await dispatchHtmlReviewDraft(action);
        if (!accepted) {
          message.error(t("contentViewer.htmlReview.handoffFailed"));
          return;
        }
      }
      htmlReview.completeHandoff();
      message.success(t("contentViewer.htmlReview.handoffSuccess"));
    } catch {
      message.error(t("contentViewer.htmlReview.handoffFailed"));
    } finally {
      htmlHandoffBusyRef.current = false;
      setHtmlHandoffBusy(false);
    }
  };

  const preview = markdown ? (
    <React.Suspense fallback={null}>
      <MarkdownPreview content={value} chatId={chatId} teamChat={teamChat} />
    </React.Suspense>
  ) : (
    <iframe
      key={value}
      className="tw:h-full tw:min-h-[420px] tw:w-full tw:border-0"
      srcDoc={resolveHtmlVisualizationAssets(value)}
      title={name}
      sandbox="allow-forms allow-modals allow-scripts"
    />
  );

  const editor = (
    <div className="tw:min-h-0 tw:flex-1 tw:overflow-hidden">
      <CodeEditor
        value={value}
        language={documentEditorLanguage(kind, name)}
        path={name}
        disabled={disabled || saving}
        onChange={(nextValue) => {
          setAnnotations((current) => current.map((annotation) =>
            annotation.origin === "preview" && !annotation.invalid
              ? { ...annotation, invalid: true }
              : annotation));
          onChange(nextValue);
        }}
        onMount={mountEditor}
        options={{ lineNumbers: "on", wordWrap: "on" }}
      />
    </div>
  );

  const htmlReviewList = htmlReview.annotating ? (
    <HtmlElementReviewPanel
      annotations={htmlReview.annotations}
      invalidIds={htmlReview.invalidIds}
      canHandoff={htmlReview.canHandoff && !htmlHandoffBusy}
      submittableCount={htmlReview.submittableCount}
      onUpdateRequirement={htmlReview.updateRequirement}
      onRemove={htmlReview.removeAnnotation}
      onClose={closeHtmlReviewPanel}
      onHandoff={handoffHtmlReview}
    />
  ) : null;

  return (
    <div className="tw:flex tw:min-h-[420px] tw:flex-1 tw:flex-col tw:overflow-hidden">
      {htmlReview.annotating ? (
        <HtmlElementReviewToolbar
          listOpen={htmlReview.listOpen}
          count={htmlReview.count}
          onBack={htmlReview.stop}
          onToggleList={htmlReview.toggleList}
          onRefresh={onReload}
          listContent={htmlReviewList}
        />
      ) : (
        <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-line-soft tw:px-2 tw:py-1.5">
          <Space size={4}>
            {previewable ? documentViewModes(markdown).map((item) => (
              <Button
                key={item}
                size="small"
                type={mode === item ? "primary" : "text"}
                onClick={() => switchDocumentMode(item)}
              >
                {t(`contentViewer.markdown.${item}`)}
              </Button>
            )) : null}
            {isHtml && mode === "preview" ? (
              <Button
                ref={annotateButtonRef}
                size="small"
                disabled={disabled || !htmlReview.ready || htmlReview.bridgeFailed}
                title={htmlReview.bridgeFailed
                  ? t("contentViewer.htmlReview.annotateUnavailable")
                  : htmlReview.ready
                    ? undefined
                    : t("contentViewer.htmlReview.annotatePreparing")}
                onClick={startHtmlReview}
              >
                {htmlReview.count > 0
                  ? t("contentViewer.htmlReview.annotateCount", { count: htmlReview.count })
                  : t("contentViewer.htmlReview.annotate")}
              </Button>
            ) : null}
            {(!isHtml && (!markdown || mode === "preview")) || (isHtml && mode === "source") ? (
              <Button
                size="small"
                disabled={markdown && mode === "preview" ? !previewSelection : !selection}
                onClick={addAnnotation}
              >
                {t("contentViewer.annotation.add")}
              </Button>
            ) : null}
          </Space>
          <Space size={6}>
            {canSave ? (
              <Button
                size="small"
                type="primary"
                loading={saving}
                disabled={!dirty || saving}
                onClick={() => setSaveDialogOpen(true)}
              >
                {t("contentViewer.action.save")}
              </Button>
            ) : null}
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [{
                  key: "reload",
                  label: t("contentViewer.action.reload"),
                  disabled: saving,
                  onClick: onReload,
                }],
              }}
            >
              <Button
                size="small"
                type="text"
                icon={<MaterialIcon name="more_horiz" />}
                aria-label={t("contentViewer.action.more")}
                title={t("contentViewer.action.more")}
              />
            </Dropdown>
          </Space>
        </div>
      )}
      {mode === "source" ? editor : null}
      {mode === "preview" ? (
        isHtml ? (
          <div className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
            {htmlReview.bridgeFailed ? (
              <div
                role="alert"
                className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-line-soft tw:px-2 tw:py-1.5 tw:text-xs tw:text-danger"
              >
                <span>{t("contentViewer.htmlReview.bridgeFailed")}</span>
                <Button
                  size="small"
                  type="text"
                  icon={<MaterialIcon name="refresh" />}
                  onClick={onReload}
                >
                  {t("contentViewer.htmlReview.refresh")}
                </Button>
              </div>
            ) : null}
            <iframe
              ref={htmlReview.frameRef}
              className="tw:min-h-[420px] tw:w-full tw:flex-1 tw:border-0"
              srcDoc={htmlReview.srcDoc}
              title={name}
              sandbox="allow-forms allow-modals allow-scripts"
              onLoad={htmlReview.onLoad}
            />
            {htmlReview.pending ? (
              <HtmlElementReviewEditor
                pending={htmlReview.pending}
                onRequirementChange={htmlReview.setPendingRequirement}
                onConfirm={htmlReview.confirmPending}
                onCancel={htmlReview.cancelPending}
              />
            ) : null}
          </div>
        ) : (
          <div
            ref={previewRef}
            className="tw:min-h-0 tw:flex-1 tw:overflow-auto"
            onMouseUp={capturePreviewSelection}
            onKeyUp={capturePreviewSelection}
          >
            {preview}
          </div>
        )
      ) : null}
      {mode === "split" ? (
        <div className="tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-2">
          {editor}
          <div className="tw:min-h-0 tw:overflow-auto tw:border-l tw:border-line-soft">
            {preview}
          </div>
        </div>
      ) : null}
      {annotations.length && (!isHtml || mode !== "preview") ? (
        <div className="tw:max-h-52 tw:overflow-auto tw:border-t tw:border-line-soft tw:p-2">
          {annotations.map((annotation, index) => (
            <div key={annotation.id} className="tw:mb-2 tw:grid tw:grid-cols-[auto_1fr_auto] tw:items-center tw:gap-2">
              <code className={annotation.invalid ? "tw:text-danger" : ""}>
                {annotation.range
                  ? `L${annotation.range.startLineNumber}:C${annotation.range.startColumn}`
                  : t("contentViewer.annotation.previewSelection")}
              </code>
              <Input
                value={annotation.note}
                disabled={annotation.invalid}
                placeholder={annotation.invalid
                  ? t("contentViewer.annotation.invalid")
                  : `${index + 1}. ${annotation.selectedText.slice(0, 100)}`}
                onChange={(event) => setAnnotations((current) => current.map((item) =>
                  item.id === annotation.id ? { ...item, note: event.target.value } : item))}
              />
              <Button danger size="small" onClick={() => setAnnotations((current) => current.filter((item) => item.id !== annotation.id))}>
                {t("contentViewer.annotation.remove")}
              </Button>
            </div>
          ))}
          <Button
            type="primary"
            size="small"
            disabled={!annotations.some((annotation) => !annotation.invalid && annotation.note.trim())}
            onClick={handoffAnnotations}
          >
            {t("contentViewer.annotation.handoff")}
          </Button>
        </div>
      ) : null}
      <Modal
        open={saveDialogOpen && canSave}
        title={t("contentViewer.save.chooseTitle")}
        closable={!saving}
        maskClosable={!saving}
        keyboard={!saving}
        onCancel={() => setSaveDialogOpen(false)}
        footer={[
          <Button key="cancel" disabled={saving} onClick={() => setSaveDialogOpen(false)}>
            {t("contentViewer.save.cancel")}
          </Button>,
          ...saveModes.map((saveMode) => (
            <Button
              key={saveMode}
              type={saveMode === preferredSaveMode ? "primary" : "default"}
              loading={saving && saveMode === preferredSaveMode}
              disabled={saving}
              onClick={() => chooseSaveMode(saveMode)}
            >
              {t(saveMode === "overwrite"
                ? saveProfile === "workspace-file"
                  ? "contentViewer.action.saveOverwrite"
                  : "contentViewer.action.overwrite"
                : "contentViewer.action.saveNewArtifact")}
            </Button>
          )),
        ]}
      >
        <p>{t(`contentViewer.save.${saveProfile}`)}</p>
      </Modal>
    </div>
  );
};
