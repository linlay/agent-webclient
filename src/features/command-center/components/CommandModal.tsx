import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import { Modal } from "antd";
import type { CommandOverlayState } from "@/features/command-center/lib/commandOverlay";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import { AutomationHistoryConsole } from "@/features/automations/components/AutomationHistoryConsole";
import { AgentConsole } from "@/features/workers/components/AgentConsole";
import { useI18n } from "@/shared/i18n";

interface CommandModalProps {
  modal: CommandOverlayState;
  onPatch: (patch: Partial<CommandOverlayState>) => void;
  onClose: (restoreComposerFocus?: boolean) => void;
  variant?: "default" | "copilot";
}

export const CommandModal: React.FC<CommandModalProps> = ({
  modal,
  onPatch,
  onClose,
  variant = "default",
}) => {
  const state = useAppState();
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const [agentConsoleDirty, setAgentConsoleDirty] = useState(false);

  const currentWorker = useMemo(
    () => (modal.type === "agents" ? null : resolveCurrentWorkerSummary(state)),
    [modal.type, state],
  );

  const closeModal = (restoreComposerFocus = true) => {
    if (
      modal.type === "agents" &&
      agentConsoleDirty &&
      !window.confirm(t("agentConsole.confirm.close"))
    ) {
      return;
    }
    onClose(restoreComposerFocus);
  };

  const selectHistoryChat = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return;
    closeModal(false);
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", {
        detail: {
          chatId: normalizedChatId,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  useEffect(() => {
    if (!modal.open || modal.type === "history") return;
    cardRef.current?.focus();
  }, [modal.open, modal.type]);

  if (!modal.open || !modal.type) {
    return null;
  }

  const isConsoleModal = modal.type === "automation" || modal.type === "agents";

  return (
    <Modal
      open={modal.open}
      onCancel={() => closeModal()}
      footer={null}
      centered
      closable={false}
      destroyOnHidden
      getContainer={false}
      width={
        isConsoleModal
          ? "min(1120px, calc(100vw - 32px))"
          : "min(780px, calc(100vw - 32px))"
      }
      className={`command-modal ${isConsoleModal ? "is-automation-console" : ""} ${variant === "copilot" ? "copilot-modal" : ""}`.trim()}
    >
      <div
        ref={cardRef}
        className={`command-modal-card ${isConsoleModal ? "is-automation-console" : ""}`}
      >
        {modal.type === "history" && (
          <HistoryModal
            onSelectChat={selectHistoryChat}
            onClose={() => closeModal()}
          />
        )}

        {modal.type === "automation" && (
          <AutomationHistoryConsole
            currentWorker={currentWorker}
            agents={state.agents}
            teams={state.teams}
            embedded
            onClose={() => closeModal()}
          />
        )}

        {modal.type === "agents" && (
          <AgentConsole
            embedded
            onClose={() => closeModal()}
            onDirtyChange={setAgentConsoleDirty}
          />
        )}
      </div>
    </Modal>
  );
};
