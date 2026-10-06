import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { ApiError, getMemoryFile, saveMemoryFile, deleteMemoryFile, getMemoryDates, searchMemoryFiles } from "@/shared/data";
import type { MemoryDocument, MemoryKind, MemoryMatch } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
export function useMemoryFiles() {
    const { t } = useI18n();
    const [document, setDocument] = useState<MemoryDocument | null>(null);
    const [draft, setDraft] = useState("");
    const [dates, setDates] = useState<string[]>([]);
    const [today, setToday] = useState("");
    const [nextBefore, setNextBefore] = useState("");
    const [matches, setMatches] = useState<MemoryMatch[] | null>(null);
    const [searchBefore, setSearchBefore] = useState("");
    const [query, setQuery] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [conflict, setConflict] = useState(false);
    const generation = useRef(0);
    const pending = useRef(false);
    const dirty = document !== null && draft !== document.content;
    const report = useCallback((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
            setConflict(true);
            setError(t("memoryFiles.conflict"));
        }
        else
            setError(err instanceof Error ? err.message : t("memoryFiles.error"));
    }, [t]);
    const refreshDates = useCallback(async (before = "") => {
        const result = await getMemoryDates(before);
        setDates(old => before ? [...new Set([...old, ...result.data.dates])] : result.data.dates);
        setToday(result.data.today);
        setNextBefore(result.data.nextBefore);
    }, []);
    const load = useCallback(async (kind: MemoryKind, date = "") => {
        const id = ++generation.current;
        pending.current = true;
        setBusy(true);
        setError("");
        setMessage("");
        setConflict(false);
        try {
            const result = await getMemoryFile(kind, date);
            if (id === generation.current) {
                setDocument(result.data);
                setDraft(result.data.content);
            }
        }
        catch (err) {
            if (id === generation.current)
                report(err);
        }
        finally {
            if (id === generation.current) {
                pending.current = false;
                setBusy(false);
            }
        }
    }, [report]);
    useEffect(() => { void load("memory"); void refreshDates().catch(report); return () => { generation.current++; }; }, []);
    useEffect(() => {
        const guard = (event: BeforeUnloadEvent) => { if (dirty || pending.current) {
            event.preventDefault();
            event.returnValue = "";
        } };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && (dirty || pending.current));
    useEffect(() => { if (blocker.state !== "blocked")
        return; if (!pending.current && window.confirm(t("memoryFiles.discard")))
        blocker.proceed();
    else
        blocker.reset(); }, [blocker, t]);
    const canLeave = () => !pending.current && (!dirty || window.confirm(t("memoryFiles.discard")));
    const select = (kind: MemoryKind, date = "") => { if (canLeave())
        void load(kind, date); };
    const save = async () => {
        if (!document || pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await saveMemoryFile({ ...document, content: draft });
            setDocument(result.data);
            setDraft(result.data.content);
            setConflict(false);
            setMessage(t("memoryFiles.saved"));
            await refreshDates();
        }
        catch (err) {
            report(err);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    };
    const remove = async () => {
        if (!document || pending.current || !window.confirm(t("memoryFiles.deleteConfirm")))
            return;
        pending.current = true;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await deleteMemoryFile(document);
            setDocument(result.data);
            setDraft("");
            setConflict(false);
            setMessage(t("memoryFiles.deleted"));
            await refreshDates();
        }
        catch (err) {
            report(err);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    };
    const search = async (before = "") => {
        if (pending.current || !query.trim())
            return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            const result = await searchMemoryFiles(query, before);
            setMatches(old => before ? [...(old || []), ...result.data.matches] : result.data.matches);
            setSearchBefore(result.data.nextBefore);
        }
        catch (err) {
            report(err);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    };
    return { document, draft, setDraft, dates, today, nextBefore, matches, query, setQuery, searchBefore, error, message, busy, dirty, conflict,
        select, save, remove, search, canLeave, reload: () => { if (document && canLeave()) { void load(document.kind, document.date); void refreshDates().catch(report); } },
        moreDates: () => { if (!pending.current)
            void refreshDates(nextBefore).catch(report); },
        clearSearch: () => { setMatches(null); setQuery(""); setSearchBefore(""); } };
}
