import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { fetchConnectorCatalog, isConnectorCatalogUpdate } from "@/features/connectors/lib/connectorCatalog";
import { parseConnectorDefinition } from "@/features/connectors/lib/connectorDefinition";
import { ApiError, getConnectorDefinition, updateConnectorDefinition } from "@/shared/data";
import type { AdminToolSummary, ConnectorDefinition, ConnectorDefinitionFile, ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

export function useConnectorsRuntime(routeId: string, onRouteIdChange: (id: string) => void) {
  const { t } = useI18n();
  const push = usePushTransport();
  const [items, setItems] = useState<ConnectorSummary[]>([]);
  const [tools, setTools] = useState<AdminToolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [file, setFile] = useState<ConnectorDefinitionFile>("connector.json");
  const [detail, setDetail] = useState<ConnectorDefinition | null>(null);
  const [draft, setDraft] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = !!detail && draft !== detail.content;
  const selectionRef = useRef<ConnectorSummary>();
  const requestedId = routeId || selectionRef.current?.id;
  const currentItem = items.find(item => item.id === requestedId);
  // A catalog update must not replace the editing target or discard a removed package's draft.
  const selected = currentItem || (dirty && selectionRef.current?.id === requestedId ? selectionRef.current : !routeId ? items[0] : undefined);
  selectionRef.current = selected;
  const selectedId = selected?.id || "";
  const activeFile = dirty && detail?.id === selectedId ? detail.file : (file === "mcp.json" && !selected?.hasMcp) || (file === "cli.json" && !selected?.hasCli) ? "connector.json" : file;
  const catalogRequest = useRef(0);
  const detailRequest = useRef(0);
  const catalogBusy = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && (dirtyRef.current || savingRef.current),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (!savingRef.current && window.confirm(t("connectors.confirm.discard"))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  const refreshCatalog = useCallback(async (silent = false) => {
    if (silent && (catalogBusy.current || savingRef.current)) return;
    const request = ++catalogRequest.current;
    catalogBusy.current = true;
    if (!silent) setLoading(true);
    try {
      const snapshot = await fetchConnectorCatalog();
      if (request !== catalogRequest.current) return;
      setItems(snapshot.items);
      setTools(snapshot.tools);
      setCatalogError("");
    } catch (cause) {
      if (request === catalogRequest.current) setCatalogError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === catalogRequest.current) {
        catalogBusy.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
    return () => { catalogRequest.current += 1; catalogBusy.current = false; };
  }, [refreshCatalog]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      if (!isConnectorCatalogUpdate(frame)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refreshCatalog(true), 150);
    });
    const refreshVisible = () => { if (document.visibilityState === "visible") void refreshCatalog(true); };
    const interval = window.setInterval(refreshVisible, 5_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [push, refreshCatalog]);

  useEffect(() => {
    const request = ++detailRequest.current;
    setDetail(null);
    setDraft("");
    setError("");
    setMessage("");
    setDetailLoading(!!selectedId);
    if (selectedId) {
      void getConnectorDefinition({ id: selectedId, file: activeFile }).then(response => {
        if (request !== detailRequest.current) return;
        setDetail(response.data);
        setDraft(response.data.content);
      }).catch(cause => {
        if (request === detailRequest.current) setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => {
        if (request === detailRequest.current) setDetailLoading(false);
      });
    }
    return () => { detailRequest.current += 1; };
  }, [selectedId, activeFile, revision]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const selectFile = (next: ConnectorDefinitionFile) => {
    if (next === activeFile || savingRef.current) return;
    if (dirty && !window.confirm(t("connectors.confirm.discard"))) return;
    setDetail(null);
    setDraft("");
    setFile(next);
  };
  const reload = () => {
    if (savingRef.current || (dirty && !window.confirm(t("connectors.confirm.discard")))) return;
    setRevision(value => value + 1);
    void refreshCatalog();
  };
  const save = async () => {
    if (!detail || detailLoading || savingRef.current || !dirty || detail.id !== selectedId || detail.file !== activeFile) return;
    setError("");
    setMessage("");
    try { parseConnectorDefinition(draft); }
    catch (cause) { setError(t("connectors.error.json", { message: cause instanceof Error ? cause.message : String(cause) })); return; }
    const request = detailRequest.current;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await updateConnectorDefinition({ id: detail.id, file: detail.file, content: draft, baseSha256: detail.sha256 });
      if (request !== detailRequest.current) return;
      setDetail(response.data);
      setDraft(response.data.content);
      setMessage(t("connectors.message.saved"));
      void refreshCatalog();
    } catch (cause) {
      if (request !== detailRequest.current) return;
      setError(cause instanceof ApiError && cause.status === 409 ? t("connectors.error.conflict") : cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return {
    items, tools, loading, catalogError, selected, file: activeFile, detail, draft, dirty,
    detailLoading, saving, error, message, refreshCatalog, selectFile, reload, save,
    selectConnector: (id: string) => { if (!savingRef.current && id !== selectedId) onRouteIdChange(id); },
    updateDraft: (value: string) => { setDraft(value); setMessage(""); setError(""); },
  };
}
