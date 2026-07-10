import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow } from "@/app/state/types";
import { UnreadDot } from "@/features/chats/components/UnreadDot";
import { ChatActionsMenu } from "@/features/chats/components/ChatActionsMenu";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

const WORKER_CHAT_ITEM_CLASS =
  "worker-chat-item tw:relative tw:rounded-none tw:border-0 tw:bg-transparent tw:px-2 tw:py-1.5 tw:text-text-muted tw:!shadow-none tw:cursor-pointer";

const WORKER_CHAT_ITEM_HEAD_CLASS =
  "worker-chat-item-head tw:flex tw:w-full tw:items-center tw:gap-1.5";

const WORKER_CHAT_NAME_CLASS =
  "worker-chat-name tw:min-w-0 tw:flex-auto tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px]";

const WORKER_CHAT_SOURCE_ICON_CLASS =
  "worker-chat-source-icon tw:inline-flex tw:h-[9px] tw:w-[9px] tw:shrink-0 tw:text-text-sub";

const WORKER_CHAT_SOURCE_ICON_SVG_CLASS =
  "tw:h-full tw:w-full";

const WORKER_CHAT_ACTION_CLASS =
  "worker-chat-action tw:relative tw:inline-flex tw:min-h-4 tw:flex-[0_0_30px] tw:items-center tw:justify-end";

const WORKER_CHAT_LOADING_CLASS =
  "worker-chat-loading tw:absolute tw:right-[5px] tw:mr-0.5 tw:text-sm tw:text-text-sub tw:animate-ui-spin";

const WORKER_PANEL_TIME_LABEL_CLASS =
  "worker-panel-time-label tw:min-w-0 tw:max-w-full tw:whitespace-nowrap tw:text-right tw:text-[11px] tw:text-text-muted";

const WORKER_PANEL_TIME_CONTENT_CLASS =
  "worker-panel-time-content tw:inline-flex tw:min-w-0 tw:max-w-full tw:items-center tw:justify-end";

const WORKER_PANEL_TIME_CONTENT_AUTOMATION_CLASS =
  `${WORKER_PANEL_TIME_CONTENT_CLASS} is-automation tw:gap-px`;

const WORKER_PANEL_TIME_TEXT_CLASS =
  "worker-panel-time-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap";

const WORKER_PANEL_TIME_TEXT_AUTOMATION_CLASS =
  `${WORKER_PANEL_TIME_TEXT_CLASS} tw:text-[10px]`;

const CHAT_AWAITING_STATUS_CLASS =
  "chat-awaiting-status tw:mr-[5px] tw:whitespace-nowrap tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-warn)_10%,transparent)] tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:text-accent-warn";

const CHAT_ACTIONS_TRIGGER_CLASS =
  "tw:absolute tw:right-[5px] tw:top-1/2 tw:-translate-y-1/2 tw:hidden tw:p-0 tw:text-text-muted tw:transition-none";

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case 'plan': return 'leftSidebar.awaitingStatus.plan';
    case 'question': return 'leftSidebar.awaitingStatus.question';
    case 'approval': return 'leftSidebar.awaitingStatus.approval';
    case 'form': return 'leftSidebar.awaitingStatus.form';
    default: return 'leftSidebar.awaitingApproval';
  }
}

function isAutomationSource(source?: string): boolean {
  return String(source || '').trim().startsWith('automation:');
}

const AutomationSourceIcon: React.FC<{ label: string }> = ({ label }) => (
  <span
    className={WORKER_CHAT_SOURCE_ICON_CLASS}
    title={label}
    aria-label={label}
    role="img"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={WORKER_CHAT_SOURCE_ICON_SVG_CLASS}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  </span>
);

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ chat, isActive, loading, onClick }) => {
  const { t } = useI18n();
  const action = chat.hasPendingAwaiting ? "awaiting" : loading ? "loading" : "time";
  const isBusyAction = action !== "time";
  const itemClassName = isActive
    ? `${WORKER_CHAT_ITEM_CLASS} is-active`
    : WORKER_CHAT_ITEM_CLASS;
  const loadingClassName = isBusyAction
    ? `${WORKER_CHAT_LOADING_CLASS} tw:inline-flex`
    : `${WORKER_CHAT_LOADING_CLASS} tw:hidden`;
  const timeLabelClassName = action === "time"
    ? `${WORKER_PANEL_TIME_LABEL_CLASS} tw:opacity-100`
    : `${WORKER_PANEL_TIME_LABEL_CLASS} tw:opacity-0`;
  const previewText = chat.lastRunContent || chat.chatName || t("leftSidebar.noPreview");
  const showAutomationSource = isAutomationSource(chat.source);
  const timeContentClassName = showAutomationSource
    ? WORKER_PANEL_TIME_CONTENT_AUTOMATION_CLASS
    : WORKER_PANEL_TIME_CONTENT_CLASS;
  const timeTextClassName = showAutomationSource
    ? WORKER_PANEL_TIME_TEXT_AUTOMATION_CLASS
    : WORKER_PANEL_TIME_TEXT_CLASS;

  return (
    <UiListItem
      className={itemClassName}
      selected={isActive}
      onClick={onClick}
    >
      <div className={WORKER_CHAT_ITEM_HEAD_CLASS}>
        <UnreadDot chat={chat} />
        <span className={WORKER_CHAT_NAME_CLASS}>{previewText}</span>
        <span className={WORKER_CHAT_ACTION_CLASS} data-action={action}>
          {chat.hasPendingAwaiting && (
            <span className={CHAT_AWAITING_STATUS_CLASS}>
              {t(getAwaitingStatusKey(chat.awaitingMode))}
            </span>
          )}
          <MaterialIcon
            name="progress_activity"
            className={loadingClassName}
          />
          <span className={timeLabelClassName}>
            <span className={timeContentClassName}>
              {showAutomationSource && (
                <AutomationSourceIcon label={t("leftSidebar.automationSource")} />
              )}
              <span className={timeTextClassName}>
                {formatChatTimeLabel(chat.updatedAt)}
              </span>
            </span>
          </span>
          <ChatActionsMenu
            chatId={chat.chatId}
            chatName={chat.chatName}
            triggerClassName={CHAT_ACTIONS_TRIGGER_CLASS}
          />
        </span>
      </div>
    </UiListItem>
  );
};
