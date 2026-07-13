import React from "react";
import { Badge, Button, Dropdown, Flex, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case "planning":
      return "leftSidebar.awaitingStatus.plan";
    case "question":
      return "leftSidebar.awaitingStatus.question";
    case "approval":
      return "leftSidebar.awaitingStatus.approval";
    case "form":
      return "leftSidebar.awaitingStatus.form";
    default:
      return "leftSidebar.awaitingApproval";
  }
}

type AgentIconConfig =
  | string
  | {
      color?: string;
      name?: string;
    };

const WORKER_PANEL_HEADER_CLASS =
  "worker-panel-header tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:[&_.chat-awaiting-status]:mr-[5px] tw:[&_.chat-awaiting-status]:whitespace-nowrap tw:[&_.chat-awaiting-status]:rounded-pill tw:[&_.chat-awaiting-status]:bg-[color-mix(in_srgb,var(--accent-warn)_10%,transparent)] tw:[&_.chat-awaiting-status]:px-1.5 tw:[&_.chat-awaiting-status]:py-0.5 tw:[&_.chat-awaiting-status]:text-[11px] tw:[&_.chat-awaiting-status]:text-accent-warn tw:[&_.worker-chat-loading]:mr-0.5 tw:[&_.worker-chat-loading]:animate-ui-spin tw:[&_.worker-chat-loading]:text-sm tw:[&_.worker-chat-loading]:text-text-sub tw:[&_.worker-panel-preview]:h-5 tw:[&_.worker-panel-preview]:overflow-hidden tw:[&_.worker-panel-preview]:text-ellipsis tw:[&_.worker-panel-preview]:whitespace-nowrap tw:[&_.worker-panel-preview]:text-xs tw:[&_.worker-panel-preview]:text-text-muted tw:[&_.worker-panel-preview]:transition-[height] tw:[&_.worker-panel-preview]:duration-200 tw:[&_.worker-panel-preview]:ease-in-out";

const WORKER_PANEL_ICON_CLASS =
  "worker-panel-icon tw:transition-transform tw:duration-200 tw:ease-in-out";

const WORKER_PANEL_HEADER_BODY_CLASS =
  "worker-panel-header-body tw:flex-1 tw:overflow-hidden tw:text-text-main tw:[&_.ant-badge]:scale-[0.8] tw:[&_.ant-badge_.ant-badge-count-sm]:h-[18px] tw:[&_.ant-badge_.ant-badge-count-sm]:min-w-[18px] tw:[&_.ant-badge_.ant-badge-count-sm]:rounded-[10px] tw:[&_.ant-badge_.ant-badge-count-sm]:leading-[18px]";

const WORKER_PANEL_ROLE_CLASS =
  "worker-panel-role tw:ml-2 tw:text-[11px] tw:text-text-muted";

const WORKER_PANEL_NEW_CLASS = "worker-panel-new";

const WORKER_CHAT_LOADING_CLASS =
  "worker-chat-loading tw:mr-0.5 tw:text-sm tw:text-text-sub tw:animate-ui-spin";

const CHAT_AWAITING_STATUS_CLASS =
  "chat-awaiting-status tw:mr-[5px] tw:whitespace-nowrap tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-warn)_10%,transparent)] tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:text-accent-warn";

const WORKER_TERMINAL_ACTIVE_CLASS =
  "worker-terminal-active tw:inline-flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-[color-mix(in_srgb,var(--accent-soft)_72%,transparent)] tw:text-accent-electric-strong tw:[&_.material-icon]:text-sm";

