import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { WorkerConversationRow } from "../lib/workerState";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { UnreadDot } from "@/features/chats/components/UnreadDot";
import { ChatActionsMenu } from "@/features/chats/components/ChatActionsMenu";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import type { Agent } from "@/features/agents/lib/agentState";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import { AwaitingStatusChip } from "@/shared/ui/AwaitingStatusChip";
import { SidebarOverflowText } from "./SidebarOverflowText";
import styles from "./WorkerChatPreviewItem.module.css";
import type { SidebarDragProps } from "./SidebarSortableList";

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
  ownerLabel?: string;
  ownerType?: "agent";
  ownerIcon?: Agent["icon"];
  ownerPosition?: "before" | "after";
  dragProps?: SidebarDragProps;
  pinnedLayout?: boolean;
}> = ({ chat, isActive, loading, onClick, ownerLabel, ownerType, ownerIcon, ownerPosition = "after", dragProps, pinnedLayout = false }) => {
  const { t } = useI18n();
  const previewText = chat.chatName || chat.lastRunContent || t("leftSidebar.noPreview");
  const showAutomationSource = String(chat.source || "").trim().startsWith("automation:");
  const showAwaiting = Boolean(chat.hasPendingAwaiting);
  const showLoading = !showAwaiting && (loading || isChatActiveRun(chat));
  const showUnread = !showAwaiting && !showLoading && isChatUnread(chat);
  const hasStatus = Boolean(showAutomationSource || showAwaiting || showUnread);
  const owner = ownerLabel && <span data-agent-identity="" className={`${styles.owner} pinned-chat-owner`} title={ownerLabel}>
    {ownerType && <AgentIcon icon={ownerIcon} type={ownerType} props={{ icon: { className: "pinned-chat-owner-icon", width: 12, height: 12, style: { borderRadius: 3 } }, avatar: { className: "pinned-chat-owner-icon", size: 12 } }} />}
    <SidebarOverflowText text={ownerLabel} className={`${styles.ownerLabel} pinned-chat-owner-label`} />
  </span>;
  const status = hasStatus && <span className={styles.status}>
    {showAutomationSource && <span className={styles.automationSource}
      title={t("leftSidebar.automationSource")} aria-label={t("leftSidebar.automationSource")} role="img">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    </span>}
    {showAwaiting ? <AwaitingStatusChip mode={chat.awaitingMode} />
      : showUnread && <span className={`${styles.unread} worker-chat-unread`}><UnreadDot chat={chat} /></span>}
  </span>;
  // 运行指示占用“更多”按钮的槽位：桌面 hover 时由按钮顶替，触屏时按钮让位。
  const loadingIndicator = showLoading && <span className={styles.loadingSlot}>
    <MaterialIcon name="progress_activity" className={`${styles.loading} worker-chat-loading`} />
  </span>;
  return (
    <ChatActionsMenu
      chatId={chat.chatId}
      chatName={chat.chatName}
      agentKey={chat.agentKey}
      renderTrigger={(openMenu) => (
        <UiListItem
          {...dragProps}
          className={`${styles.row} ${pinnedLayout ? styles.pinned : ""} worker-chat-item ${isActive ? "is-active" : ""} ${dragProps?.className || ""}`}
          data-hover-space={!pinnedLayout && !hasStatus && (!ownerLabel || ownerPosition === "before") ? "true" : undefined}
          data-loading={showLoading ? "true" : undefined}
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
          {pinnedLayout ? <>
            <span className={styles.pinnedHead}><SidebarOverflowText text={previewText} /></span>
            <span className={styles.pinnedMeta}>
              {owner}
              <span className={styles.pinnedMetaRight}>
                {status}
                <span className={styles.time}>{formatChatTimeLabel(chat.updatedAt)}</span>
              </span>
            </span>
          </> : <>
            {ownerPosition === "before" && owner}
            <SidebarOverflowText text={previewText} />
            {ownerPosition === "after" && owner}
            {status}
          </>}
          {loadingIndicator}
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
