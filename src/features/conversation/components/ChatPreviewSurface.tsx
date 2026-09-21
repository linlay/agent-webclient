import React from "react";
import { useChatPreview } from "@/features/conversation/hooks/useChatPreview";
import { ConversationPreview } from "./ConversationPreview";
import { conversationPreviewDataFromReplay } from "../lib/conversationPreviewData";
import { useOpenTarget } from "@/features/surfaces/openTarget";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import styles from "./ChatPreviewSurface.module.css";

const renderAppMarkdown = (props: MarkdownContentProps) => <MarkdownContent {...props} />;

export function ChatPreviewSurface({ chatId, live }: { chatId: string; live: boolean }) {
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const message = useAppMessage();
  const { state, reload } = useChatPreview(chatId, live);
  const snapshot = state?.snapshot;
  const owner = snapshot?.owner;
  const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
  return <main className={styles.root} aria-label={t("chatPreview.title")}>
    {state?.error && <div className={styles.error} role="alert">
      <span>{state.error}</span>
      <UiButton size="sm" variant="ghost" onClick={reload} disabled={!state.active}>{t("chatPreview.reload")}</UiButton>
    </div>}
    {(!state || state.loading) && <div className={styles.notice} role="status">{t("surface.loading")}</div>}
    {live && snapshot?.chat.activeRun && snapshot.projection.state.activeAwaiting &&
      <div className={styles.notice}>{t("chatPreview.awaiting")}</div>}
    <section className={styles.body} aria-busy={!state || state.loading}>
      {snapshot && <ConversationPreview
        key={`${chatId}:${live}`}
        data={conversationPreviewDataFromReplay(snapshot.chat, snapshot.projection)}
        agents={agentKey ? [{ key: agentKey, name: snapshot.chat.firstAgentName || agentKey }] : []}
        agentKey={agentKey} teamChat={owner?.kind === "orchestrated-team"} startAtBottom
        ariaLabel={t("chatPreview.title")} emptyLabel={t("chatPreview.empty")}
        openTarget={openTarget}
        onCopyResult={(success) => success
          ? message.success(t("timeline.toolPill.copy.copied"))
          : message.error(t("timeline.toolPill.copy.failed"))}
        renderMarkdown={renderAppMarkdown}
        renderAttachment={(attachment, options) => <AttachmentCard
          attachment={attachment} variant="timeline" thumbnailMode="inline"
          surfaceContext={{ chatId: snapshot.chat.chatId, agentKey, teamChat: owner?.kind === "orchestrated-team" }}
          {...options} />}
      />}
    </section>
  </main>;
}
