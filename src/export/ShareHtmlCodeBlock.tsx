import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Modal, Tooltip } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { textFromReactNode, type ConversationMarkdownCodeProps } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { isCompleteHtmlDocument } from "@/shared/ui/markdown-code/htmlPreviewDocument";
import { prioritizeHtmlPreviewSlot, requestHtmlPreviewSlot } from "@/shared/ui/markdown-code/htmlPreviewRuntime";
import { useHighlightCode } from "@/shared/ui/markdown-code/useHighlight";
import { copyWebText } from "@/shared/utils/webClipboard";
import { conversationExportMessages, type ConversationExportLocale } from "@/shared/i18n/conversationExport";
import { ShareHtmlFrame, versionedShareHtmlPreview, type ShareHtmlFrameStatus } from "./ShareHtmlFrame";
import type { ShareHtmlDelivery } from "./shareHtmlDocument";
import styles from "./ShareHtmlCodeBlock.module.css";

export function ShareHtmlCodeBlock({ children, streamStatus, sharePath, locale }: ConversationMarkdownCodeProps & {
  sharePath: string;
  locale: ConversationExportLocale;
}) {
  const language = "html";
  const labels = conversationExportMessages[locale].htmlCode;
  const source = useMemo(() => textFromReactNode(children), [children]);
  const complete = streamStatus === "done" && Boolean(source.trim());
  const documentSource = isCompleteHtmlDocument(source);
  const [selection, setSelection] = useState({ source, view: complete && documentSource });
  const view = selection.source === source ? selection.view : complete && documentSource;
  const select = (next: boolean) => setSelection({ source, view: next });
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slot, setSlot] = useState<"active" | "queued" | null>(null);
  const [status, setStatus] = useState<ShareHtmlFrameStatus>("loading");
  const [height, setHeight] = useState(160);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const copyRequest = useRef(0);
  const highlighted = useHighlightCode(source, "html");
  const url = versionedShareHtmlPreview(`${sharePath}/html-preview`);
  const requested = view && complete && (visible || expanded) && status !== "error";
  const loadPayload = useCallback(async (): Promise<ShareHtmlDelivery> => ({
    kind: "inline", html: source, viewportHeight: Math.min(600, window.innerHeight * 0.7),
  }), [source]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!requested) { setSlot(null); return; }
    return requestHtmlPreviewSlot(id, setSlot);
  }, [id, requested]);
  useEffect(() => {
    setStatus("loading"); setHeight(160); setCopyStatus(""); setExpanded(false);
    return () => { copyRequest.current += 1; };
  }, [source]);
  const copy = async () => {
    const request = ++copyRequest.current;
    try { await copyWebText(source); if (request === copyRequest.current) setCopyStatus(labels.copied); }
    catch { if (request === copyRequest.current) setCopyStatus(labels.copyFailed); }
  };
  const retry = () => { setStatus("loading"); setAttempt(value => value + 1); };
  const preview = (large: boolean) => <div className={large ? styles.expandedPreview : styles.preview}>
    {status === "error" ? <div className={styles.notice} role="status">
      <MaterialIcon name="error" />
      <strong>{labels.failed}</strong><span>{labels.sourceAvailable}</span>
      <div className={styles.actions}>
        <UiButton size="sm" onClick={retry}>{labels.retry}</UiButton>
        <UiButton size="sm" variant="ghost" onClick={() => { setExpanded(false); select(false); }}>{labels.showCode}</UiButton>
      </div>
    </div> : <div className={styles.viewport} style={{ height }} aria-busy={status === "loading"}>
      {requested && slot === "active" && <ShareHtmlFrame key={attempt} url={url} title={labels.previewTitle}
        loadPayload={loadPayload} onStatus={setStatus} onHeight={setHeight} />}
      {(!requested || slot !== "active" || status === "loading") && <div className={styles.placeholder} role="status">
        {slot === "queued" ? <><span>{labels.queued}</span><UiButton size="sm" variant="ghost" onClick={() => prioritizeHtmlPreviewSlot(id)}>{labels.preview}</UiButton></>
          : labels.loading}
      </div>}
    </div>}
  </div>;
  return <div ref={root} className={styles.card} data-share-html-code="">
    <div className={styles.toolbar}>
      <span className={styles.language}><MaterialIcon name="html" />{language}</span>
      <div className={styles.tabs} role="tablist" aria-label={labels.displayMode} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = complete && (event.key === "Home" || (event.key !== "End" && !view));
        select(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next ? "view" : "code"}"]`)?.focus();
      }}>
        <button type="button" id={`${id}-view-tab`} role="tab" aria-selected={view} aria-controls={`${id}-view`} disabled={!complete}
          data-mode="view" tabIndex={view ? 0 : -1} onClick={() => select(true)}>{labels.view}</button>
        <button type="button" id={`${id}-code-tab`} role="tab" aria-selected={!view} aria-controls={`${id}-code`}
          data-mode="code" tabIndex={view ? -1 : 0} onClick={() => select(false)}>{labels.code}</button>
      </div>
      <Tooltip title={labels.copy}><UiButton iconOnly size="mini" variant="ghost" onClick={() => void copy()} aria-label={labels.copy}>
        <MaterialIcon name="content_copy" /></UiButton></Tooltip>
      {view && complete && <Tooltip title={labels.expand}><UiButton ref={expandButton} iconOnly size="mini" variant="ghost"
        onClick={() => setExpanded(true)} aria-label={labels.expand}><MaterialIcon name="expand_content" /></UiButton></Tooltip>}
    </div>
    {copyStatus && <div className={styles.copyStatus} role="status">{copyStatus}</div>}
    <div id={`${id}-view`} role="tabpanel" aria-labelledby={`${id}-view-tab`} hidden={!view}>
      {view && !expanded && preview(false)}
    </div>
    <div id={`${id}-code`} role="tabpanel" aria-labelledby={`${id}-code-tab`} hidden={view}>
      <pre className={styles.source}><code className="hljs" dangerouslySetInnerHTML={highlighted} /></pre>
      {!complete ? <div className={styles.hint}>{labels.incomplete}</div> : !documentSource && <div className={styles.hint}>
        <span>{labels.fragment}</span><UiButton size="sm" variant="ghost" onClick={() => select(true)}>{labels.previewFragment}</UiButton>
      </div>}
    </div>
    <Modal open={expanded} title={labels.previewTitle} footer={null} width="min(1100px, 94vw)" centered destroyOnHidden
      onCancel={() => setExpanded(false)} afterClose={() => expandButton.current?.focus({ preventScroll: true })}>
      {expanded && preview(true)}
    </Modal>
  </div>;
}
