import { connectorErrorDetails } from "../lib/connectorError";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { fetchConnectorCatalog, isConnectorCatalogUpdate } from "@/features/connectors/lib/connectorCatalog";
import { parseConnectorDefinition } from "@/features/connectors/lib/connectorDefinition";
import { ApiError, deleteConnector, getConnectorDefinition, importConnectorArchive, updateConnectorDefinition } from "@/shared/data";
import type { AdminToolSummary, ConnectorDefinition, ConnectorDefinitionFile, ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

export function useConnectorsRuntime(routeId: string, onRouteIdChange: (id: string) => void) {
  const { t } = useI18n();
  const push = usePushTransport();
  const [items, setItems] = useState<ConnectorSummary[]>([]);
  const [tools, setTools] = useState<AdminToolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogErrorStatus, setCatalogErrorStatus] = useState<number | null>(null);
  const [file, setFile] = useState<ConnectorDefinitionFile>("connector.json");
  const [detail, setDetail] = useState<ConnectorDefinition | null>(null);
  const [draft, setDraft] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const setError = (message: string) => { setErrorMessage(message); setErrorDetails(""); };
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
  const readOnly = selected?.readOnly === true || selected?.builtin === true;
  const canDelete = !!selected && selected.canDelete !== false && !readOnly;
  const activeFile = dirty && detail?.id === selectedId ? detail.file : (file === "mcp.json" && !selected?.hasMcp) || (file === "cli.json" && !selected?.hasCli) || (file === "view.json" && !selected?.hasView) || (file === "native.json" && !selected?.hasNative) ? "connector.json" : file;
  const catalogRequest = useRef(0);
  const detailRequest = useRef(0);
  const catalogBusy = useRef(false);
  const savingRef = useRef(false);
  const importingRef = useRef(false);
  const deletingRef = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && (dirtyRef.current || savingRef.current || importingRef.current || deletingRef.current),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (!savingRef.current && !importingRef.current && !deletingRef.current && window.confirm(t("connectors.confirm.discard"))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  const refreshCatalog = useCallback(async (silent = false) => {
    if (silent && (catalogBusy.current || savingRef.current || importingRef.current || deletingRef.current)) return;
    const request = ++catalogRequest.current;
    catalogBusy.current = true;
    if (!silent) setLoading(true);
    try {
      const snapshot = await fetchConnectorCatalog();
      if (request !== catalogRequest.current) return;
      setItems(snapshot.items);
      setTools(snapshot.tools);
      setCatalogError("");
      setCatalogErrorStatus(null);
    } catch (cause) {
      if (request === catalogRequest.current) {
        setCatalogError(cause instanceof Error ? cause.message : String(cause));
        setCatalogErrorStatus(cause instanceof ApiError ? cause.status : null);
      }
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
      if (!dirtyRef.current && !savingRef.current && !importingRef.current && !deletingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const selectFile = (next: ConnectorDefinitionFile) => {
    if (savingRef.current || importingRef.current || deletingRef.current) return false;
    if (next === activeFile) return true;
    if (dirty && !window.confirm(t("connectors.confirm.discard"))) return false;
    setDetail(null);
    setDraft("");
    setFile(next);
    return true;
  };
  const reload = () => {
    if (savingRef.current || importingRef.current || deletingRef.current || (dirty && !window.confirm(t("connectors.confirm.discard")))) return;
    setRevision(value => value + 1);
    void refreshCatalog();
  };
  const save = async () => {
    if (!detail || readOnly || detailLoading || savingRef.current || importingRef.current || deletingRef.current || !dirty || detail.id !== selectedId || detail.file !== activeFile) return;
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

  const importArchive = async (archive: File, overwrite: boolean): Promise<string | null> => {
    if (savingRef.current || importingRef.current || deletingRef.current) return null;
    if (dirtyRef.current && !window.confirm(t("connectors.import.confirmDraft"))) return null;
    importingRef.current = true;
    setImporting(true);
    try {
      const response = await importConnectorArchive({ file: archive, overwrite });
      const id = response.data.id;
      // The upload succeeded. Only now discard the previous draft and reload its hash.
      detailRequest.current += 1;
      dirtyRef.current = false;
      setDetail(null);
      setDraft("");
      setFile("connector.json");
      setRevision(value => value + 1);
      await refreshCatalog();
      importingRef.current = false;
      onRouteIdChange(id);
      return id;
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const remove = async (id?: string): Promise<string | null> => {
    const target = id ? items.find(item => item.id === id) : selected;
    if (!target) return null;
    const targetReadOnly = target.readOnly === true || target.builtin === true;
    const targetCanDelete = target.canDelete !== false && !targetReadOnly;
    if (!targetCanDelete || savingRef.current || importingRef.current || deletingRef.current) return null;
    const targetId = target.id;
    const isSelected = targetId === selectedId;
    const prompt = t("connectors.delete.confirm", { name: target.name, id: targetId })
      + (isSelected && dirtyRef.current ? "\n\n" + t("connectors.delete.unsaved") : "");
    if (!window.confirm(prompt)) return null;
    deletingRef.current = true;
    setDeleting(true);
    setDeletingId(targetId);
    setError("");
    setMessage("");
    // Reject catalog requests started before the deletion, including slow polling responses.
    catalogRequest.current += 1;
    catalogBusy.current = false;
    try {
      await deleteConnector(targetId);
      detailRequest.current += 1;
      dirtyRef.current = false;
      setDetail(null);
      setDraft("");
      setFile("connector.json");
      setItems(previous => previous.filter(item => item.id !== targetId));
      await refreshCatalog();
      deletingRef.current = false;
      if (isSelected) {
        selectionRef.current = undefined;
        onRouteIdChange("");
      }
      return targetId;
    } catch (cause) {
      const data = cause instanceof ApiError && cause.status === 409 ? cause.data : null;
      const details = data && typeof data === "object" && "error" in data ? data.error : data;
      const agentKeys = details && typeof details === "object" && "agentKeys" in details
        && Array.isArray(details.agentKeys) ? details.agentKeys.filter((key): key is string => typeof key === "string" && !!key.trim()) : [];
      setError(agentKeys.length ? t("connectors.delete.inUse", { agents: agentKeys.join(", ") })
        : cause instanceof Error ? cause.message : String(cause));
      setErrorDetails(connectorErrorDetails(cause));
      return null;
    } finally {
      deletingRef.current = false;
      setDeleting(false);
      setDeletingId("");
      setLoading(false);
    }
  };

  return {
    items, tools, loading, catalogError, catalogErrorStatus, selected, file: activeFile, detail, draft, dirty, readOnly,
    detailLoading, saving, importing, deleting, deletingId, canDelete, remove, error, errorDetails, message, refreshCatalog, selectFile, reload, save, importArchive,
    selectConnector: (id: string) => { if (!savingRef.current && !importingRef.current && !deletingRef.current && id !== selectedId) onRouteIdChange(id); },
    updateDraft: (value: string) => { if (!readOnly && !savingRef.current && !importingRef.current && !deletingRef.current) { setDraft(value); setMessage(""); setError(""); } },
  };
}
