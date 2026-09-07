import React from "react";
import { Dropdown, Tooltip, type MenuProps } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import { canOpenWorkerWorkspace } from "@/features/workers/lib/workerWorkspace";

export interface WorkerActionHandlers {
  onOpenWorkspace?: (workerKey: string) => void;
  onOpenConfigDirectory?: (workerKey: string) => void;
  onRenameAgent?: (workerKey: string, agentKey: string, currentName: string) => void;
  onEditAgent?: (agentKey: string) => void;
  onCopyAgent?: (workerKey: string, agentKey: string) => void;
  onDeleteAgent?: (workerKey: string, agentKey: string) => void;
}

export const WorkerActionsMenu: React.FC<WorkerActionHandlers & {
  row: WorkerRow;
  children: React.ReactElement;
}> = ({ row, children, ...handlers }) => {
  const { t } = useI18n();
  const isAgent = row.type === "agent";
  const canOpenWorkspace = canOpenWorkerWorkspace(row);
  const item = (
    key: string,
    icon: React.ComponentProps<typeof MaterialIcon>["name"],
    label: string,
  ) => ({
    key,
    className: "ui-icon-hover-24",
    icon: <MaterialIcon name={icon} className="ui-icon-hover-24-target" />,
    label: t(label),
  });
  const items: MenuProps["items"] = [
    {
      ...item("openWorkspace", "folder_open", "leftSidebar.openWorkspace"),
      disabled: !canOpenWorkspace,
    },
  ];
  if (isAgent) {
    items.push({
      ...item("openConfigDirectory", "data_object", "leftSidebar.openConfigDirectory"),
      disabled: !row.agentConfigDir,
    });
    if (handlers.onRenameAgent) {
      items.push(item("renameAgent", "rename", "leftSidebar.renameAgent"));
    }
    if (handlers.onEditAgent) {
      items.push(item("editAgent", "settings", "leftSidebar.editAgent"));
    }
    if (handlers.onCopyAgent) {
      items.push(item("copyAgent", "content_copy", "leftSidebar.copyAgentInfo"));
    }
    if ((row.agentType === "coder" || row.agentType === "kbase") && handlers.onDeleteAgent) {
      items.push({
        ...item("deleteAgent", "delete", "leftSidebar.deleteAgent"),
        danger: true,
      });
    }
  }

  const onClick: MenuProps["onClick"] = ({ domEvent, key }) => {
    domEvent.stopPropagation();
    if (key === "openWorkspace" && canOpenWorkspace) {
      handlers.onOpenWorkspace?.(row.key);
    } else if (key === "openConfigDirectory" && row.agentConfigDir) {
      handlers.onOpenConfigDirectory?.(row.key);
    } else if (key === "renameAgent") {
      handlers.onRenameAgent?.(row.key, row.sourceId, row.displayName);
    } else if (key === "editAgent") {
      handlers.onEditAgent?.(row.sourceId);
    } else if (key === "copyAgent") {
      handlers.onCopyAgent?.(row.key, row.sourceId);
    } else if (key === "deleteAgent") {
      handlers.onDeleteAgent?.(row.key, row.sourceId);
    }
  };

  return (
    <Dropdown trigger={["click"]} menu={{ items, onClick }}>
      <Tooltip title={t(canOpenWorkspace
        ? "leftSidebar.moreActions"
        : row.workspaceSourceKind === "browser-folder"
          ? "leftSidebar.browserWorkspaceOpenUnavailable"
          : "leftSidebar.workspaceUnavailable")}
      >
        {children}
      </Tooltip>
    </Dropdown>
  );
};
