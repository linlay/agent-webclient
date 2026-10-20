import React, { useEffect, useRef, useState } from "react";
import { conversationExportMessages, type ConversationExportLocale } from "@/shared/i18n/conversationExport";
import type { SnapshotAttachmentV1, SnapshotOmittedResource } from "./conversationSnapshotV1";
import { buildShareAttachmentLinks, conversationSharePath } from "./shareAttachmentLinks";
import { shareMediaKind } from "./shareResources";
import type { ShareHtmlPayload } from "./shareHtmlDocument";
import styles from "./ShareAttachmentViewer.module.css";

async function readFile(file: SnapshotAttachmentV1, url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "same-origin", redirect: "error", signal });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : "read_failed");
  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mime !== file.mimeType || (file.size !== undefined && response.headers.get("content-length") !== String(file.size))) throw new Error("changed");
  const bytes = await response.arrayBuffer();
  if (file.size !== undefined && bytes.byteLength !== file.size) throw new Error("changed");
  return bytes;
}

/** One frame, one document-bound channel, one fixed payload. No guest requests are serviced. */
export function ShareHtmlPreview({ attachment, attachments, omittedResources, preview, locale }: {
  attachment: SnapshotAttachmentV1;
  attachments: SnapshotAttachmentV1[];
  omittedResources: SnapshotOmittedResource[];
  preview: string;
  locale: ConversationExportLocale;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const labels = conversationExportMessages[locale].attachments;
  useEffect(() => {
    const container = host.current;
    const sharePath = conversationSharePath(window.location.pathname);
    if (!container || !sharePath || !preview) { setFailed(true); return; }
    setFailed(false);
    const frame = document.createElement("iframe");
    frame.title = attachment.name;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    let phase: "loading" | "ready" | "reading" | "sent" | "closed" = "loading";
    let port: MessagePort | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => fail(), 15_000);
    const close = () => {
      phase = "closed";
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("message", ready);
      port?.close();
      frame.onload = null;
      frame.remove();
    };
    const fail = () => { close(); setFailed(true); };
    const ready = (event: MessageEvent) => {
      if (phase !== "ready" || event.source !== frame.contentWindow || event.origin !== "null" ||
        event.data?.type !== "conversation-html-ready" || event.ports.length !== 1) return;
      phase = "reading";
      port = event.ports[0];
      window.removeEventListener("message", ready);
      void (async () => {
        const links = (id: string) => buildShareAttachmentLinks(sharePath, id, window.location.origin);
        const html = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(attachment, links(attachment.id).download, controller.signal));
        const payload: ShareHtmlPayload = { html, mediaRefs: Object.entries(attachment.mediaRefs ?? {}), media: [], missing: [], unavailable: labels.loadFailed };
        const resources = new Map(attachments.map((file) => [file.id, file]));
        const omitted = new Map(omittedResources.map((item) => [item.id, item]));
        for (const id of new Set(Object.values(attachment.mediaRefs ?? {}))) {
          if (controller.signal.aborted) return;
          const file = resources.get(id);
          if (!file || !["image", "audio", "video"].includes(shareMediaKind(file.mimeType))) {
            payload.missing.push([id, labels.omission[omitted.get(id)?.reason ?? "not_found"]]);
            continue;
          }
          try {
            payload.media.push({ id, type: file.mimeType, bytes: await readFile(file, links(id).download, controller.signal) });
          } catch (error) {
            if (controller.signal.aborted) return;
            const reason = error instanceof Error ? error.message : "read_failed";
            payload.missing.push([id, Object.hasOwn(labels.omission, reason)
              ? labels.omission[reason as keyof typeof labels.omission] : labels.omission.read_failed]);
          }
        }
        if (phase !== "reading" || controller.signal.aborted || !frame.isConnected) return;
        phase = "sent";
        window.clearTimeout(timer);
        port!.postMessage(payload, payload.media.map((media) => media.bytes));
        port!.close();
      })().catch(() => { if (phase !== "closed") fail(); });
    };
    window.addEventListener("message", ready);
    frame.onload = () => {
      if (phase === "loading") {
        phase = "ready";
        // The sandbox has an opaque origin, so a targeted WindowProxy plus '*' is required.
        // Only the non-sensitive handshake goes through this window channel.
        frame.contentWindow?.postMessage({ type: "conversation-html-connect" }, "*");
      } else if (phase === "ready" || phase === "reading") {
        fail(); // Navigation during delivery must never transfer bytes to a new document.
      }
    };
    frame.src = preview + "?embed=1";
    container.append(frame);
    return close;
  }, [attachment, attachments, omittedResources, preview, labels]);
  return <div className={styles.htmlPreview} ref={host}>
    {failed && <p role="status">{labels.loadFailed}</p>}
  </div>;
}
