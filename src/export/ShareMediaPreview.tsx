import React, { useState } from "react";
import { shareMediaKind } from "./shareResources";
import type { SnapshotAttachmentV1 } from "./conversationSnapshotV1";
import styles from "./ShareAttachmentContent.module.css";

/** Native read-only media; a decoding failure stays inside this resource. */
export function ShareMediaPreview({ attachment, url, download, unavailable }: {
  attachment: SnapshotAttachmentV1;
  url: string;
  download?: string;
  unavailable: string;
}) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  if (!url || failedURL === url) return <span role="status">{download ? <a href={download}>{attachment.name}</a> : attachment.name} — {unavailable}</span>;
  const onError = () => setFailedURL(url);
  switch (shareMediaKind(attachment.mimeType)) {
    case "image": return <img className={styles.image} src={url} alt={attachment.name} onError={onError} />;
    case "video": return <video className={styles.video} src={url} controls preload="metadata" onError={onError} aria-label={attachment.name} />;
    case "audio": return <audio className={styles.audio} src={url} controls preload="metadata" onError={onError} aria-label={attachment.name} />;
    default: return <span>{attachment.name}</span>;
  }
}
