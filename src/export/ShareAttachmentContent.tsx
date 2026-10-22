import { conversationExportMessages, type ConversationExportLocale } from "@/shared/i18n/conversationExport";
import type { SnapshotAttachmentV1, SnapshotOmittedResource } from "./conversationSnapshotV1";
import type { ShareAttachmentLinks } from "./shareAttachmentLinks";
import { shareMediaKind } from "./shareResources";
import { ShareHtmlPreview } from "./ShareHtmlPreview";
import { ShareMediaPreview } from "./ShareMediaPreview";
import styles from "./ShareAttachmentContent.module.css";

export interface ShareAttachmentContentProps {
  attachment: SnapshotAttachmentV1;
  attachments: SnapshotAttachmentV1[];
  omittedResources?: SnapshotOmittedResource[];
  links: ShareAttachmentLinks;
  locale: ConversationExportLocale;
}

export function ShareAttachmentContent({
  attachment, attachments, omittedResources, links, locale,
}: ShareAttachmentContentProps) {
  const labels = conversationExportMessages[locale].attachments;
  const kind = shareMediaKind(attachment.mimeType);
  return kind === "html" ?
    <ShareHtmlPreview key={attachment.id} attachment={attachment} attachments={attachments}
      omittedResources={omittedResources} links={links} locale={locale} /> :
    kind !== "unsupported" ?
      <div className={styles.media}><ShareMediaPreview key={attachment.id} attachment={attachment}
        url={links.preview} download={links.download} unavailable={labels.loadFailed} /></div> :
      <div className={styles.unsupported}>
        <strong>{attachment.name}</strong><span>{attachment.mimeType}</span>
        <p>{labels.unsupported}</p><a href={links.download}>{labels.download}</a>
      </div>;
}
