import React from "react";
import { Modal } from "antd";
import { HistoryModal } from "@/features/chats/components/HistoryModal";

export const SidebarHistorySection: React.FC<{
  open: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}> = ({ open, onClose, onSelectChat }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnHidden
      width="min(780px, calc(100vw - 32px))"
      className="worker-history-modal"
    >
      <HistoryModal
        onClose={onClose}
        onSelectChat={(chatId) => {
          onClose();
          onSelectChat(chatId);
        }}
      />
    </Modal>
  );
};
