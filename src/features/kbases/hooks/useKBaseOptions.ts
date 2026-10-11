import { useCallback, useEffect, useRef, useState } from "react";
import type { KBaseOptionsResponse } from "@/shared/data/api/dto/kbases";
import { loadKBaseOptions } from "../lib/kbaseOptions";
export interface KBaseCatalog {
 status: "idle" | "loading" | "success" | "error";
 data?: KBaseOptionsResponse;
 error?: string;
 refresh: () => void;
}
export function useKBaseOptions(agentKey: string, enabled: boolean): KBaseCatalog {
 const [result, setResult] = useState<Omit<KBaseCatalog, "refresh"> & { agentKey: string }>({agentKey, status: "idle"});
 const [revision, setRevision] = useState(0);
 const requested = useRef(false);
 const refresh = useCallback(() => { requested.current = true; setRevision(value => value + 1); }, []);
 useEffect(() => { requested.current = false; }, [agentKey]);
 useEffect(() => {
  if (!agentKey || (!enabled && !requested.current)) return;
  const controller = new AbortController();
  setResult({agentKey, status: "loading"});
  void loadKBaseOptions(agentKey, controller.signal).then(data => {
   if (!controller.signal.aborted) setResult({agentKey, status: "success", data});
  }).catch(error => {
   if (!controller.signal.aborted) setResult({agentKey, status: "error", error: error?.status === 404 || error?.status === 405 ? "kbase.protocolUnavailable" : String(error?.message || error)});
  });
  return () => controller.abort();
 }, [agentKey, enabled, revision]);
 return {...(result.agentKey === agentKey ? result : {status: "idle" as const}), refresh};
}
