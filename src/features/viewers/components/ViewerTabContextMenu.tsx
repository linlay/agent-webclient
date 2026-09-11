import React from "react";
import { Dropdown, type MenuProps } from "antd";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { useStandaloneViewerActions } from "@/features/viewers/hooks/useStandaloneViewerActions";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { isAppMode } from "@/shared/utils/routing";

export const ViewerTabContextMenu: React.FC<{
  target: ViewerTarget;
  chatId: string;
  teamChat?: boolean;
  children: React.ReactElement;
  onDownload: () => void;
  onRefresh: () => void;
  onFullscreen: () => void;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
}> = ({ target, chatId, teamChat, children, onDownload, onRefresh, onFullscreen, onClose, onOpenChange }) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const standalone = !isAppMode();
  const localActions = useStandaloneViewerActions(target, chatId, teamChat, open && standalone);
  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const items: MenuProps["items"] = [
    standalone ? {
      key: "refresh",
      label: t("rightSidebar.web.contextMenu.refresh"),
      icon: <MaterialIcon name="refresh" className="tw:opacity-[0.5]" />,
      onClick: onRefresh,
    } : {
      key: "download",
      label: t("contentViewer.action.download"),
      icon: <MaterialIcon name="download" className="tw:opacity-[0.5]" />,
      onClick: onDownload,
    },
    {
      key: "fullscreen",
      label: t("rightSidebar.web.contextMenu.fullscreen"),
      icon: <MaterialIcon name="crop_free" className="tw:opacity-[0.5]" />,
      onClick: onFullscreen,
    },
    ...(standalone ? [
      { type: "divider" as const, key: "external-divider" },
      {
        key: "reveal",
        label: localActions.revealLabel,
        icon: <MaterialIcon name="folder_open" className="tw:opacity-[0.5]" />,
        title: localActions.hint,
        disabled: localActions.disabled,
        onClick: () => void localActions.run("reveal"),
      },
      {
        key: "open-default",
        label: t("contentViewer.localAction.openDefault"),
        icon: <MaterialIcon name="open_in_new" className="tw:opacity-[0.5]" />,
        title: localActions.hint,
        disabled: localActions.disabled,
        onClick: () => void localActions.run("open-default"),
      },
      { type: "divider" as const, key: "close-divider" },
    ] : []),
    {
      key: "close",
      label: t("rightSidebar.web.contextMenu.close"),
      icon: <MaterialIcon name="close" className="tw:opacity-[0.5]" />,
      onClick: onClose,
    },
  ];

  return (
    <Dropdown
      open={open}
      trigger={["contextMenu"]}
      overlayStyle={{ minWidth: standalone ? 200 : 100 }}
      menu={{ items, onClick: () => changeOpen(false) }}
      onOpenChange={changeOpen}
    >
      {children}
    </Dropdown>
  );
};
