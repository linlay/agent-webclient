import { useCallback, useEffect, useRef, useState } from "react";
import { deleteWebapp, getWebappConfiguration, getWebappHost, getWebapps, installWebapp, launchWebapp, preflightWebapp, saveWebappPolicy, saveWebappUserConfig, setWebappState, uploadWebapp } from "@/shared/data";
import type { WebappConfiguration, WebappEntry, WebappHost, WebappPolicyInput, WebappReview } from "@/shared/data";
import { submitWebappLaunch } from "../lib/launch";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";

export function useWebapps(initialId = "") {
  const session = getDataSessionRevision(); const lifecycle = useRef(0); const dataSession = useRef(session);
  const [host, setHost] = useState<WebappHost>();
  const [items, setItems] = useState<WebappEntry[]>([]);
  const [detail, setDetail] = useState<WebappConfiguration>();
  const [review, setReview] = useState<WebappReview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false); const operation = useRef<AbortController>();
  const selection = useRef<AbortController>(); const selectedId = useRef("");
  const select = useCallback(async (id: string, quiet = false) => {
    const identity = getDataSessionRevision();
    selectedId.current = id; selection.current?.abort(); const current = new AbortController(); selection.current = current;
    if (!quiet) setDetail(undefined);
    if (!id) return;
    try { const response = await getWebappConfiguration(id, current.signal); if (!response.data?.entry || response.data.entry.id !== id || response.data.manifest?.id !== id) throw new Error("webapp_invalid_platform_response"); if (!current.signal.aborted && mounted.current && identity === getDataSessionRevision()) setDetail(response.data); }
    catch (e) { if (!current.signal.aborted && mounted.current && identity === getDataSessionRevision()) setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const identity = getDataSessionRevision();
    const [hostResponse, listResponse] = await Promise.all([getWebappHost(signal), getWebapps(signal)]);
    if (!mounted.current || signal?.aborted || identity !== getDataSessionRevision()) return;
    if (!Array.isArray(listResponse.data?.items) || !hostResponse.data || typeof hostResponse.data.staticAvailable !== "boolean") throw new Error("webapp_invalid_platform_response");
    setHost(hostResponse.data); setItems(listResponse.data.items);
    const id = listResponse.data.items.some(item => item.id === selectedId.current) ? selectedId.current : listResponse.data.items[0]?.id || "";
    await select(id, true);
  }, [select]);
  useEffect(() => {
    mounted.current = true; lifecycle.current++; dataSession.current = session; selectedId.current = /^webapp-[a-f0-9]{16}$/.test(initialId) ? initialId : "";
    setHost(undefined); setItems([]); setDetail(undefined); setReview(undefined); setError(""); setBusy(false); setLoading(true);
    const controller = new AbortController();
    refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); operation.current?.abort(); operation.current = undefined; selection.current?.abort(); };
  }, [refresh, session, initialId]);
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current || session !== getDataSessionRevision() || dataSession.current !== session) return;
    const epoch = lifecycle.current;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError("");
    try { await action(controller.signal); }
    catch (e) { if (mounted.current && epoch === lifecycle.current && session === getDataSessionRevision()) setError(controller.signal.aborted ? "webapp_request_cancelled_inspect_state" : e instanceof Error ? e.message : String(e)); }
    finally { if (operation.current === controller) operation.current = undefined; if (mounted.current && epoch === lifecycle.current && session === getDataSessionRevision()) setBusy(false); }
  }, [session]);
  useEffect(() => {
    if (busy || !items.some(item => item.backend && item.desiredState === "running")) return;
    const controller = new AbortController(); let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return; pending = true;
      refresh(controller.signal).catch(e => { if (!controller.signal.aborted && session === getDataSessionRevision()) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { pending = false; });
    }, 2000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [items, busy, refresh, session]);
  const current = (signal: AbortSignal) => mounted.current && !signal.aborted && session === getDataSessionRevision();
  return {
    host: dataSession.current === session ? host : undefined, items: dataSession.current === session ? items : [], detail: dataSession.current === session ? detail : undefined, review: dataSession.current === session ? review : undefined, error: dataSession.current === session ? error : "", busy: dataSession.current === session && busy, loading: dataSession.current !== session || loading, select, setReview,
    retry: () => run(async signal => { await refresh(signal); }),
    cancel: () => operation.current?.abort(),
    preflight: (file: File) => run(async signal => {
      if (!/\.zip$/i.test(file.name) || file.size <= 0 || file.size > (host?.maxArchiveMiB || 100) * 1024 * 1024) throw new Error("webapp_archive_size_or_type_invalid");
      const upload = await uploadWebapp(file, signal); if (!current(signal)) return; const result = await preflightWebapp(upload.data.uploadId, signal);
      if (result.data.uploadId !== upload.data.uploadId || result.data.sha256 !== upload.data.sha256) throw new Error("webapp_invalid_platform_response");
      if (current(signal)) setReview(result.data);
    }),
    install: () => run(async signal => { if (!review) return; const response = await installWebapp(review, signal); if (!current(signal)) return; selectedId.current = response.data.id; setReview(undefined); await refresh(signal); }),
    state: (entry: WebappEntry, action: "start" | "stop" | "restart") => run(async signal => { await setWebappState(entry.id, action, entry, signal); if (current(signal)) await refresh(signal); }),
    open: (entry: WebappEntry) => run(async signal => { const response = await launchWebapp(entry.id, signal); if (current(signal)) submitWebappLaunch(response.data); }),
    remove: (entry: WebappEntry, purge: boolean) => run(async signal => { await deleteWebapp(entry, purge, signal); if (current(signal)) await refresh(signal); }),
    saveConfig: (values: WebappConfiguration["userConfig"]) => run(async signal => { if (!detail) return; const result = await saveWebappUserConfig(detail.entry.id, detail.configRevision, values, signal); if (current(signal)) setDetail(result.data); }),
    savePolicy: (values: WebappPolicyInput) => run(async signal => { if (!detail) return; const result = await saveWebappPolicy(detail.entry.id, values, signal); if (current(signal)) setDetail(result.data); }),
  };
}
