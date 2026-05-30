import React from "react";
import { Badge, Button, Dropdown, Flex, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";

type AgentIconConfig = string | {
  color?: string;
  name?: string;
};

export const WorkerPanelHeader: React.FC<{
  row: WorkerRow;
  isActive: boolean;
  icon?: AgentIconConfig;
  lastChat?: WorkerConversationRow;
  unreadCount?: number;
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
  onMarkAllRead?: (e: React.MouseEvent<HTMLElement>, workerKey: string) => void;
  onOpenWorkspace?: (workerKey: string) => void;
}> = ({
  row,
  isActive,
  icon,
  lastChat,
  unreadCount = 0,
  onStartNewConversation,
  onMarkAllRead,
  onOpenWorkspace,
}) => {
  const { t } = useI18n();
  const subtitle = row.agentType === "coder" ? "" : row.role;
  const canOpenWorkspace = Boolean(row.workspaceDir);
  const workspaceUnavailableTitle =
    row.workspaceSourceKind === "browser-folder"
      ? t("leftSidebar.browserWorkspaceOpenUnavailable")
      : t("leftSidebar.workspaceUnavailable");
  const preview = lastChat
    ? lastChat?.lastRunContent ||
      lastChat?.chatName ||
      t("leftSidebar.latestConversationNoReply")
    : t("leftSidebar.noHistory");
  const actionMenuItems: MenuProps["items"] = [
    {
      key: "openWorkspace",
      icon: <MaterialIcon name="folder_open" />,
      label: t("leftSidebar.openWorkspace"),
      disabled: !canOpenWorkspace,
    },
  ];

  return (
    <div
      className={`worker-panel-header ${isActive ? "is-active" : ""} ${
        row.hasHistory ? "" : "is-empty"
      }`}
    >
      <AgentIcon
        icon={icon}
        type={row.type}
        props={{
          icon: {
            className: "worker-panel-icon",
          },
          avatar: {
            className: "worker-panel-icon",
          },
        }}
      />
      <Flex vertical style={{ overflow: "hidden", flex: 1 }}>
        <Flex align="center" className="worker-panel-header-body">
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {row.displayName}
            {subtitle && (
              <span className="worker-panel-role" title={row.agentType === "coder" ? row.workspaceDir || row.workspaceName : undefined}>
                {subtitle}
              </span>
            )}
          </Typography.Text>
          <Badge count={unreadCount} size="small" color="blue" />
          <Flex gap={6}>
            {row.type === "agent" && unreadCount > 0 && onMarkAllRead && (
              <Tooltip title={t("leftSidebar.markAllRead")}>
                <Button
                  className="worker-panel-new"
                  type="text"
                  icon={<MaterialIcon name="done_all" />}
                  onClick={(e) => onMarkAllRead(e, row.key)}
                />
              </Tooltip>
            )}
            <Tooltip title={t("leftSidebar.newConversation")}>
              <Button
                className="worker-panel-new"
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
                  className="worker-panel-new"
                  type="text"
                  icon={<MaterialIcon name="more_horiz" />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Tooltip>
            </Dropdown>
          </Flex>
        </Flex>
        <Flex align="center" className="worker-panel-preview" gap={4}>
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {preview}
          </Typography.Text>
          {lastChat?.hasPendingAwaiting && (
            <span className="chat-awaiting-status">
              {t("leftSidebar.awaitingApproval")}
            </span>
          )}
          {!!lastChat?.updatedAt && (
            <span className="worker-panel-time-label">
              {formatChatTimeLabel(lastChat?.updatedAt)}
            </span>
          )}
        </Flex>
      </Flex>
    </div>
  );
};
