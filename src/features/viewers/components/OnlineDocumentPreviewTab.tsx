import React from "react";
import { message } from "antd";
import { useI18n } from "@/shared/i18n";
import { useOnlineDocumentPreview } from "../hooks/useOnlineDocumentPreview";
import type { DocumentPreviewTabState } from "../lib/documentPreview";
import { downloadViewerTarget } from "../lib/viewerRuntime";
import { OnlineDocumentPreview } from "./OnlineDocumentPreview";

export function OnlineDocumentPreviewTab({ tab, onBack }: {
  tab: DocumentPreviewTabState;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const preview = useOnlineDocumentPreview({
    target: tab.target,
    chatId: tab.chatId,
    name: tab.target.name,
    refreshKey: 0,
    initialResult: tab.result,
  });
  const handleDownload = async () => {
    try {
      await downloadViewerTarget(tab.target, { chatId: tab.chatId, teamChat: tab.teamChat });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("contentViewer.error.download"));
    }
  };
  return <OnlineDocumentPreview preview={preview} name={tab.target.name}
    onBack={onBack} onDownload={handleDownload} />;
}
