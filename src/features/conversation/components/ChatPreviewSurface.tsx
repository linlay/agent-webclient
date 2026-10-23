import React from "react";
import { copyText } from "@/shared/utils/copy";
import { useChatPreview } from "@/features/conversation/hooks/useChatPreview";
import { ConversationPreview } from "./ConversationPreview";
import { conversationPreviewDataFromReplay } from "../lib/conversationPreviewData";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { TimelineAttachmentView } from "@/features/timeline/components/TimelineAttachmentView";
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
        agentKey={agentKey} teamChat={false} startAtBottom
        ariaLabel={t("chatPreview.title")} emptyLabel={t("chatPreview.empty")}
        getChatHref={(chat) => `/?${new URLSearchParams({ chatId: chat.chatId })}`}
        openTarget={openTarget} copyText={copyText}
        onCopyResult={(success, text) => success
          ? message.success(text ?? t("timeline.toolPill.copy.copied"))
          : message.error(text ?? t("timeline.toolPill.copy.failed"))}
        renderMarkdown={renderAppMarkdown}
        renderAttachment={(attachment, options) => <TimelineAttachmentView
          attachment={attachment}
          surfaceContext={{ chatId: snapshot.chat.chatId, agentKey, teamChat: false }}
          options={options} openTarget={openTarget} />}
      />}
    </section>
  </main>;
}
