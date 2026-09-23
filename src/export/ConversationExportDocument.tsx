import React, { useEffect, useMemo, useState } from "react";
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
    ? { attachments: "Attachments", download: "Download", close: "Close", loading: "Loading…",
      error: "Preview failed", retry: "Retry", unavailable: "Available only from the shared page" }
    : { attachments: "附件", download: "下载", close: "关闭", loading: "加载中…",
      error: "预览失败", retry: "重试", unavailable: "仅在线分享页面可预览" };
  const [selected, setSelected] = useState<SnapshotAttachmentV1 | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [frameState, setFrameState] = useState<"loading" | "ready" | "error">("loading");
  const [verified, setVerified] = useState(false);
  const data = useMemo(() => snapshotV1PreviewData(snapshot), [snapshot]);
  const assistantByRunId = useMemo(() => new Map(snapshot.turns.map((turn) =>
    [turn.runId, turn.assistant])), [snapshot.turns]);
  const agents = useMemo(() => snapshot.turns.flatMap((turn) => (turn.tasks || []).flatMap((task) =>
    task.subAgentKey ? [{ key: task.subAgentKey, name: task.subAgentName || task.subAgentKey,
      ...(task.subAgentIconName ? { icon: { name: task.subAgentIconName } } : {}) }] : [])), [snapshot]);
  const previewAttachments = useMemo(() => snapshot.attachments.filter((attachment) =>
    attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase() === "text/html"), [snapshot.attachments]);
  const attachments = useMemo(() => new Map(previewAttachments.map((attachment) =>
    [attachment.sourceRef, attachment])), [previewAttachments]);
  const open = (attachment: SnapshotAttachmentV1) => {
    if (!attachmentRoute(attachment.id, "preview")) return;
    setSelected(attachment);
    setFrameState("loading");
    setVerified(false);
    setFrameKey((current) => current + 1);
  };
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(attachmentRoute(selected.id, "preview"), {
      method: "HEAD", credentials: "same-origin", signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error("attachment_unavailable");
      setVerified(true);
    }).catch(() => {
      if (!controller.signal.aborted) setFrameState("error");
    });
    return () => controller.abort();
  }, [selected, frameKey]);
  const renderMarkdown = (props: MarkdownContentProps) => <ConversationMarkdown
    content={props.content}
    codeComponent={ConversationMarkdownCode}
    components={{
      a: ({ href, children, domNode: _domNode, ...rest }: LinkProps) => {
        const attachment = findPublishedAttachment(href, attachments);
        if (attachment) {
          const route = attachmentRoute(attachment.id, "preview");
          return route ? <a {...rest} href={route}
            onClick={(event) => { event.preventDefault(); open(attachment); }}>{children}</a>
            : <span title={labels.unavailable}>{children}</span>;
        }
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
      {previewAttachments.length > 0 && <section className={styles.attachments} aria-label={labels.attachments}>
        <h2>{labels.attachments}</h2>
        {previewAttachments.map((attachment) => <button key={attachment.id} type="button"
          disabled={!attachmentRoute(attachment.id, "preview")}
          title={!attachmentRoute(attachment.id, "preview") ? labels.unavailable : undefined}
          onClick={() => open(attachment)}>{attachment.name}</button>)}
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
        {frameState === "loading" && <p role="status">{labels.loading}</p>}
        {frameState === "error" && <div role="alert">{labels.error}
          <button type="button" onClick={() => { setFrameState("loading"); setVerified(false); setFrameKey((current) => current + 1); }}>{labels.retry}</button>
        </div>}
        {verified && <iframe key={frameKey} title={selected.name} sandbox="" referrerPolicy="no-referrer"
          src={attachmentRoute(selected.id, "preview")}
          onLoad={() => setFrameState("ready")} onError={() => setFrameState("error")} />}
      </aside>
    </div>}
  </main>;
};
