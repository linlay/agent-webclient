import { useEffect, useRef, useState } from "react";
import { cancelMemoryMaintenance, getMemoryMaintenanceStatus, triggerMemoryMaintenance } from "@/shared/data";
import type { MemoryMaintenanceStatus, MemoryRangeRequest } from "@/shared/data";

export function useMemoryMaintenance() {
    const [status, setStatus] = useState<MemoryMaintenanceStatus | null>(null);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const pending = useRef(false);
    const generation = useRef(0);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const id = generation.current;
            try {
                if (!pending.current) {
                    const result = await getMemoryMaintenanceStatus();
                    if (!stopped && id === generation.current) { setStatus(result.data); setError(""); }
                }
            } catch (err) {
                if (!stopped && id === generation.current) setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!stopped) timer = setTimeout(poll, 3000);
            }
        };
        void poll();
        return () => { stopped = true; mounted.current = false; generation.current++; clearTimeout(timer); };
    }, []);
    const submit = async (range?: MemoryRangeRequest) => {
        if (pending.current) return;
        if (!range && !status?.manual) return;
        pending.current = true;
        generation.current++;
        setSubmitting(true);
        setError("");
        try {
            const next = range ? (await triggerMemoryMaintenance(range)).data.status
                : (await cancelMemoryMaintenance(status!.manual!.id)).data;
            if (mounted.current) setStatus(next);
        } catch (err) {
            if (mounted.current) setError(err instanceof Error ? err.message : String(err));
        } finally {
            pending.current = false;
            if (mounted.current) setSubmitting(false);
        }
    };
    const manualActive = !!status?.manual && ["queued", "running", "canceling"].includes(status.manual.state);
    const active = manualActive || status?.state === "queued" || status?.state === "running";
    return { status, error, submitting, active, manualActive, start: (range: MemoryRangeRequest) => submit(range), cancel: () => submit() };
}
