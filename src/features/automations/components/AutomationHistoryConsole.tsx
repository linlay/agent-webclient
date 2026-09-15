import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import { App as AntdApp } from "antd";
import { useState } from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Team } from "@/features/workers/lib/workerState";
import { useAppState } from "@/app/state/AppContext";
import { AutomationEditorDrawer } from "@/features/automations/components/AutomationEditorDrawer";
import { AutomationExecutionDrawer } from "@/features/automations/components/AutomationExecutionDrawer";
import { AutomationExecutionHistory } from "@/features/automations/components/AutomationExecutionHistory";
import { AutomationListPane } from "@/features/automations/components/AutomationListPane";
import { useAutomationHistoryRuntime } from "@/features/automations/hooks/useAutomationHistoryRuntime";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import styles from "./AutomationHistoryConsole.module.css";

export interface AutomationHistoryConsoleProps {
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
  embedded?: boolean;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
}

export function AutomationHistoryConsole({
  currentWorker,
  agents,
  teams,
  embedded = false,
  onClose,
  titleBarVariant = "default",
}: AutomationHistoryConsoleProps) {
  const { modal } = AntdApp.useApp();
  const { t } = useI18n();
  const state = useAppState();
  const assistant = useResourceAssistant();
  const effectiveAgents = agents.length ? agents : state.agents;
  const effectiveTeams = teams.length ? teams : state.teams;
  const runtime = useAutomationHistoryRuntime(effectiveAgents.length > 0);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAutomationId, setEditorAutomationId] = useState("");

  const openCreate = () => {
    setEditorAutomationId("");
    setEditorOpen(true);
  };

  const deleteSelected = () => {
    if (!runtime.selected || runtime.actionBusy) return;
    modal.confirm({
      title: t("automationConsole.confirm.deleteTitle"),
      content: runtime.selected.name || runtime.selected.id,
      okText: t("automationConsole.confirm.deleteOk"),
      cancelText: t("automationConsole.confirm.deleteCancel"),
      okButtonProps: { danger: true },
      onOk: runtime.deleteSelected,
    });
  };

  return (
    <>
      {embedded ? (
        <ModalTitleBar
          title={t("commandModal.automation.title")}
          variant={titleBarVariant}
          onClose={() => onClose?.()}
        />
      ) : null}
      <div className={styles.console}>
        <AutomationListPane
          agents={effectiveAgents}
          automations={runtime.automations}
          error={runtime.listError}
          loading={runtime.listLoading}
          search={search}
          selectedId={runtime.selectedId}
          teams={effectiveTeams}
          onCreate={openCreate}
          onCreateConversation={() => { if (!runtime.actionBusy && !assistant.opening) void assistant.open({ kind: "automation" }, onClose); }}
          onRetry={() => void runtime.loadAutomationList(runtime.selectedId)}
          onSearchChange={setSearch}
          onSelect={runtime.selectAutomation}
        />
        <AutomationExecutionHistory
          actionBusy={runtime.actionBusy}
          executionError={runtime.executionError}
          executionLoading={runtime.executionLoading}
          executions={runtime.executions}
          executionTotal={runtime.executionTotal}
          historyStatus={runtime.historyStatus}
          moreLoading={runtime.moreLoading}
          selected={runtime.selected}
          selectedTriggering={
            runtime.selected
              ? runtime.triggeringIds.has(runtime.selected.id)
              : false
          }
          onCreate={openCreate}
          onDelete={deleteSelected}
          onDuplicate={() => void runtime.duplicateSelected()}
          onEditConversation={() => { if (runtime.selected && !assistant.opening) void assistant.open({ kind: "automation", target: { id: runtime.selected.id, name: runtime.selected.name } }, onClose); }}
          onEdit={() => {
            if (!runtime.selected) return;
            setEditorAutomationId(runtime.selected.id);
            setEditorOpen(true);
          }}
          onLoadMore={() => {
            if (runtime.selected) {
              void runtime.loadExecutions(runtime.selected.id, false);
            }
          }}
          onRefresh={() =>
            void runtime.loadAutomationList(runtime.selected?.id || "")
          }
          onRetryExecutions={() => {
            if (runtime.selected) {
              void runtime.loadExecutions(runtime.selected.id, true);
            }
          }}
          onToggle={() => void runtime.toggleSelected()}
          onTrigger={() => {
            if (runtime.selected) {
              void runtime.triggerAutomationItem(runtime.selected);
            }
          }}
          onView={runtime.openViewer}
        />
        <AutomationEditorDrawer
          open={editorOpen}
          automationId={editorAutomationId}
          currentWorker={currentWorker}
          agents={effectiveAgents}
          teams={effectiveTeams}
          onClose={() => setEditorOpen(false)}
          onSaved={(id) => {
            setEditorOpen(false);
            void runtime.loadAutomationList(id);
          }}
          onDeleted={() => {
            setEditorOpen(false);
            void runtime.loadAutomationList();
          }}
        />
        <AutomationExecutionDrawer
          execution={runtime.viewerExecution}
          agents={effectiveAgents}
          teams={effectiveTeams}
          refreshRevision={runtime.viewerRefreshRevision}
          returnFocusRef={runtime.viewerTriggerRef}
          onClose={runtime.closeViewer}
        />
      </div>
    </>
  );
}
