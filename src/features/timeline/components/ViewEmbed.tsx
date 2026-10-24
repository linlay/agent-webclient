import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import type { ViewDocument, ViewQueryResult, ViewReference } from "@/shared/contracts/view";
import { getView, queryView } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import { safeJsonParse } from "@/shared/utils/safeJsonParse";
import { useI18n } from "@/shared/i18n";
import { useOptionalAppContext } from "@/app/state/provider";
import { ViewHeader, type ViewQueryStatus } from "./ViewHeader";

const DEFAULT_HEIGHT = 320;
const SUPERSEDED = "view_query_superseded";
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
export function ViewEmbed({ chatId, view, payloadRaw, viewError, rawData, runId, query, allowExpand = true, onClose }: {
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
  /** Expanded hosts keep metadata but cannot open nested dialogs. */
  allowExpand?: boolean;
  /** Dialog hosts merge the close action into the single VIEW header. */
  onClose?: () => void;
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
  const [expanded, setExpanded] = useState(false);
  const [queryStatus, setQueryStatus] = useState<ViewQueryStatus>({ pending: 0, failed: false });
  const generation = useRef(0);
  const identity = JSON.stringify([chatId, view?.source, view?.connectorId, view?.key, view?.hash, viewError, runId, query, query ? payloadRaw : undefined]);
  const queryable = () => Boolean(
    runId && chatId && view?.source === "connector" && view.connectorId && view.hash
    && Object.keys(documentRef.current?.queries || {}).length,
  );
  // Per query name, only the latest request may answer; older ones are dropped.
  const latestQuery = useRef(new Map<string, number>());
  const querySequence = useRef(0);
  const runQuery = async (name: string, params: Record<string, unknown>): Promise<ViewQueryResult> => {
    const current = generation.current;
    const ticket = ++querySequence.current;
    latestQuery.current.set(name, ticket);
    const latest = () => generation.current === current && latestQuery.current.get(name) === ticket;
    setQueryStatus(previous => ({ ...previous, pending: previous.pending + 1, failed: false }));
    try {
      if (!queryable() || !view?.connectorId || !view.hash || !documentRef.current?.queries?.[name]) {
        throw new Error("view_query_unavailable");
      }
      const response = await queryView({ chatId, runId: runId as string, view: { connectorId: view.connectorId, key: view.key, hash: view.hash }, query: name, params });
      if (!latest()) throw new Error(SUPERSEDED);
      const result = response.data;
      setQueryStatus(previous => ({ ...previous, updatedAt: result.executedAt || Date.now(), failed: false }));
      return result;
    } catch (error) {
      if (latest()) setQueryStatus(previous => ({ ...previous, failed: true }));
      if (generation.current === current && latestQuery.current.get(name) !== ticket) throw new Error(SUPERSEDED);
      throw error;
    } finally {
      if (generation.current === current) setQueryStatus(previous => ({ ...previous, pending: Math.max(0, previous.pending - 1) }));
    }
  };

  useEffect(() => {
    let active = true;
    generation.current += 1;
    setExpanded(false);
    setQueryStatus({ pending: 0, failed: false });
    latestQuery.current.clear();
    ready.current = false;
    documentRef.current = null;
    setHTML(""); setError(""); setHeight(DEFAULT_HEIGHT);
    const cleanup = () => { active = false; ready.current = false; generation.current += 1; };
    if (viewError) { setError(viewError); return cleanup; }
    if (!view || (view.source === "connector" && (!chatId || !view.hash))) { setError("view_unavailable"); return cleanup; }
    getView({ source: view.source, chatId, connectorId: view.connectorId, key: view.key, hash: view.hash, usage: "display" })
      .then(response => {
        if (!active) return;
        documentRef.current = response.data;
        setResolvedView(response.data.view);
        setHTML(viewDocumentHTML(response.data, "display"));
      })
      .catch(error => { if (active) setError(errorCode(error)); });
    return cleanup;
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
      const current = generation.current;
      const reply = (result: { ok: boolean; data?: unknown; executedAt?: number; error?: string }) => {
        if (generation.current === current) target.postMessage({ type: "view_query_result", id: message.id, ...result }, "*");
      };
      if (!isObject(message.params)) { reply({ ok: false, error: "view_query_params_invalid" }); return; }
      runQuery(message.query, message.params)
        .then((result) => reply({ ok: true, data: result.data, executedAt: result.executedAt }))
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
    if (ready.current) return;
    ready.current = true;
    if (!query) {
      lastPayload.current = safeJsonParse(payloadRaw, payloadRaw);
      lastQueryContext.current = {};
      post("view_init");
      return;
    }
    const params = safeJsonParse(payloadRaw, null);
    const queryContext = { query: { name: query, params: isObject(params) ? params : {} } };
    const current = generation.current;
    runQuery(query, queryContext.query.params)
      .then((result) => { if (generation.current === current) { lastPayload.current = result.data; lastQueryContext.current = { ...queryContext, executedAt: result.executedAt }; } })
      .catch((error) => { if (generation.current === current) { lastPayload.current = null; lastQueryContext.current = { ...queryContext, error: errorCode(error) }; } })
      .finally(() => { if (ready.current && generation.current === current) post("view_init"); });
  };

  // Tool results may stream new data; query blocks own their data after init.
  useEffect(() => {
    if (!ready.current || query) return;
    lastPayload.current = safeJsonParse(payloadRaw, payloadRaw);
    post("view_update");
  }, [payloadRaw]);
  useEffect(() => { if (ready.current) post("view_update"); }, [locale, colorScheme]);

  return <div className={onClose ? "tw:m-0 tw:flex tw:h-full tw:min-h-0 tw:flex-col" : "tw:my-2"}>
    <div className={onClose ? "tw:shrink-0" : undefined}>
    <ViewHeader query={query} status={queryStatus} onExpand={allowExpand ? () => setExpanded(true) : undefined} canExpand={Boolean(html) && !error} onClose={onClose} />
    </div>
    <div className={onClose ? "view-dialog-scroll tw:min-h-0 tw:flex-1 tw:overflow-auto" : undefined}>
    {error && <div role="alert">{t("view.loadFailed", { detail: error })}</div>}
    {error && rawData && <details className="tw:mt-1 tw:text-sm">
      <summary>{t("view.rawData")}</summary>
      <pre className="tw:overflow-auto tw:whitespace-pre-wrap">{rawData}</pre>
    </details>}
    {!error && !html && <div role="status">{t("view.loading")}</div>}
    {html && <iframe key={identity} ref={frame} title={`view-${resolvedView?.connectorId || resolvedView?.source}-${resolvedView?.key}`} srcDoc={html}
      sandbox="allow-scripts" className="tw:w-full tw:border-0" style={{ height, colorScheme }}
      onLoad={initialize} />}
    </div>
    {allowExpand && <Modal open={expanded} title={null} closable={false} aria-label={t("view.header.title")}
      width="min(1280px, calc(100vw - 32px))" centered style={{ paddingBottom: 0 }}
      styles={{ content: { height: "80dvh", boxSizing: "border-box", display: "flex", flexDirection: "column", padding: "10px 16px 16px" }, body: { flex: 1, minHeight: 0, overflow: "hidden" } }}
      footer={null} destroyOnHidden onCancel={() => setExpanded(false)}>
      {expanded && <ViewEmbed chatId={chatId} view={view} payloadRaw={payloadRaw}
        viewError={viewError} rawData={rawData} runId={runId} query={query} allowExpand={false} onClose={() => setExpanded(false)} />}
    </Modal>}
  </div>;
}
