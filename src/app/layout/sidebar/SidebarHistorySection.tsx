import React from "react";
import { Modal } from "antd";
import { HistoryModal } from "@/app/modals/HistoryModal";
import { useI18n } from "@/shared/i18n";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";

export const SidebarHistorySection: React.FC<{
  open: boolean;
  historyWorker: WorkerRow | null;
  historyRows: WorkerConversationRow[];
  historyIndex: number;
  historySearch: string;
  historyInputRef: React.RefObject<HTMLInputElement>;
  historyListRef: React.RefObject<HTMLDivElement>;
  historyItemRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onClose: () => void;
  onHistorySearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelectChat: (chatId: string) => void;
}> = ({
  open,
  historyWorker,
  historyRows,
  historyIndex,
  historySearch,
  historyInputRef,
  historyListRef,
  historyItemRefs,
  onClose,
  onHistorySearchChange,
  onActivateIndex,
  onSelectChat,
}) => {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width="min(780px, calc(100vw - 32px))"
      className="worker-history-modal"
      title={
        historyWorker
          ? t("leftSidebar.historyTitleWithWorker", {
              workerTypeLabel:
                historyWorker.type === "team"
                  ? t("switch.workerType.team")
                  : t("switch.workerType.agent"),
              displayName: historyWorker.displayName,
            })
          : t("leftSidebar.historyTitle")
      }
    >
      <HistoryModal
        historyRows={historyRows}
        historyIndex={Math.min(
          historyIndex,
          Math.max(historyRows.length - 1, 0),
        )}
        historySearch={historySearch}
        historyInputRef={historyInputRef}
        historyListRef={historyListRef}
        historyItemRefs={historyItemRefs}
        onHistorySearchChange={onHistorySearchChange}
        onActivateIndex={onActivateIndex}
        onSelect={(index) => {
          const target = historyRows[index];
          if (!target) return;
          onClose();
          onSelectChat(target.chatId);
        }}
      />
    </Modal>
  );
};

