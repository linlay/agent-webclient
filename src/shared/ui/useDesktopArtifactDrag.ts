import { useEffect, useRef, useState, type DragEvent } from "react";
import { ARTIFACT_DRAG_GLOBAL, type ArtifactDragBridge } from "@/shared/contracts/generated/agentWebclientBridge";

function getBridge(): ArtifactDragBridge | undefined {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as Record<string, unknown>)[ARTIFACT_DRAG_GLOBAL] as ArtifactDragBridge | undefined;
  return bridge?.version === 1 && typeof bridge.prepare === "function" && typeof bridge.start === "function" ? bridge : undefined;
}

export function useDesktopArtifactDrag(chatId: string, artifactId: string | undefined, source: string, enabled: boolean, onStatus: (status: "preparing" | "failed") => void) {
  const bridge = getBridge();
  let relativePath = "";
  if (/^@chat\/artifacts\//iu.test(source)) relativePath = source.slice(6);
  else if (source.startsWith("artifacts/")) {
    try { relativePath = source.split("/").map(decodeURIComponent).join("/"); } catch { /* Invalid path disables export. */ }
  }
  const runId = /^artifacts\/([^/]+)\//u.exec(relativePath)?.[1];
  const available = Boolean(bridge && enabled && chatId && runId);
  const lease = useRef<{ token: string; expiresAt: number } | null>(null);
  const generation = useRef(0), pending = useRef(false);
  const [status, setStatus] = useState<"idle" | "preparing" | "ready" | "failed">("idle");
  useEffect(() => {
    generation.current++; pending.current = false; lease.current = null; setStatus("idle");
    return () => { generation.current++; };
  }, [chatId, artifactId, source, available]);
  function prepare() {
    if (!available || !bridge || pending.current) return;
    const version = generation.current;
    pending.current = true; setStatus("preparing");
    void bridge.prepare({ chatId, ...(artifactId && !artifactId.startsWith("resource:") ? { artifactId } : {}), runId, relativePath }).then(result => {
      if (version !== generation.current) return;
      lease.current = result.ok ? result : null; setStatus(result.ok ? "ready" : "failed");
    }).catch(() => { if (version === generation.current) setStatus("failed"); })
      .finally(() => { if (version === generation.current) pending.current = false; });
  }
  return {
    available, status,
    props: available ? {
      draggable: true,
      onPointerEnter: prepare, onPointerDown: prepare, onFocus: prepare,
      onDragStart(event: DragEvent<HTMLElement>) {
        event.preventDefault(); event.stopPropagation();
        if (lease.current && lease.current.expiresAt > Date.now() && bridge) {
          bridge.start(lease.current.token); generation.current++; pending.current = false; lease.current = null; setStatus("idle");
        } else { onStatus(status === "failed" ? "failed" : "preparing"); prepare(); }
      },
    } : {},
  };
}
