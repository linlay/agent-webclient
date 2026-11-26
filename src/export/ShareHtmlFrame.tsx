import React, { useEffect, useRef } from "react";
import type { ShareHtmlDelivery } from "./shareHtmlDocument";
import styles from "./ShareHtmlFrame.module.css";

export type ShareHtmlFrameStatus = "loading" | "ready" | "error";

export function versionedShareHtmlPreview(path: string): string {
  const assetSet = document.querySelector<HTMLMetaElement>('meta[name="conversation-export-asset-set"]')?.content ?? "";
  if (!path || !/^[a-f0-9]{64}$/u.test(assetSet)) return "";
  return `${path}${path.includes("?") ? "&" : "?"}assetSet=${assetSet}`;
}

/** One mounted frame, one document-bound channel, one delivery. No guest RPC. */
export function ShareHtmlFrame({ url, title, loadPayload, onStatus, onHeight }: {
  url: string;
  title: string;
  loadPayload: (signal: AbortSignal) => Promise<ShareHtmlDelivery>;
  onStatus: (status: ShareHtmlFrameStatus) => void;
  onHeight?: (height: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = host.current;
    if (!container || !url) { onStatus("error"); return; }
    onStatus("loading");
    const frame = document.createElement("iframe");
    frame.title = title;
    frame.className = styles.frame;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    let phase: "loading" | "ready" | "reading" | "sent" | "closed" = "loading";
    let attachmentDocumentLoad = false;
    let port: MessagePort | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => fail(), 15_000);
    const close = () => {
      phase = "closed";
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("message", ready);
      if (port) { port.onmessage = null; port.close(); }
      frame.onload = null;
      frame.remove();
    };
    const fail = () => { close(); onStatus("error"); };
    const ready = (event: MessageEvent) => {
      if (phase !== "ready" || event.source !== frame.contentWindow || event.origin !== "null" ||
        event.data?.type !== "conversation-html-ready" || event.ports.length !== 1) return;
      phase = "reading";
      port = event.ports[0];
      window.removeEventListener("message", ready);
      port.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (phase !== "sent" || !data || typeof data !== "object" || !("type" in data)) return;
        if (data.type === "rendered") { window.clearTimeout(timer); onStatus("ready"); }
        else if (data.type === "error" || data.type === "navigate") fail();
        else if (data.type === "size" && "height" in data && typeof data.height === "number" && Number.isFinite(data.height) && data.height > 0) {
          onHeight?.(Math.min(100_000, Math.ceil(data.height)));
        }
      };
      port.start();
      void loadPayload(controller.signal).then(payload => {
        if (phase !== "reading" || controller.signal.aborted || !frame.isConnected) return;
        phase = "sent";
        attachmentDocumentLoad = payload.kind === "attachment";
        port!.postMessage(payload, payload.kind === "attachment" ? payload.content.media.map(media => media.bytes) : []);
      }).catch(() => { if (phase !== "closed") fail(); });
    };
    window.addEventListener("message", ready);
    frame.onload = () => {
      if (phase === "loading") {
        phase = "ready";
        // Only the non-sensitive handshake uses '*'; content goes over the port.
        frame.contentWindow?.postMessage({ type: "conversation-html-connect" }, "*");
      } else if (phase === "sent" && attachmentDocumentLoad) {
        attachmentDocumentLoad = false; // document.open/write replaces the attachment document once.
      } else if (phase !== "closed") fail();
    };
    frame.src = url;
    container.append(frame);
    return close;
  }, [url, title, loadPayload, onStatus, onHeight]);
  return <div className={styles.host} ref={host} />;
}
