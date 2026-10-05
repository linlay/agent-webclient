import { useCallback, useEffect, useRef, useState } from "react";
import { listKBases } from "@/shared/data/api/requests/kbases";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
export function useKBases() {
 const [items, setItems] = useState<KnowledgeBase[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const alive = useRef(true);
 const reload = useCallback(async () => {
  try { const r = await listKBases(); if (alive.current) { setItems(r.data || []); setError(""); } }
  catch (e) { if (alive.current) setError(String(e instanceof Error ? e.message : e)); }
  finally { if (alive.current) setLoading(false); }
 }, []);
 useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; }; }, [reload]);
 const indexing = items.some(x => x.state === "indexing");
 useEffect(() => { if (!indexing) return; const timer = window.setInterval(() => { void reload(); }, 2000); return () => window.clearInterval(timer); }, [indexing, reload]);
 return { items, loading, error, reload };
}
