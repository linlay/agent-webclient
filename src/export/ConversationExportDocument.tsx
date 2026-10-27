import React, { useEffect, useMemo, useState } from "react";
import { Tooltip } from "antd";
import { ConversationPreview, type ConversationPreviewProps } from "@/features/conversation/components/ConversationPreview";
import { ConversationMarkdown, type ConversationMarkdownElementProps } from "@/shared/ui/ConversationMarkdown";
import { ConversationMarkdownCode, type ConversationMarkdownCodeProps } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { AgentIcon } from "@/shared/icons/agent";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";
import { conversationExportMessages } from "@/shared/i18n/conversationExport";
import type { ConversationSnapshotV1, SnapshotAttachmentV1 } from "./conversationSnapshotV1";
import { snapshotV1PreviewData } from "./conversationSnapshotV1";
import type { PublicShareBrand } from "./publicShareBrand";
import { PublicShareAppEntry } from "./PublicShareAppEntry";
import { buildShareAttachmentLinks, conversationSharePath } from "./shareAttachmentLinks";
import { ShareAttachmentViewer } from "./ShareAttachmentViewer";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./ConversationExportDocument.module.css";

export type ConversationExportDocumentProps = {
  snapshot: ConversationSnapshotV1;
  publicBrand?: PublicShareBrand | null;
  canReshare?: boolean;
};

type LinkProps = ConversationMarkdownElementProps<{ href?: string; title?: string }>;

const ExportMarkdownCode: React.FC<ConversationMarkdownCodeProps> = props =>
  <ConversationMarkdownCode {...props} htmlPreview={false} />;

// A body link and a snapshot sourceRef name the same published file in
// different spellings: "@chat/<path>" or a bare reference, percent-encoded by
// Platform, by the Markdown renderer, or not at all. Compare decoded paths.
function chatFilePath(reference: string): string {
  const bare = /^@chat\//iu.test(reference) ? reference.slice("@chat/".length) : reference;
  return bare.split("/").map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  }).join("/");
}

function findPublishedAttachment(href: string | undefined, attachments: Map<string, SnapshotAttachmentV1>): SnapshotAttachmentV1 | undefined {
  if (!href) return undefined;
  const direct = attachments.get(chatFilePath(href));
  if (direct) return direct;
  try {
    const parsed = new URL(href, window.location.origin);
    if (parsed.pathname !== "/api/resource") return undefined;
    const key = parsed.searchParams.get("file") || "";
    const path = chatFilePath(key);
    for (const [sourcePath, attachment] of attachments) {
      if (path.endsWith(`/${sourcePath}`)) return attachment;
    }
  } catch { return undefined; }
  return undefined;
}

export const ConversationExportDocument: React.FC<ConversationExportDocumentProps> = ({ snapshot, publicBrand, canReshare = false }) => {
  const copy = conversationExportMessages[snapshot.locale];
  const labels = copy.attachments;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selected = snapshot.attachments.find((attachment) => attachment.id === selectedId);
  const previewOpen = Boolean(selected);
  const sharePath = conversationSharePath(window.location.pathname);
  const attachmentLinks = (id: string) => buildShareAttachmentLinks(sharePath, id, window.location.origin);
  const close = () => { setSelectedId(null); setExpanded(false); };
  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelectedId(null); setExpanded(false); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [previewOpen]);
  const data = useMemo(() => snapshotV1PreviewData(snapshot), [snapshot]);
  const assistantByRunId = useMemo(() => new Map(snapshot.turns.map((turn) =>
    [turn.runId, turn.assistant])), [snapshot.turns]);
  const agents = useMemo(() => snapshot.turns.flatMap((turn) => (turn.tasks || []).flatMap((task) =>
    (task.subAgentKey || task.taskAgentKey) ? [{ key: (task.subAgentKey || task.taskAgentKey)!, name: task.subAgentName || (task.subAgentKey || task.taskAgentKey)!,
      mode: task.subAgentMode, icon: { name: task.subAgentIconName, color: task.subAgentIconColor } }] : [])), [snapshot]);
  const attachments = useMemo(() => new Map(snapshot.attachments.map((attachment) =>
    [chatFilePath(attachment.sourceRef), attachment])), [snapshot.attachments]);
  const open = (attachment: SnapshotAttachmentV1) => {
    if (!attachmentLinks(attachment.id).preview) return;
    setSelectedId(attachment.id);
  };
  const attachmentLink = (attachment: SnapshotAttachmentV1, children: React.ReactNode, props?: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const previewable = attachment.mimeType === "text/html";
    const links = attachmentLinks(attachment.id);
    const route = previewable ? links.preview : links.download;
    if (!route) return <span key={attachment.id} title={labels.unavailable}>{children}</span>;
    return <a key={attachment.id} {...props} href={route}
      onClick={previewable ? (event) => { event.preventDefault(); open(attachment); } : undefined}>{children}</a>;
  };
  const renderMarkdown = (props: MarkdownContentProps) => <ConversationMarkdown
    content={props.content}
    codeComponent={ExportMarkdownCode}
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
    return <div className={styles.assistantIdentity}>
      <AgentIcon interactive={false} type="agent" mode={assistant?.mode} icon={{ name: assistant?.iconName, color: assistant?.iconColor }}
        props={{ icon: { width: 24, height: 24 } }} />
      <strong>{assistant?.name?.trim() || copy.assistant}</strong>
    </div>;
  };
  return <main data-agent-pointer-disabled="" className={styles.page}>
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
    {selected && <div className={styles.previewBackdrop} role="presentation" onClick={close}>
      <aside className={`${styles.previewPanel} ${expanded ? styles.previewExpanded : ""}`} role="dialog" aria-modal="true" aria-label={selected.name}
        onClick={(event) => event.stopPropagation()}>
        <ShareAttachmentViewer attachments={snapshot.attachments} selectedId={selected.id}
          onSelect={setSelectedId} links={attachmentLinks(selected.id)} canReshare={canReshare} locale={snapshot.locale}>
          <Tooltip title={labels.openStandalone} trigger={["hover", "focus"]}>
            <a href={attachmentLinks(selected.id).page} target="_blank" rel="noopener noreferrer" aria-label={labels.openStandalone}>
              <MaterialIcon name="open_in_new" aria-hidden="true" />
            </a>
          </Tooltip>
          <Tooltip title={expanded ? labels.collapse : labels.expand} trigger={["hover", "focus"]}>
            <button className={styles.expandButton} type="button" aria-expanded={expanded}
              aria-label={expanded ? labels.collapse : labels.expand} onClick={() => setExpanded((value) => !value)}>
              <MaterialIcon name={expanded ? "collapse_content" : "expand_content"} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip title={labels.close} trigger={["hover", "focus"]}>
            <button type="button" onClick={close} aria-label={labels.close}>
              <MaterialIcon name="close" aria-hidden="true" />
            </button>
          </Tooltip>
        </ShareAttachmentViewer>
      </aside>
    </div>}
  </main>;
};
