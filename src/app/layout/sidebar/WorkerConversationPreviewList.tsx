import React from "react";
import { Button, Dropdown, Flex, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";

type AgentIconConfig = string | {
  color?: string;
  name?: string;
};

export const WorkerConversationPreviewList: React.FC<{
  row: WorkerRow;
  chats: WorkerConversationRow[];
  activeChatId: string;
  icon?: AgentIconConfig;
  showHeader?: boolean;
  totalChatCount?: number;
  getWorkerChatLoading: (chatId: string) => boolean;
  onSelectChat: (chatId: string) => void;
  onOpenHistory: (event: React.MouseEvent<Element>, workerKey: string) => void;
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
  onMarkAllRead?: (e: React.MouseEvent<HTMLElement>, workerKey: string) => void;
  onOpenWorkspace?: (workerKey: string) => void;
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
  onOpenWorkspace,
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
  const canOpenWorkspace = Boolean(row.workspaceDir);
  const workspaceUnavailableTitle =
    row.workspaceSourceKind === "browser-folder"
      ? t("leftSidebar.browserWorkspaceOpenUnavailable")
      : t("leftSidebar.workspaceUnavailable");
  const actionMenuItems: MenuProps["items"] = [
    {
      key: "openWorkspace",
      icon: <MaterialIcon name="folder_open" />,
      label: t("leftSidebar.openWorkspace"),
      disabled: !canOpenWorkspace,
    },
  ];

  return (
    <div className="worker-chat-preview-list">
      {showHeader && (
        <div className="worker-popover-header">
          <div className="worker-popover-header-main">
            <AgentIcon
              icon={icon}
              type={row.type}
              props={{
                icon: {
                  className: "worker-panel-icon worker-popover-header-icon",
                },
                avatar: {
                  className: "worker-panel-icon worker-popover-header-icon",
                },
              }}
            />
            <span className="worker-popover-header-title">
              {row.displayName}
            </span>
          </div>
          <Flex gap={6}>
            {row.type === "agent" && unreadCount > 0 && onMarkAllRead && (
              <Tooltip title={t("leftSidebar.markAllRead")}>
                <Button
                  className="worker-panel-new worker-popover-new"
                  type="text"
                  icon={<MaterialIcon name="done_all" />}
                  onClick={(e) => onMarkAllRead(e, row.key)}
                />
              </Tooltip>
            )}
            <Tooltip title={t("leftSidebar.newConversation")}>
              <Button
                className="worker-panel-new worker-popover-new"
                type="text"
                icon={<MaterialIcon name="edit_square" />}
                onClick={(e) => onStartNewConversation(e, row.key)}
              />
            </Tooltip>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: actionMenuItems,
                onClick: ({ domEvent, key }) => {
                  domEvent.stopPropagation();
                  if (key === "openWorkspace" && row.workspaceDir) {
                    onOpenWorkspace?.(row.key);
                  }
                },
              }}
            >
              <Tooltip title={canOpenWorkspace ? t("leftSidebar.moreActions") : workspaceUnavailableTitle}>
                <Button
                  className="worker-panel-new worker-popover-new"
                  type="text"
                  icon={<MaterialIcon name="more_horiz" />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Tooltip>
            </Dropdown>
          </Flex>
        </div>
      )}
      <div className="worker-chat-divider"></div>
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
          className="worker-chat-more"
          onClick={(e) => onOpenHistory(e, row.key)}
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
