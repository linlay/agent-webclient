import React, { useCallback, useState } from "react";
import { conversationExportMessages, type ConversationExportLocale } from "@/shared/i18n/conversationExport";
import type { SnapshotAttachmentV1, SnapshotOmittedResource } from "./conversationSnapshotV1";
import { buildShareAttachmentLinks, conversationSharePath, type ShareAttachmentLinks } from "./shareAttachmentLinks";
import { shareMediaKind } from "./shareResources";
import type { ShareHtmlDelivery, ShareHtmlPayload } from "./shareHtmlDocument";
import { ShareHtmlFrame, versionedShareHtmlPreview, type ShareHtmlFrameStatus } from "./ShareHtmlFrame";
import styles from "./ShareAttachmentContent.module.css";

async function readFile(file: SnapshotAttachmentV1, url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "same-origin", redirect: "error", signal });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : "read_failed");
  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mime !== file.mimeType || (file.size !== undefined && response.headers.get("content-length") !== String(file.size))) throw new Error("changed");
  const bytes = await response.arrayBuffer();
  if (file.size !== undefined && bytes.byteLength !== file.size) throw new Error("changed");
  return bytes;
}

/** Prepare only the frozen attachment and its explicitly mapped media. */
export function ShareHtmlPreview({ attachment, attachments, omittedResources, links: { preview, download }, locale }: {
  attachment: SnapshotAttachmentV1;
  attachments: SnapshotAttachmentV1[];
  omittedResources?: SnapshotOmittedResource[];
  links: ShareAttachmentLinks;
  locale: ConversationExportLocale;
}) {
  const [status, setStatus] = useState<ShareHtmlFrameStatus>("loading");
  const labels = conversationExportMessages[locale].attachments;
  const sharePath = conversationSharePath(window.location.pathname);
  const url = versionedShareHtmlPreview(preview ? preview + "?embed=1" : "");
  const loadPayload = useCallback(async (signal: AbortSignal): Promise<ShareHtmlDelivery> => {
    const links = (id: string) => buildShareAttachmentLinks(sharePath, id, window.location.origin);
    const html = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(attachment, links(attachment.id).download, signal));
    const payload: ShareHtmlPayload = { html, mediaRefs: Object.entries(attachment.mediaRefs ?? {}), media: [], missing: [], unavailable: labels.loadFailed };
    const resources = new Map(attachments.map((file) => [file.id, file]));
    const omitted = new Map(omittedResources?.map((item) => [item.id, item]));
    for (const id of new Set(Object.values(attachment.mediaRefs ?? {}))) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const file = resources.get(id);
      if (!file || !["image", "audio", "video"].includes(shareMediaKind(file.mimeType))) {
        payload.missing.push([id, labels.omission[omitted.get(id)?.reason ?? "not_found"]]);
        continue;
      }
      try {
        payload.media.push({ id, type: file.mimeType, bytes: await readFile(file, links(id).download, signal) });
      } catch (error) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const reason = error instanceof Error ? error.message : "read_failed";
        payload.missing.push([id, Object.hasOwn(labels.omission, reason)
          ? labels.omission[reason as keyof typeof labels.omission] : labels.omission.read_failed]);
      }
    }
    return { kind: "attachment", content: payload };
  }, [attachment, attachments, omittedResources, labels, sharePath]);
  return <div className={styles.htmlPreview}>
    <ShareHtmlFrame url={sharePath ? url : ""} title={attachment.name} loadPayload={loadPayload} onStatus={setStatus} />
    {status === "error" && <p role="status">{labels.loadFailed} <a href={download}>{labels.download}</a></p>}
  </div>;
}
