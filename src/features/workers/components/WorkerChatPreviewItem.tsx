import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { WorkerConversationRow } from "../lib/workerState";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { UnreadDot } from "@/features/chats/components/UnreadDot";
import { ChatActionsMenu } from "@/features/chats/components/ChatActionsMenu";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import type { Agent } from "@/features/agents/lib/agentState";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import { SidebarOverflowText } from "./SidebarOverflowText";
import styles from "./WorkerChatPreviewItem.module.css";

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case 'plan':
    case 'planning': return 'leftSidebar.awaitingStatus.plan';
    case 'question': return 'leftSidebar.awaitingStatus.question';
    case 'approval': return 'leftSidebar.awaitingStatus.approval';
    case 'form': return 'leftSidebar.awaitingStatus.form';
    default: return 'leftSidebar.awaitingApproval';
  }
}

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
  ownerLabel?: string;
  ownerType?: "agent";
  ownerIcon?: Agent["icon"];
  ownerPosition?: "before" | "after";
}> = ({ chat, isActive, loading, onClick, ownerLabel, ownerType, ownerIcon, ownerPosition = "after" }) => {
  const { t } = useI18n();
  const previewText = chat.chatName || chat.lastRunContent || t("leftSidebar.noPreview");
  const showAutomationSource = String(chat.source || "").trim().startsWith("automation:");
  const isBusy = chat.hasPendingAwaiting || loading || isChatActiveRun(chat);
  const hasStatus = showAutomationSource || isBusy || isChatUnread(chat);
  const owner = ownerLabel && <span className={`${styles.owner} pinned-chat-owner`} title={ownerLabel}>
    {ownerType && <AgentIcon icon={ownerIcon} type={ownerType} props={{ icon: { className: "pinned-chat-owner-icon", width: 12, height: 12, style: { borderRadius: 3 } }, avatar: { className: "pinned-chat-owner-icon", size: 12 } }} />}
    <SidebarOverflowText text={ownerLabel} className={`${styles.ownerLabel} pinned-chat-owner-label`} />
  </span>;
  return (
    <ChatActionsMenu
      chatId={chat.chatId}
      chatName={chat.chatName}
      agentKey={chat.agentKey}
      renderTrigger={(openMenu) => (
        <UiListItem
          className={`${styles.row} worker-chat-item ${isActive ? "is-active" : ""}`}
          data-hover-space={!hasStatus && (!ownerLabel || ownerPosition === "before") ? "true" : undefined}
          selected={isActive}
          role="button"
          tabIndex={0}
          aria-current={isActive ? "page" : undefined}
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); }
            if (event.key === "F10" && event.shiftKey) { event.preventDefault(); openMenu(); }
          }}
        >
          {ownerPosition === "before" && owner}
          <SidebarOverflowText text={previewText} />
          {ownerPosition === "after" && owner}
          {hasStatus && <span className={styles.status}>
            {showAutomationSource && <span className={styles.automationSource}
              title={t("leftSidebar.automationSource")} aria-label={t("leftSidebar.automationSource")} role="img">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
            </span>}
            {chat.hasPendingAwaiting && <span className={`${styles.awaiting} chat-awaiting-status`}>{t(getAwaitingStatusKey(chat.awaitingMode))}</span>}
            {isBusy ? <MaterialIcon name="progress_activity" className={`${styles.loading} worker-chat-loading`} /> : isChatUnread(chat) &&
              <span className={`${styles.unread} worker-chat-unread`}><UnreadDot chat={chat} /></span>}
          </span>}
          <UiButton
            className={`${styles.more} chat-actions-trigger ui-icon-hover-24`}
            size="mini" variant="ghost" iconOnly
            aria-label={t("leftSidebar.moreActions")}
            aria-haspopup="menu"
            onClick={(event) => { event.stopPropagation(); openMenu(); }}
          ><MaterialIcon name="more_horiz" /></UiButton>
        </UiListItem>
      )}
    />
  );
};
