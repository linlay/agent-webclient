import React from "react";
import { Badge, Button, Flex, Tooltip, Typography } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";

type AgentIconConfig = {
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
}> = ({
  row,
  isActive,
  icon,
  lastChat,
  unreadCount = 0,
  onStartNewConversation,
}) => {
  const { t } = useI18n();
  const preview = lastChat
    ? lastChat?.lastRunContent ||
      lastChat?.chatName ||
      t("leftSidebar.latestConversationNoReply")
    : t("leftSidebar.noHistory");

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
            <span className="worker-panel-role">{row.role || "--"}</span>
          </Typography.Text>
          <Badge count={unreadCount} size="small" color="blue" />
          <Tooltip title={t("leftSidebar.newConversation")}>
            <Button
              className="worker-panel-new"
              type="text"
              icon={<MaterialIcon name="add" />}
              onClick={(e) => onStartNewConversation(e, row.key)}
            />
          </Tooltip>
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

