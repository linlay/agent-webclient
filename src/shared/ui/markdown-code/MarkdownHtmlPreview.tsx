import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "../UiButton";
import { BusyInk } from "../BusyInk";
import { MaterialIcon } from "../MaterialIcon";
import { buildHtmlPreviewDocument, HTML_PREVIEW_MESSAGE } from "./htmlPreviewDocument";
import {
  cacheHtmlPreview, getCachedHtmlPreview, htmlPreviewCacheKey, htmlPreviewContentKey,
  HTML_PREVIEW_DEFAULT_HEIGHT, HTML_PREVIEW_MIN_HEIGHT, prioritizeHtmlPreviewSlot, requestHtmlPreviewSlot,
} from "./htmlPreviewRuntime";
import styles from "./MarkdownHtmlPreview.module.css";

export function MarkdownHtmlReceiving() {
  const { t } = useI18n();
  return <div className={styles.busy} style={{ height: HTML_PREVIEW_DEFAULT_HEIGHT }} role="status" aria-busy="true">
    <BusyInk />
    <span className={styles.busyLabel}><MaterialIcon name="html" />{t("markdown.htmlPreview.receiving")}</span>
  </div>;
}

export const MarkdownHtmlPreview = React.memo(function MarkdownHtmlPreview({ code, autoStart }: {
  code: string;
  autoStart: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const contentKey = useMemo(() => htmlPreviewContentKey(code), [code]);
  const [width, setWidth] = useState(0);
  const cacheKey = htmlPreviewCacheKey(contentKey, width);
  const [selection, setSelection] = useState(() => {
    const cached = getCachedHtmlPreview(contentKey);
    return { contentKey, enabled: (cached.enabled ?? autoStart) && !cached.blocked };
  });
  const cachedSelection = getCachedHtmlPreview(contentKey);
  const requested = selection.contentKey === contentKey ? selection.enabled
    : (cachedSelection.enabled ?? autoStart) && !cachedSelection.blocked;
  const setRequested = (enabled: boolean) => setSelection({ contentKey, enabled });
  const [visible, setVisible] = useState(false);
  const [slot, setSlot] = useState<"active" | "queued" | null>(null);
  const [height, setHeight] = useState(() => getCachedHtmlPreview(cacheKey, contentKey).height);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "navigate" | "unavailable">(() => getCachedHtmlPreview(contentKey).blocked ? "navigate" : "loading");
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const loadCount = useRef(0);
  const token = useMemo(() => `${id}:${contentKey}`, [contentKey, id]);
  const active = requested && visible && slot === "active";
  const preparedDocument = useRef<{ code: string; token: string; srcDoc: string | null }>();
  const srcDoc = useMemo(() => {
    if (!active) return null;
    if (preparedDocument.current?.code === code && preparedDocument.current.token === token) return preparedDocument.current.srcDoc;
    let document: string | null = null;
    try {
      if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
        document = buildHtmlPreviewDocument(code, token, window.location.href, window.innerHeight);
      }
    } catch { /* Leave the source available when this host cannot create a preview. */ }
    preparedDocument.current = { code, token, srcDoc: document };
    return document;
  }, [active, code, token]);

  useEffect(() => {
    const cached = getCachedHtmlPreview(contentKey);
    setRequested((cached.enabled ?? autoStart) && !cached.blocked);
    setStatus(cached.blocked ? "navigate" : "loading");
  }, [autoStart, contentKey]);
  useEffect(() => { setHeight(getCachedHtmlPreview(cacheKey, contentKey).height); }, [cacheKey, contentKey]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width || 0));
    resize.observe(element);
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(element);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, []);
  useEffect(() => {
    if (!requested || !visible) { setSlot(null); return; }
    return requestHtmlPreviewSlot(id, setSlot);
  }, [id, requested, visible]);
  useEffect(() => {
    if (!active) return;
    if (srcDoc) { setStatus("loading"); loadCount.current = 0; }
    else { setRequested(false); setStatus("unavailable"); }
  }, [active, srcDoc]);
  useEffect(() => {
    if (!active || !srcDoc) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== frame.current?.contentWindow || !data || data.type !== HTML_PREVIEW_MESSAGE || data.token !== token) return;
      if (data.event === "ready") setStatus(current => current === "error" ? current : "ready");
      if (data.event === "error") setStatus("error");
      if (data.event === "navigate") {
        cacheHtmlPreview(contentKey, { blocked: true });
        setRequested(false); setStatus("navigate");
      }
      if (data.event === "size" && typeof data.height === "number" && Number.isFinite(data.height) && data.height > 0) {
        const next = Math.max(HTML_PREVIEW_MIN_HEIGHT, Math.ceil(data.height));
        setHeight(current => Math.abs(current - next) > 1 ? next : current);
        cacheHtmlPreview(cacheKey, { height: next });
        cacheHtmlPreview(contentKey, { height: next });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, cacheKey, contentKey, srcDoc, token]);

  return <div ref={root} className={styles.root} data-html-preview={active ? "active" : "idle"}>
    {status === "navigate" ? <div className={styles.notice} role="status">{t("markdown.htmlPreview.navigation")}</div>
      : status === "unavailable" ? <div className={styles.notice} role="status">{t("markdown.htmlPreview.unavailable")}</div>
      : !requested && <UiButton variant="ghost" size="sm" onClick={() => {
        cacheHtmlPreview(contentKey, { enabled: true });
        setRequested(true);
      }}>{t("markdown.htmlPreview.show")}</UiButton>}
    {status === "error" && active && <div className={styles.notice} role="status">{t("markdown.htmlPreview.error")}</div>}
    {requested && <div className={styles.viewport} style={{ height }}>
      {active && srcDoc ? <iframe ref={frame} className={styles.frame} style={{ height }} title={t("markdown.htmlPreview.title")}
        srcDoc={srcDoc} sandbox="allow-scripts" referrerPolicy="no-referrer"
        onLoad={() => {
          if (++loadCount.current > 1) { cacheHtmlPreview(contentKey, { blocked: true }); setRequested(false); setStatus("navigate"); }
        }} />
        : <div className={styles.placeholder}>
          <span role="status">{t(visible ? "markdown.htmlPreview.queued" : "markdown.htmlPreview.offscreen")}</span>
          {visible && slot === "queued" && <UiButton variant="ghost" size="sm" onClick={() => prioritizeHtmlPreviewSlot(id)}>{t("markdown.htmlPreview.show")}</UiButton>}
        </div>}
    </div>}
  </div>;
});