export const WorkerPanelHeader: React.FC<{
  row: WorkerRow;
  isActive: boolean;
  icon?: AgentIconConfig;
  lastChat?: WorkerConversationRow;
  awaitingChat?: WorkerConversationRow;
  activeRunChat?: WorkerConversationRow;
  unreadCount?: number;
  terminalStatus?: "idle" | "busy";
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
  onMarkAllRead?: (e: React.MouseEvent<HTMLElement>, workerKey: string) => void;
  onOpenWorkspace?: (workerKey: string) => void;
  onRenameAgent?: (
    workerKey: string,
    agentKey: string,
    currentName: string,
  ) => void;
  onEditAgent?: (agentKey: string) => void;
  onDeleteAgent?: (workerKey: string, agentKey: string) => void;
}> = ({
  row,
  isActive,
  icon,
  lastChat,
  awaitingChat,
  activeRunChat,
  unreadCount = 0,
  terminalStatus,
  onStartNewConversation,
  onMarkAllRead,
  onOpenWorkspace,
  onRenameAgent,
  onEditAgent,
  onDeleteAgent,
}) => {
  const { t } = useI18n();
  const subtitle = row.agentType === "coder" ? "" : row.role;
  const canOpenWorkspace = Boolean(row.workspaceDir);
  const workspaceUnavailableTitle =
    row.workspaceSourceKind === "browser-folder"
      ? t("leftSidebar.browserWorkspaceOpenUnavailable")
      : t("leftSidebar.workspaceUnavailable");
  const previewChat = awaitingChat || activeRunChat || lastChat;
  const preview = previewChat
    ? previewChat?.lastRunContent ||
      previewChat?.chatName ||
      t("leftSidebar.latestConversationNoReply")
    : t("leftSidebar.noHistory");
  const previewStatus = awaitingChat
    ? "awaiting"
    : activeRunChat
      ? "running"
      : "";
  const terminalActive = Boolean(terminalStatus);
  const terminalBusy = terminalStatus === "busy";
  const terminalTitle = terminalBusy
    ? t("leftSidebar.terminalBusy")
    : t("leftSidebar.terminalActive");
  const isAgent = row.type === "agent";
  const isCoder = row.agentType === "coder";
  const isKbase = row.agentType === "kbase";
  const actionMenuItems: MenuProps["items"] = [
    {
      key: "openWorkspace",
      icon: <MaterialIcon name="folder_open" />,
      label: t("leftSidebar.openWorkspace"),
      disabled: !canOpenWorkspace,
    },
    ...(isAgent && onRenameAgent
      ? [
          {
            key: "renameAgent",
            icon: <MaterialIcon name="rename" />,
            label: t("leftSidebar.renameAgent"),
          },
        ]
      : []),
    ...(isAgent && onEditAgent
      ? [
          {
            key: "editAgent",
            icon: <MaterialIcon name="settings" />,
            label: t("leftSidebar.editAgent"),
          },
        ]
      : []),
    ...(isAgent && (isCoder || isKbase) && onDeleteAgent
      ? [
          {
            key: "deleteAgent",
            icon: <MaterialIcon name="delete" />,
            label: t("leftSidebar.deleteAgent"),
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`${WORKER_PANEL_HEADER_CLASS} ${isActive ? "is-active" : ""} ${
        row.hasHistory ? "" : "is-empty"
      }`}
    >
      <AgentIcon
        icon={icon}
        type={row.type}
        props={{
          icon: {
            className: WORKER_PANEL_ICON_CLASS,
          },
          avatar: {
            className: WORKER_PANEL_ICON_CLASS,
          },
        }}
      />
      <Flex vertical style={{ overflow: "hidden", flex: 1 }}>
        <Flex align="center" className={WORKER_PANEL_HEADER_BODY_CLASS}>
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {row.displayName}
            {subtitle && (
              <span
                className={WORKER_PANEL_ROLE_CLASS}
                title={
                  row.agentType === "coder"
                    ? row.workspaceDir || row.workspaceName
                    : undefined
                }
              >
                {subtitle}
              </span>
            )}
          </Typography.Text>
          {terminalActive ? (
            <Tooltip title={terminalTitle}>
              <span
                className={`${WORKER_TERMINAL_ACTIVE_CLASS} ${
                  terminalBusy ? "is-busy" : ""
                }`}
                aria-label={terminalTitle}
              >
                <MaterialIcon name="terminal" />
              </span>
            </Tooltip>
          ) : null}
          <Badge count={unreadCount} size="small" color="blue" />
          <Flex gap={4}>
            {row.type === "agent" && unreadCount > 0 && onMarkAllRead && (
              <Tooltip title={t("leftSidebar.markAllRead")}>
                <Button
                  className={WORKER_PANEL_NEW_CLASS}
                  type="text"
                  icon={<MaterialIcon name="done_all" />}
                  onClick={(e) => onMarkAllRead(e, row.key)}
                />
              </Tooltip>
            )}
            <Tooltip title={t("leftSidebar.newConversation")}>
              <Button
                className={`${WORKER_PANEL_NEW_CLASS} ui-icon-hover-20`}
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
                  } else if (key === "renameAgent") {
                    onRenameAgent?.(row.key, row.sourceId, row.displayName);
                  } else if (key === "editAgent") {
                    onEditAgent?.(row.sourceId);
                  } else if (key === "deleteAgent") {
                    onDeleteAgent?.(row.key, row.sourceId);
                  }
                },
              }}
            >
              <Tooltip
                title={
                  canOpenWorkspace
                    ? t("leftSidebar.moreActions")
                    : workspaceUnavailableTitle
                }
              >
                <Button
                  className={WORKER_PANEL_NEW_CLASS}
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
          {previewStatus === "awaiting" && (
            <>
              <span className={CHAT_AWAITING_STATUS_CLASS}>
                {t(getAwaitingStatusKey(previewChat?.awaitingMode))}
              </span>
              <MaterialIcon
                name="progress_activity"
                className={WORKER_CHAT_LOADING_CLASS}
              />
            </>
          )}
          {previewStatus === "running" && (
            <MaterialIcon
              name="progress_activity"
              className={WORKER_CHAT_LOADING_CLASS}
            />
          )}
        </Flex>
      </Flex>
    </div>
  );
};
