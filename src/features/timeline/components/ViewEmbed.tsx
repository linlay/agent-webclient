import { useEffect, useRef, useState } from "react";
import type { ViewReference } from "@/shared/contracts/view";
import { getView } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import { safeJsonParse } from "@/shared/utils/safeJsonParse";
import { useI18n } from "@/shared/i18n";

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 1600;

export function clampViewHeight(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(value)));
}

// Display views have no submit/action listener. Only HITL's host may submit.
// Connector views load only frozen Chat snapshots named by an event hash.
export function ViewEmbed({ chatId, view, payloadRaw, viewError, rawData }: {
  chatId: string;
  view?: ViewReference;
  payloadRaw: string;
  viewError?: string;
  /** Markdown body shown when the view cannot render. */
  rawData?: string;
}) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [resolvedView, setResolvedView] = useState(view);
  const [html, setHTML] = useState("");
  const [error, setError] = useState("");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const identity = JSON.stringify([chatId, view?.source, view?.connectorId, view?.key, view?.hash, viewError]);
  useEffect(() => {
    let active = true;
    ready.current = false;
    setHTML(""); setError(""); setHeight(DEFAULT_HEIGHT);
    if (viewError) { setError(viewError); return; }
    if (!view || (view.source === "connector" && (!chatId || !view.hash))) { setError("view_unavailable"); return; }
    getView({ source: view.source, chatId, connectorId: view.connectorId, key: view.key, hash: view.hash, usage: "display" })
      .then(response => { if (active) { setResolvedView(response.data.view); setHTML(viewDocumentHTML(response.data, "display")); } })
      .catch(error => { if (active) setError(String(error.message)); });
    return () => { active = false; ready.current = false; };
  }, [identity]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.data?.type !== "view_resize") return;
      const next = clampViewHeight(event.data.height);
      if (next !== undefined) setHeight(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const post = (type: "view_init" | "view_update") => frame.current?.contentWindow?.postMessage({
    type, data: { view: resolvedView, payload: safeJsonParse(payloadRaw, payloadRaw) },
  }, "*");
  useEffect(() => { if (ready.current) post("view_update"); }, [payloadRaw]);
  return <div className="tw:my-2">
    {error && <div role="alert">{t("view.loadFailed", { detail: error })}</div>}
    {error && rawData && <details className="tw:mt-1 tw:text-sm">
      <summary>{t("view.rawData")}</summary>
      <pre className="tw:overflow-auto tw:whitespace-pre-wrap">{rawData}</pre>
    </details>}
    {!error && !html && <div role="status">{t("view.loading")}</div>}
    {html && <iframe ref={frame} title={`view-${resolvedView?.connectorId || resolvedView?.source}-${resolvedView?.key}`} srcDoc={html}
      sandbox="allow-scripts" className="tw:w-full tw:border-0" style={{ height }}
      onLoad={() => { ready.current = true; post("view_init"); }} />}
  </div>;
}
