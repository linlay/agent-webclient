import React from "react";
import { Button, Flex, Tooltip } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import type { WorkerConversationRow, WorkerRow } from "@/features/workers/lib/workerState";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";
import { WorkerActionsMenu, type WorkerActionHandlers } from "./WorkerActionsMenu";

type AgentIconConfig =
  | string
  | {
      color?: string;
      name?: string;
    };

const WORKER_CHAT_PREVIEW_LIST_CLASS =
  "worker-chat-preview-list tw:pb-0.5 tw:[&_.status-line]:border-0 tw:[&_.status-line]:bg-transparent tw:[&_.worker-chat-item+.worker-chat-item]:mt-0";

const WORKER_POPOVER_HEADER_CLASS =
  "worker-popover-header tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:px-3 tw:pb-2 tw:pt-2.5";

const WORKER_POPOVER_HEADER_MAIN_CLASS =
  "worker-popover-header-main tw:flex tw:min-w-0 tw:items-center tw:gap-2.5";

const WORKER_POPOVER_HEADER_ICON_CLASS =
  "worker-panel-icon worker-popover-header-icon tw:scale-[0.78] tw:transition-transform tw:duration-200 tw:ease-in-out";

const WORKER_POPOVER_HEADER_TITLE_CLASS =
  "worker-popover-header-title tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-bold tw:text-ink-1";

const WORKER_POPOVER_NEW_CLASS =
  "worker-panel-new worker-popover-new tw:!inline-flex tw:!h-6 tw:!w-6 tw:text-text-muted";

const WORKER_CHAT_DIVIDER_CLASS =
  "worker-chat-divider tw:mx-5 tw:h-px tw:bg-border";

const WORKER_CHAT_MORE_CLASS =
  "worker-chat-more tw:cursor-pointer tw:px-[9px] tw:py-[4px] tw:text-center tw:text-[12px] tw:text-text-muted tw:opacity-[0.72]";

export const WorkerConversationPreviewList: React.FC<WorkerActionHandlers & {
  row: WorkerRow;
  chats: WorkerConversationRow[];
  activeChatId: string;
  icon?: AgentIconConfig;
  showHeader?: boolean;
  totalChatCount?: number;
  getWorkerChatLoading: (chatId: string) => boolean;
  onSelectChat: (chatId: string) => void;
  onOpenHistory: (event: React.MouseEvent<Element>) => void;
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
  onMarkAllRead?: (e: React.MouseEvent<HTMLElement>, workerKey: string) => void;
}> = ({
  row,
  chats,
  activeChatId,
  icon,
  showHeader = false,
  totalChatCount,
  getWorkerChatLoading,
  onSelectChat,
  onOpenHistory,
  onStartNewConversation,
  onMarkAllRead,
  ...workerActions
}) => {
  const { t } = useI18n();
  const recentChats = chats.slice(0, 5);
  const showMoreCount = Math.max(
    Number.isFinite(Number(totalChatCount)) ? Number(totalChatCount) : 0,
    chats.length,
  );
  const unreadCount = chats.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );
  const unreadSuffix =
    unreadCount > 0
      ? t("leftSidebar.showMoreUnreadSuffix", { count: unreadCount })
      : "";

  return (
    <div className={WORKER_CHAT_PREVIEW_LIST_CLASS}>
      {showHeader && (
        <div className={WORKER_POPOVER_HEADER_CLASS}>
          <div className={WORKER_POPOVER_HEADER_MAIN_CLASS}>
            <AgentIcon
              icon={icon}
              type={row.type}
              props={{
                icon: {
                  className: WORKER_POPOVER_HEADER_ICON_CLASS,
                },
                avatar: {
                  className: WORKER_POPOVER_HEADER_ICON_CLASS,
                },
              }}
            />
            <span className={WORKER_POPOVER_HEADER_TITLE_CLASS}>
              {row.displayName}
            </span>
          </div>
          <Flex gap={4}>
            {row.type === "agent" && unreadCount > 0 && onMarkAllRead && (
              <Tooltip title={t("leftSidebar.markAllRead")}>
                <Button
                  className={`${WORKER_POPOVER_NEW_CLASS} ui-icon-hover-24`}
                  type="text"
                  icon={<MaterialIcon name="done_all" />}
                  onClick={(e) => onMarkAllRead(e, row.key)}
                />
              </Tooltip>
            )}
            <Tooltip title={t("leftSidebar.newConversation")}>
              <Button
                className={`${WORKER_POPOVER_NEW_CLASS} ui-icon-hover-24`}
                type="text"
                icon={<MaterialIcon name="edit_square" />}
                onClick={(e) => onStartNewConversation(e, row.key)}
              />
            </Tooltip>
            <WorkerActionsMenu
              row={row}
              {...workerActions}
            >
              <Button
                className={`${WORKER_POPOVER_NEW_CLASS} ui-icon-hover-24`}
                type="text"
                icon={<MaterialIcon name="more_horiz" />}
                onClick={(event) => event.stopPropagation()}
              />
            </WorkerActionsMenu>
          </Flex>
        </div>
      )}
      <div className={WORKER_CHAT_DIVIDER_CLASS}></div>
      {recentChats.length === 0 ? (
        <div className="status-line">
          {t("leftSidebar.noRelatedConversations")}
        </div>
      ) : (
        recentChats.map((chat) => (
          <WorkerChatPreviewItem
            key={chat.chatId}
            chat={chat}
            isActive={chat.chatId === activeChatId}
            loading={getWorkerChatLoading(chat.chatId)}
            onClick={() => onSelectChat(chat.chatId)}
          />
        ))
      )}
      {showMoreCount > 5 && (
        <div
          className={WORKER_CHAT_MORE_CLASS}
          onClick={(e) => onOpenHistory(e)}
        >
          {t("leftSidebar.showMore", {
            count: showMoreCount,
            unreadSuffix,
          })}
        </div>
      )}
    </div>
  );
};
