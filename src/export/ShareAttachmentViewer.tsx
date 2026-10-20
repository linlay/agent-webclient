import React, { useEffect, useRef, useState } from "react";
import { Dropdown, message, Tooltip } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { conversationExportMessages, type ConversationExportLocale } from "@/shared/i18n/conversationExport";
import { copyWebText } from "@/shared/utils/webClipboard";
import { ShareHtmlPreview } from "./ShareHtmlPreview";
import { ShareMediaPreview } from "./ShareMediaPreview";
import { shareMediaKind } from "./shareResources";
import type { SnapshotAttachmentV1, SnapshotOmittedResource } from "./conversationSnapshotV1";
import type { ShareAttachmentLinks } from "./shareAttachmentLinks";
import styles from "./ShareAttachmentViewer.module.css";

interface ShareAttachmentViewerProps {
  attachments: SnapshotAttachmentV1[];
  omittedResources?: SnapshotOmittedResource[];
  selectedId: string;
  onSelect: (id: string) => void;
  links: ShareAttachmentLinks;
  canReshare: boolean;
  locale: ConversationExportLocale;
  children?: React.ReactNode;
}

const NO_OMISSIONS: SnapshotOmittedResource[] = [];
const COPY_MESSAGE_KEY = "share-attachment-copy";

export const ShareAttachmentViewer: React.FC<ShareAttachmentViewerProps> = ({
  attachments, omittedResources = NO_OMISSIONS, selectedId, onSelect, links, canReshare, locale, children,
}) => {
  const labels = conversationExportMessages[locale].attachments;
  const attachment = attachments.find((item) => item.id === selectedId);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileTrigger = useRef<HTMLButtonElement>(null);
  const [messageApi, messageHolder] = message.useMessage();
  const copyRequest = useRef(0);
  useEffect(() => () => {
    copyRequest.current += 1;
    messageApi.destroy(COPY_MESSAGE_KEY);
  }, [links.page, messageApi]);
  if (!attachment) return null;
  const shareable = canReshare && Boolean(links.page);
  const copyLink = async () => {
    if (!shareable) return;
    const url = links.page;
    const request = ++copyRequest.current;
    try {
      await copyWebText(url);
      if (request !== copyRequest.current) return;
      void messageApi.success({
        key: COPY_MESSAGE_KEY, content: <span role="status">{labels.linkCopied}</span>, duration: 2,
      });
    } catch {
      if (request !== copyRequest.current) return;
      void messageApi.error({
        key: COPY_MESSAGE_KEY, duration: 0,
        content: <div className={styles.copyFallback} role="alert">
          <label>{labels.copyFailed}<input aria-label={labels.shareLink} readOnly value={url}
            onFocus={(event) => event.currentTarget.select()} /></label>
          <button type="button" onClick={() => messageApi.destroy(COPY_MESSAGE_KEY)}>{labels.close}</button>
        </div>,
      });
    }
  };

  return <section className={styles.viewer} aria-label={attachment.name}>
    {messageHolder}
    <header className={styles.header}>
      <div className={styles.toolbar}>
        <Tooltip title={attachment.name} trigger={["hover", "focus"]}
          open={menuOpen ? false : undefined} overlayClassName={styles.fileTooltip}>
          <div className={styles.fileTitle} onKeyDown={(event) => {
            if (menuOpen && event.key === "Escape") {
              event.stopPropagation();
              setMenuOpen(false);
              fileTrigger.current?.focus();
            }
          }}>
            {attachments.length > 1 ? <Dropdown trigger={["click"]} open={menuOpen}
              onOpenChange={setMenuOpen} destroyOnHidden overlayClassName={styles.fileMenu}
              overlayStyle={{ minWidth: 0 }} menu={{
                selectable: true, selectedKeys: [selectedId],
                items: attachments.map((item) => ({
                  key: item.id, label: <span className={styles.fileOption}>{item.name}</span>,
                  title: "", "aria-label": item.name,
                  "aria-current": item.id === selectedId ? "true" : undefined,
                })),
                onClick: ({ key, domEvent }) => {
                  setMenuOpen(false);
                  onSelect(key);
                  if (domEvent.type === "keydown") {
                    domEvent.preventDefault();
                    fileTrigger.current?.focus();
                  }
                },
              }}>
              <button ref={fileTrigger} className={styles.fileButton} type="button"
                aria-label={`${labels.selectFile}：${attachment.name}`} aria-haspopup="menu" aria-expanded={menuOpen}>
                <span className={styles.fileName}>{attachment.name}</span>
                <MaterialIcon name="expand_more" aria-hidden="true" />
              </button>
            </Dropdown> : <strong className={styles.fileName} tabIndex={0}>{attachment.name}</strong>}
          </div>
        </Tooltip>
        <div className={styles.actions}>
          <Tooltip title={shareable ? <>{labels.shareLink}<div>{labels.sharePolicy}</div></> : labels.reshareUnavailable}
            trigger={["hover", "focus"]}>
            <span className={styles.iconWrap} tabIndex={shareable ? undefined : 0}
              aria-label={shareable ? undefined : labels.reshareUnavailable}>
              <button type="button" disabled={!shareable} onClick={() => void copyLink()}
                aria-label={labels.shareLink} aria-description={shareable ? labels.sharePolicy : labels.reshareUnavailable}>
                <MaterialIcon name="content_copy" aria-hidden="true" />
              </button>
            </span>
          </Tooltip>
          <Tooltip title={labels.download} trigger={["hover", "focus"]}>
            <a href={links.download} aria-label={labels.download}><MaterialIcon name="download" aria-hidden="true" /></a>
          </Tooltip>
          {children}
        </div>
      </div>
    </header>
    {shareMediaKind(attachment.mimeType) === "html" ?
      <ShareHtmlPreview key={attachment.id} attachment={attachment} attachments={attachments}
        omittedResources={omittedResources} preview={links.preview} locale={locale} /> :
      shareMediaKind(attachment.mimeType) !== "unsupported" ?
        <div className={styles.media}><ShareMediaPreview key={attachment.id} attachment={attachment}
          url={links.preview} unavailable={labels.loadFailed} /></div> :
        <div className={styles.unsupported}>
          <strong>{attachment.name}</strong><span>{attachment.mimeType}</span>
          <p>{labels.unsupported}</p><a href={links.download}>{labels.download}</a>
        </div>}

  </section>;
};
