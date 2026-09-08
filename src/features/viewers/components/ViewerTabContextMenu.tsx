import React from "react";
import { Dropdown, message, type MenuProps } from "antd";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { openStandaloneViewerTarget } from "@/features/viewers/lib/viewerRuntime";
import {
  canUseStandaloneFileActions,
  getStandaloneFileCapabilities,
  type StandaloneFileAction,
  type StandaloneFileCapabilities,
} from "@/shared/data/standalone/standaloneFileActions";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { isAppMode } from "@/shared/utils/routing";

export const ViewerTabContextMenu: React.FC<{
  target: ViewerTarget;
  chatId: string;
  teamChat?: boolean;
  children: React.ReactElement;
  onDownload: () => void;
  onFullscreen: () => void;
  onClose: () => void;
}> = ({ target, chatId, teamChat, children, onDownload, onFullscreen, onClose }) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState<StandaloneFileCapabilities | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const standalone = !isAppMode();
  const localServiceCandidate = canUseStandaloneFileActions();

  React.useEffect(() => {
    let disposed = false;
    setCapabilities(null);
    setChecking(open && localServiceCandidate);
    if (open && localServiceCandidate) {
      void getStandaloneFileCapabilities()
        .then((result) => {
          if (!disposed) setCapabilities(result);
        })
        .finally(() => {
          if (!disposed) setChecking(false);
        });
    }
    return () => {
      disposed = true;
    };
  }, [localServiceCandidate, open]);

  const handleLocalAction = async (action: StandaloneFileAction) => {
    if (!localServiceCandidate || !capabilities || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await openStandaloneViewerTarget(action, target, { chatId, teamChat }, capabilities);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("contentViewer.localAction.failed"));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const platform = capabilities?.platform || (typeof navigator === "undefined" ? "" : navigator.platform);
  const fileManager = /mac|darwin/iu.test(platform) ? "finder" : /win/iu.test(platform) ? "explorer" : "file-manager";
  const localActionHint = capabilities
    ? t("contentViewer.localAction.copyHint")
    : checking
      ? t("contentViewer.localAction.checking")
      : t(localServiceCandidate ? "contentViewer.localAction.unavailable" : "contentViewer.localAction.localOnly");
  const items: MenuProps["items"] = [
    {
      key: "download",
      label: t("contentViewer.action.download"),
      icon: <MaterialIcon name="download" className="tw:opacity-[0.5]" />,
      onClick: onDownload,
    },
    ...(standalone ? [
      {
        key: "reveal",
        label: t(fileManager === "finder"
          ? "contentViewer.localAction.revealInFinder"
          : fileManager === "explorer"
            ? "contentViewer.localAction.revealInExplorer"
            : "contentViewer.localAction.revealInFileManager"),
        icon: <MaterialIcon name="folder_open" className="tw:opacity-[0.5]" />,
        title: localActionHint,
        disabled: pending || !capabilities,
        onClick: () => void handleLocalAction("reveal"),
      },
      {
        key: "open-default",
        label: t("contentViewer.localAction.openDefault"),
        icon: <MaterialIcon name="open_in_new" className="tw:opacity-[0.5]" />,
        title: localActionHint,
        disabled: pending || !capabilities,
        onClick: () => void handleLocalAction("open-default"),
      },
    ] : []),
    {
      key: "fullscreen",
      label: t("rightSidebar.web.contextMenu.fullscreen"),
      icon: <MaterialIcon name="crop_free" className="tw:opacity-[0.5]" />,
      onClick: onFullscreen,
    },
    {
      key: "close",
      label: t("rightSidebar.web.contextMenu.close"),
      icon: <MaterialIcon name="close" className="tw:opacity-[0.5]" />,
      onClick: onClose,
    },
  ];

  return (
    <Dropdown
      trigger={["contextMenu"]}
      overlayStyle={{ minWidth: 100 }}
      menu={{ items }}
      onOpenChange={setOpen}
    >
      {children}
    </Dropdown>
  );
};
