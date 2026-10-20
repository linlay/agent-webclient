import React, { useEffect, useState } from "react";
import { Tooltip } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { conversationExportMessages } from "@/shared/i18n/conversationExport";
import type { ConversationSnapshotV1 } from "./conversationSnapshotV1";
import { buildShareAttachmentLinks } from "./shareAttachmentLinks";
import { ShareAttachmentViewer } from "./ShareAttachmentViewer";
import styles from "./ShareAttachmentPage.module.css";

interface ShareAttachmentPageProps {
  snapshot: ConversationSnapshotV1;
  initialAttachmentId: string;
  sharePath: string;
  origin: string;
  canReshare: boolean;
}

export const ShareAttachmentPage: React.FC<ShareAttachmentPageProps> = ({
  snapshot, initialAttachmentId, sharePath, origin, canReshare,
}) => {
  const [selectedId, setSelectedId] = useState(initialAttachmentId);
  const attachment = snapshot.attachments.find((item) => item.id === selectedId);
  const omitted = snapshot.omittedResources?.find((item) => item.id === selectedId);
  const labels = conversationExportMessages[snapshot.locale].attachments;
  const links = buildShareAttachmentLinks(sharePath, selectedId, origin);
  useEffect(() => {
    if (attachment && links.page) {
      window.history.replaceState(window.history.state, "", links.page);
      document.title = attachment.name;
    } else {
      document.title = labels.notFound;
    }
  }, [attachment, links.page, labels.notFound]);

  return <main className={styles.page}>
    {attachment && links.page ? <ShareAttachmentViewer attachments={snapshot.attachments}
      omittedResources={snapshot.omittedResources} selectedId={selectedId} onSelect={setSelectedId} links={links} canReshare={canReshare} locale={snapshot.locale}>
      <Tooltip title={labels.backToConversation} trigger={["hover", "focus"]}>
        <a href={sharePath} aria-label={labels.backToConversation}><MaterialIcon name="chevron_left" aria-hidden="true" /></a>
      </Tooltip>
    </ShareAttachmentViewer> : <div className={styles.error} role="alert">
      <p>{omitted ? `${omitted.name} — ${labels.omission[omitted.reason]}` : labels.notFound}</p>{sharePath && <a href={sharePath}>{labels.backToConversation}</a>}
    </div>}
  </main>;
};
