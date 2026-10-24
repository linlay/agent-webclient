import { useEffect, useRef, useState } from "react";
import type { ViewDocument, ViewReference } from "@/shared/contracts/view";
import { getView, queryView } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import { safeJsonParse } from "@/shared/utils/safeJsonParse";
import { useI18n } from "@/shared/i18n";
import { useOptionalAppContext } from "@/app/state/provider";

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 48;

// Display views size to their content with no upper bound; the timeline
// scrolls. HITL form hosts keep their own capped height.
export function clampViewHeight(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(MIN_HEIGHT, Math.ceil(value));
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Display views have no submit/action listener. Only HITL's host may submit.
// Connector views load only frozen Chat snapshots named by an event hash, and
// may run only queries their snapshot declares, as the viewing user.
export function ViewEmbed({ chatId, view, payloadRaw, viewError, rawData, runId, query }: {
  chatId: string;
  view?: ViewReference;
  payloadRaw: string;
  viewError?: string;
  /** Markdown body shown when the view cannot render. */
  rawData?: string;
  /** Run whose content published the view; required for view queries. */
  runId?: string;
  /** Markdown query block: payloadRaw holds the params of this declared query. */
  query?: string;
}) {
  const { t, locale } = useI18n();
  const colorScheme = useOptionalAppContext()?.state.themeMode;
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const documentRef = useRef<ViewDocument | null>(null);
  const lastPayload = useRef<unknown>(undefined);
  const lastQueryContext = useRef<Record<string, unknown>>({});
  const [resolvedView, setResolvedView] = useState(view);
  const [html, setHTML] = useState("");
  const [error, setError] = useState("");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const identity = JSON.stringify([chatId, view?.source, view?.connectorId, view?.key, view?.hash, viewError]);
  const queryable = () => Boolean(
    runId && chatId && view?.source === "connector" && view.connectorId && view.hash
    && Object.keys(documentRef.current?.queries || {}).length,
  );
  const runQuery = (name: string, params: Record<string, unknown>) => {
    if (!queryable() || !view?.connectorId || !view.hash || !documentRef.current?.queries?.[name]) {
      return Promise.reject(new Error("view_query_unavailable"));
    }
    return queryView({ chatId, runId: runId as string, view: { connectorId: view.connectorId, key: view.key, hash: view.hash }, query: name, params })
      .then((response) => response.data.result);
  };

  useEffect(() => {
    let active = true;
    ready.current = false;
    documentRef.current = null;
    setHTML(""); setError(""); setHeight(DEFAULT_HEIGHT);
    if (viewError) { setError(viewError); return; }
    if (!view || (view.source === "connector" && (!chatId || !view.hash))) { setError("view_unavailable"); return; }
    getView({ source: view.source, chatId, connectorId: view.connectorId, key: view.key, hash: view.hash, usage: "display" })
      .then(response => {
        if (!active) return;
        documentRef.current = response.data;
        setResolvedView(response.data.view);
        setHTML(viewDocumentHTML(response.data, "display"));
      })
      .catch(error => { if (active) setError(errorCode(error)); });
    return () => { active = false; ready.current = false; };
  }, [identity]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target) return;
      const message = event.data;
      if (message?.type === "view_resize") {
        const next = clampViewHeight(message.height);
        if (next !== undefined) setHeight(next);
        return;
      }
      if (message?.type !== "view_query" || typeof message.id !== "string" || typeof message.query !== "string") return;
      const reply = (result: { ok: boolean; result?: unknown; error?: string }) =>
        target.postMessage({ type: "view_query_result", id: message.id, ...result }, "*");
      if (!isObject(message.params)) { reply({ ok: false, error: "view_query_params_invalid" }); return; }
      runQuery(message.query, message.params)
        .then((result) => reply({ ok: true, result }))
        .catch((error) => reply({ ok: false, error: errorCode(error) }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const post = (type: "view_init" | "view_update") => frame.current?.contentWindow?.postMessage({
    type,
    data: {
      view: resolvedView,
      payload: lastPayload.current,
      context: { ...lastQueryContext.current, queryable: queryable(), locale, colorScheme },
    },
  }, "*");

  const initialize = () => {
    ready.current = true;
    if (!query) {
      lastPayload.current = safeJsonParse(payloadRaw, payloadRaw);
      lastQueryContext.current = {};
      post("view_init");
      return;
    }
    const params = safeJsonParse(payloadRaw, null);
    const queryContext = { query: { name: query, params: isObject(params) ? params : {} } };
    runQuery(query, queryContext.query.params)
      .then((result) => { lastPayload.current = result; lastQueryContext.current = queryContext; })
      .catch((error) => { lastPayload.current = null; lastQueryContext.current = { ...queryContext, error: errorCode(error) }; })
      .finally(() => { if (ready.current) post("view_init"); });
  };

  // Tool results may stream new data; query blocks own their data after init.
  useEffect(() => {
    if (!ready.current || query) return;
    lastPayload.current = safeJsonParse(payloadRaw, payloadRaw);
    post("view_update");
  }, [payloadRaw]);
  useEffect(() => { if (ready.current) post("view_update"); }, [locale, colorScheme]);

  return <div className="tw:my-2">
    {error && <div role="alert">{t("view.loadFailed", { detail: error })}</div>}
    {error && rawData && <details className="tw:mt-1 tw:text-sm">
      <summary>{t("view.rawData")}</summary>
      <pre className="tw:overflow-auto tw:whitespace-pre-wrap">{rawData}</pre>
    </details>}
    {!error && !html && <div role="status">{t("view.loading")}</div>}
    {html && <iframe ref={frame} title={`view-${resolvedView?.connectorId || resolvedView?.source}-${resolvedView?.key}`} srcDoc={html}
      sandbox="allow-scripts" className="tw:w-full tw:border-0" style={{ height, colorScheme }}
      onLoad={initialize} />}
  </div>;
}
