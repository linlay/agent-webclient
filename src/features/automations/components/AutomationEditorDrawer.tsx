import { useCallback, useEffect, useState } from "react";
import { Drawer, Modal } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Team } from "@/features/workers/lib/workerState";
import { AutomationEditor } from "@/features/automations/components/AutomationEditor";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./AutomationEditorDrawer.module.css";

export interface AutomationEditorDrawerProps {
  open: boolean;
  automationId: string;
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
  onClose: () => void;
  onSaved: (automationId: string) => void;
  onDeleted: (automationId: string) => void;
}

export function AutomationEditorDrawer({
  open,
  automationId,
  currentWorker,
  agents,
  teams,
  onClose,
  onSaved,
  onDeleted,
}: AutomationEditorDrawerProps) {
  const { t } = useI18n();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  const close = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    Modal.confirm({
      title: t("automationHistory.editor.discardTitle"),
      content: t("automationHistory.editor.discardContent"),
      okText: t("automationHistory.action.discard"),
      cancelText: t("automationHistory.action.continueEditing"),
      okButtonProps: { danger: true },
      onOk: onClose,
    });
  }, [dirty, onClose, t]);

  return (
    <Drawer
      open={open}
      onClose={close}
      destroyOnHidden
      placement="right"
      width="min(680px, 100vw)"
      className={styles.editorDrawer}
      title={
        automationId
          ? t("automationHistory.editor.editTitle")
          : t("automationHistory.editor.createTitle")
      }
      closable={{ closeIcon: <MaterialIcon name="chevron_right" /> }}
      styles={{
        header: { borderBottom: 0, padding: "10px 12px" },
        body: { padding: "0 12px 12px", overflow: "hidden" },
      }}
    >
      <AutomationEditor
        key={automationId || "new"}
        automationId={automationId}
        currentWorker={currentWorker}
        agents={agents}
        teams={teams}
        onDirtyChange={setDirty}
        onSaved={(id) => {
          setDirty(false);
          onSaved(id);
        }}
        onDeleted={(id) => {
          setDirty(false);
          onDeleted(id);
        }}
      />
    </Drawer>
  );
}
