import React, { useEffect } from "react";
import { conversationExportMessages } from "@/shared/i18n/conversationExport";
import type { ConversationSnapshotV1 } from "./conversationSnapshotV1";
import { buildShareAttachmentLinks } from "./shareAttachmentLinks";
import { ShareAttachmentContent } from "./ShareAttachmentContent";
import styles from "./ShareAttachmentPage.module.css";

interface ShareAttachmentPageProps {
  snapshot: ConversationSnapshotV1;
  attachmentId: string;
  sharePath: string;
}

export const ShareAttachmentPage: React.FC<ShareAttachmentPageProps> = ({
  snapshot, attachmentId, sharePath,
}) => {
  const attachment = snapshot.attachments.find((item) => item.id === attachmentId);
  const omitted = snapshot.omittedResources?.find((item) => item.id === attachmentId);
  const labels = conversationExportMessages[snapshot.locale].attachments;
  const links = buildShareAttachmentLinks(sharePath, attachmentId, window.location.origin);
  useEffect(() => {
    document.title = attachment && links.page ? attachment.name : labels.notFound;
  }, [attachment, links.page, labels.notFound]);

  return <main className={styles.page}>
    {attachment && links.page ? <ShareAttachmentContent attachment={attachment} attachments={snapshot.attachments}
      omittedResources={snapshot.omittedResources} links={links} locale={snapshot.locale} /> : <div className={styles.error} role="alert">
      <p>{omitted ? `${omitted.name} — ${labels.omission[omitted.reason]}` : labels.notFound}</p>{sharePath && <a href={sharePath}>{labels.backToConversation}</a>}
    </div>}
  </main>;
};
