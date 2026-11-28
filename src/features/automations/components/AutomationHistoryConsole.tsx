import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import { App as AntdApp } from "antd";
import React, { useEffect, useRef, useState } from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import { useAppState } from "@/app/state/AppContext";
import { AutomationEditorDrawer } from "@/features/automations/components/AutomationEditorDrawer";
import { AutomationExecutionDrawer } from "@/features/automations/components/AutomationExecutionDrawer";
import { AutomationExecutionHistory } from "@/features/automations/components/AutomationExecutionHistory";
import { AutomationListPane } from "@/features/automations/components/AutomationListPane";
import { useAutomationHistoryRuntime } from "@/features/automations/hooks/useAutomationHistoryRuntime";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { useMobilePageHeaderAction, MobilePageHeaderActionProvider, MobilePageHeaderActionSlot } from "@/shared/ui/MobilePageHeaderAction";
import styles from "./AutomationHistoryConsole.module.css";

export interface AutomationHistoryConsoleProps {
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];

  embedded?: boolean;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
  /** 移动端：列表收进左侧抽屉，执行历史独占整屏。 */
  mobile?: boolean;
}

export function AutomationHistoryConsole(props: AutomationHistoryConsoleProps) {
  if (props.embedded && props.mobile) {
    return (
      <MobilePageHeaderActionProvider>
        <AutomationHistoryConsoleContent {...props} />
      </MobilePageHeaderActionProvider>
    );
  }
  return <AutomationHistoryConsoleContent {...props} />;
}

const AutomationHistoryConsoleContent: React.FC<AutomationHistoryConsoleProps> = ({
  currentWorker,
  agents,

  embedded = false,
  onClose,
  titleBarVariant = "default",
  mobile = false,
}) => {
  const { modal } = AntdApp.useApp();
  const { t } = useI18n();
  const state = useAppState();
  const assistant = useResourceAssistant();
  const effectiveAgents = agents.length ? agents : state.agents;

  const runtime = useAutomationHistoryRuntime(effectiveAgents.length > 0);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAutomationId, setEditorAutomationId] = useState("");
  const consoleRootRef = useRef<HTMLDivElement>(null);
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const listDrawerRef = useRef<MobileSwipeDrawerHandle>(null);
  const emptyPanelRef = useRef<MobileSwipeDrawerHandle>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListLayout = Boolean(mobile);

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

  const selectedName =
    runtime.selected?.name ||
    runtime.selected?.id ||
    t("automationHistory.mobile.noSelection");
  useEffect(() => {
    if (!mobileListLayout) setMobileListOpen(false);
  }, [mobileListLayout]);
  useEffect(() => {
    const element = detailRegionRef.current;
    if (!element) return;
    element.inert = mobileListOpen;
    return () => { element.inert = false; };
  }, [mobileListOpen]);
  const openMobileList = () => setMobileListOpen(true);
  const closeMobileList = () => setMobileListOpen(false);
  const toggleMobileList = () => setMobileListOpen((open) => !open);
  useMobileSwipeGestures({
    rootRef: consoleRootRef,
    left: {
      ref: listDrawerRef,
      open: mobileListOpen,
      onOpen: openMobileList,
      onClose: closeMobileList,
    },
    right: {
      ref: emptyPanelRef,
      open: false,
      onOpen: () => {},
      onClose: () => {},
    },
    disabled: !mobileListLayout,
  });
  useMobilePageHeaderAction(
    mobileListLayout
      ? {
          label: selectedName,
          ariaLabel: t("automationHistory.mobile.switcherAriaLabel", {
            name: selectedName,
          }),
          avatar: (
            <MaterialIcon
              name="schedule"
              style={{ width: 20, height: 20, fontSize: 20 }}
            />
          ),
          icon: "swap_horiz",
          expanded: mobileListOpen,
          onActivate: toggleMobileList,
        }
      : null,
  );

  const listPane = (
    <AutomationListPane
      agents={effectiveAgents}
      automations={runtime.automations}
      error={runtime.listError}
      loading={runtime.listLoading}
      search={search}
      selectedId={runtime.selectedId}
      onCreate={() => {
        if (mobileListLayout) setMobileListOpen(false);
        openCreate();
      }}
      onCreateConversation={() => {
        if (!runtime.actionBusy && !assistant.opening) {
          if (mobileListLayout) setMobileListOpen(false);
          void assistant.open({ kind: "automation" }, onClose);
        }
      }}
      onRetry={() => void runtime.loadAutomationList(runtime.selectedId)}
      onSearchChange={setSearch}
      onSelect={(id) => {
        if (mobileListLayout) setMobileListOpen(false);
        runtime.selectAutomation(id);
      }}
    />
  );

  return (
    <>
      {embedded ? (
        <ModalTitleBar
          title={t("commandModal.automation.title")}
          variant={titleBarVariant}
          className="automation-console-titlebar"
          onClose={() => onClose?.()}
        >
          {mobile ? <MobilePageHeaderActionSlot /> : null}
        </ModalTitleBar>
      ) : null}
      <div
        ref={consoleRootRef}
        className={`${styles.console} ${mobileListLayout ? styles.isMobile : ""}`}
      >
        {mobileListLayout ? null : listPane}
        <div ref={detailRegionRef} className="automation-detail-region">
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
          mobile={mobileListLayout}
        />
        </div>
        {mobileListLayout ? (
          <MobileSwipeDrawer
            ref={listDrawerRef}
            side="left"
            open={mobileListOpen}
            onClose={closeMobileList}
            ariaLabel={t("automationHistory.mobile.listTitle")}
            className="automation-mobile-list-drawer"
            fullWidth
          >
            {listPane}
          </MobileSwipeDrawer>
        ) : null}
        <AutomationEditorDrawer
          open={editorOpen}
          automationId={editorAutomationId}
          currentWorker={currentWorker}
          agents={effectiveAgents}

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

          refreshRevision={runtime.viewerRefreshRevision}
          returnFocusRef={runtime.viewerTriggerRef}
          onClose={runtime.closeViewer}
          mobile={mobileListLayout}
        />
      </div>
    </>
  );
}
