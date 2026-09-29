import React, { useMemo, useState } from "react";
import { ConversationPreview, type ConversationPreviewProps } from "@/features/conversation/components/ConversationPreview";
import { ConversationMarkdown, type ConversationMarkdownElementProps } from "@/shared/ui/ConversationMarkdown";
import { ConversationMarkdownCode } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { getAgentIconSource } from "@/shared/icons/agentIconAssets";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";
import { conversationExportMessages } from "@/shared/i18n/conversationExport";
import type { ConversationSnapshotV1, SnapshotAttachmentV1 } from "./conversationSnapshotV1";
import { snapshotV1PreviewData } from "./conversationSnapshotV1";
import type { PublicShareBrand } from "./publicShareBrand";
import { PublicShareAppEntry } from "./PublicShareAppEntry";
import styles from "./ConversationExportDocument.module.css";

export type ConversationExportDocumentProps = { snapshot: ConversationSnapshotV1; publicBrand?: PublicShareBrand | null };

type LinkProps = ConversationMarkdownElementProps<{ href?: string; title?: string }>;

function attachmentRoute(id: string, action: "preview" | "download"): string {
  const match = /^\/share\/([A-Za-z0-9_-]+)(?:\/|$)/u.exec(window.location.pathname);
  return match ? `/share/${match[1]}/attachments/${id}/${action}` : "";
}

function findPublishedAttachment(href: string | undefined, attachments: Map<string, SnapshotAttachmentV1>): SnapshotAttachmentV1 | undefined {
  if (!href) return undefined;
  const direct = attachments.get(href);
  if (direct) return direct;
  try {
    const parsed = new URL(href, window.location.origin);
    if (parsed.pathname !== "/api/resource") return undefined;
    const key = parsed.searchParams.get("file") || "";
    for (const [sourceRef, attachment] of attachments) {
      if (key.endsWith(`/${sourceRef}`)) return attachment;
    }
  } catch { return undefined; }
  return undefined;
}

export const ConversationExportDocument: React.FC<ConversationExportDocumentProps> = ({ snapshot, publicBrand }) => {
  const copy = conversationExportMessages[snapshot.locale];
  const labels = snapshot.locale === "en-US"
    ? { attachments: "Attachments", download: "Download", close: "Close", unavailable: "Available only from the shared page" }
    : { attachments: "附件", download: "下载", close: "关闭", unavailable: "仅在线分享页面可预览" };
  const [selected, setSelected] = useState<SnapshotAttachmentV1 | null>(null);
  const data = useMemo(() => snapshotV1PreviewData(snapshot), [snapshot]);
  const assistantByRunId = useMemo(() => new Map(snapshot.turns.map((turn) =>
    [turn.runId, turn.assistant])), [snapshot.turns]);
  const agents = useMemo(() => snapshot.turns.flatMap((turn) => (turn.tasks || []).flatMap((task) =>
    task.subAgentKey ? [{ key: task.subAgentKey, name: task.subAgentName || task.subAgentKey,
      ...(task.subAgentIconName ? { icon: { name: task.subAgentIconName } } : {}) }] : [])), [snapshot]);
  const attachments = useMemo(() => new Map(snapshot.attachments.map((attachment) =>
    [attachment.sourceRef, attachment])), [snapshot.attachments]);
  const open = (attachment: SnapshotAttachmentV1) => {
    if (!attachmentRoute(attachment.id, "preview")) return;
    setSelected(attachment);
  };
  const attachmentLink = (attachment: SnapshotAttachmentV1, children: React.ReactNode, props?: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const previewable = attachment.mimeType === "text/html";
    const route = attachmentRoute(attachment.id, previewable ? "preview" : "download");
    if (!route) return <span key={attachment.id} title={labels.unavailable}>{children}</span>;
    return <a key={attachment.id} {...props} href={route}
      onClick={previewable ? (event) => { event.preventDefault(); open(attachment); } : undefined}>{children}</a>;
  };
  const renderMarkdown = (props: MarkdownContentProps) => <ConversationMarkdown
    content={props.content}
    codeComponent={ConversationMarkdownCode}
    components={{
      a: ({ href, children, domNode: _domNode, streamStatus: _streamStatus, ...rest }: LinkProps) => {
        const attachment = findPublishedAttachment(href, attachments);
        if (attachment) return attachmentLink(attachment, children, rest);
        if (!href || !/^https?:\/\//iu.test(href)) return <span>{children}</span>;
        return <a {...rest} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
      img: ({ alt }: ConversationMarkdownElementProps<{ alt?: string }>) => <span>[{alt || "image"}]</span>,
    }}
  />;
  const renderRunHeader: NonNullable<ConversationPreviewProps["renderRunHeader"]> = (item) => {
    const assistant = assistantByRunId.get(item.runId || "");
    const fallbackIcon = getAgentIconSource();
    return <div className={styles.assistantIdentity}>
      <img src={getAgentIconSource(assistant?.iconName)} alt="" width={24} height={24}
        onError={(event) => {
          if (event.currentTarget.getAttribute("src") !== fallbackIcon) event.currentTarget.src = fallbackIcon;
        }} />
      <strong>{assistant?.name?.trim() || copy.assistant}</strong>
    </div>;
  };
  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <h1 title={snapshot.title}>{snapshot.title}</h1>
    </div></header>
    <div className={`${styles.shell} ${publicBrand ? styles.shellWithBrand : ""}`}>
      <div className={styles.notice}>{copy.aiNotice}</div>
      <ConversationPreview data={data} agents={agents} viewportMode="document"
        ariaLabel={snapshot.title} renderMarkdown={renderMarkdown} renderRunHeader={renderRunHeader} />
      {snapshot.attachments.length > 0 && <section className={styles.attachments} aria-label={labels.attachments}>
        <h2>{labels.attachments}</h2>
        {snapshot.attachments.map((attachment) => attachmentLink(attachment, attachment.name))}
      </section>}
      <footer className={styles.footer}>{copy.readOnly}</footer>
    </div>
    {publicBrand && <PublicShareAppEntry brand={publicBrand} locale={snapshot.locale} />}
    {selected && <div className={styles.previewBackdrop} role="presentation" onClick={() => setSelected(null)}>
      <aside className={styles.previewPanel} role="dialog" aria-modal="true" aria-label={selected.name}
        onClick={(event) => event.stopPropagation()}>
        <div className={styles.previewHeader}><strong>{selected.name}</strong>
          <a href={attachmentRoute(selected.id, "download")}>{labels.download}</a>
          <button type="button" onClick={() => setSelected(null)} aria-label={labels.close}>×</button>
        </div>
        <iframe title={selected.name} sandbox="" referrerPolicy="no-referrer"
          src={attachmentRoute(selected.id, "preview")} />
      </aside>
    </div>}
  </main>;
};
