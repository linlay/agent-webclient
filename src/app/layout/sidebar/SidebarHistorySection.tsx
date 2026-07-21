import React from "react";
import { Flex, Modal } from "antd";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import { HistoryWorkerSelector } from "@/features/chats/components/HistoryWorkerSelector";
import { useI18n } from "@/shared/i18n";
import type { Agent, Team, WorkerConversationRow, WorkerRow } from "@/app/state/types";

const HISTORY_MODAL_TITLE_TAG_CLASS =
  "history-modal-title-tag tw:rounded-[10px] tw:bg-accent-soft tw:px-1.5 tw:py-0.5 tw:text-xs tw:font-normal tw:text-accent";

export const SidebarHistorySection: React.FC<{
  open: boolean;
  historyWorker: WorkerRow | null;
  workerRows: WorkerRow[];
  workerIconsByKey?: ReadonlyMap<string, Agent["icon"] | Team["icon"]>;
  historyRows: WorkerConversationRow[];
  historyIndex: number;
  historySearch: string;
  historyInputRef: React.RefObject<HTMLInputElement>;
  historyListRef: React.RefObject<HTMLDivElement>;
  historyItemRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onClose: () => void;
  onHistoryWorkerChange: (workerKey: string) => void;
  onHistorySearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelectChat: (chatId: string) => void;
  onMarkAllRead?: (event: React.MouseEvent<HTMLElement>) => void;
  onChatDeleted?: (chatId: string) => void;
}> = ({
  open,
  historyWorker,
  workerRows,
  workerIconsByKey,
  historyRows,
  historyIndex,
  historySearch,
  historyInputRef,
  historyListRef,
  historyItemRefs,
  onClose,
  onHistoryWorkerChange,
  onHistorySearchChange,
  onActivateIndex,
  onSelectChat,
  onMarkAllRead,
  onChatDeleted,
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
        <Flex align="center" gap={6} className="history-modal-title">
          <span>{t("leftSidebar.historyTitle")}</span>
          <HistoryWorkerSelector
            worker={historyWorker}
            workerRows={workerRows}
            workerIconsByKey={workerIconsByKey}
            onChange={onHistoryWorkerChange}
          />
          <div className={HISTORY_MODAL_TITLE_TAG_CLASS}>
            {t("leftSidebar.historyCount", { count: historyRows.length })}
          </div>
        </Flex>
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
        onMarkAllRead={onMarkAllRead}
        onChatDeleted={onChatDeleted}
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
