import React from "react";
import { Dropdown } from "antd";
import { useI18n } from "@/shared/i18n";
import { useOnlineDocumentPreview } from "../hooks/useOnlineDocumentPreview";
import type { DocumentPreviewTabState } from "../lib/documentPreview";
import { OnlineDocumentPreview } from "./OnlineDocumentPreview";

export interface OnlineDocumentPreviewTabActions {
  canReload: boolean;
  canOpenInBrowser: boolean;
  reload: () => Promise<void>;
  openInBrowser: () => void;
}

export const OnlineDocumentPreviewTab = React.forwardRef<OnlineDocumentPreviewTabActions, {
  tab: DocumentPreviewTabState;
}>(function OnlineDocumentPreviewTab({ tab }, ref) {
  const preview = useOnlineDocumentPreview({
    target: tab.target,
    chatId: tab.chatId,
    name: tab.target.name,
    refreshKey: 0,
    initialResult: tab.result,
  });
  React.useImperativeHandle(ref, () => ({
    canReload: !preview.pending && !preview.reason,
    canOpenInBrowser: Boolean(preview.result && !preview.expired && !preview.pending),
    reload: preview.prepare,
    openInBrowser: () => {
      if (preview.result && !preview.expired && preview.result.expiresAt > Date.now()) {
        window.open(preview.result.url, "_blank", "noopener,noreferrer");
      }
    },
  }));
  return <OnlineDocumentPreview preview={preview} name={tab.target.name} />;
});

export function OnlineDocumentPreviewTabContextMenu({ previewRef, onClose, children }: {
  previewRef: React.RefObject<OnlineDocumentPreviewTabActions>;
  onClose: () => void;
  children: React.ReactElement;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const actions = open ? previewRef.current : null;
  return <Dropdown trigger={["contextMenu"]} open={open} onOpenChange={setOpen} menu={{ onClick: () => setOpen(false), items: [
    { key: "reload", label: t("contentViewer.preview.reload"), disabled: !actions?.canReload,
      onClick: () => void previewRef.current?.reload() },
    { key: "openBrowser", label: t("contentViewer.preview.openBrowser"), disabled: !actions?.canOpenInBrowser,
      onClick: () => previewRef.current?.openInBrowser() },
    { type: "divider" },
    { key: "close", label: t("rightSidebar.web.contextMenu.close"), onClick: onClose },
  ] }}>{children}</Dropdown>;
}
