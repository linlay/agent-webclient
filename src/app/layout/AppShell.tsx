import { ConversationSurfaceProvider } from "@/features/conversation/components/ConversationSurfaceProvider";
import React, { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { ShellOverlays } from "@/app/layout/ShellOverlays";
import { SettingsOverlayProvider } from "@/features/settings/components/SettingsOverlayProvider";
import { MemoryOverlayProvider } from "@/features/memory/components/MemoryOverlayProvider";
import { CommandOverlayProvider } from "@/features/command-center/components/CommandOverlayProvider";
import { GlobalSearchOverlayProvider } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { useDeriveChatAction } from "@/features/conversation/hooks/useDeriveChatAction";
import { useRunFeedbackAction } from "@/features/conversation/hooks/useRunFeedbackAction";
import { TerminalDock, resolveTerminalDockWorkspaceKey } from "./TerminalDock";
import { resolveCurrentWorkerSummary, isCoderAgent } from "@/features/workers/lib/currentWorker";
import { GlobalShortcutLayer } from "@/features/shortcuts/components/GlobalShortcutLayer";

const APP_SHELL_BASE_CLASS =
  "app-shell layout-desktop-fixed tw:grid tw:h-screen tw:overflow-hidden tw:bg-[var(--shell-page-bg)] tw:grid-rows-[minmax(0,1fr)] tw:[&_.drawer-close]:hidden tw:[&_.left-sidebar]:col-start-1 tw:[&_.left-sidebar]:row-start-1 tw:[&_.left-sidebar]:min-w-0 tw:[&_.right-sidebar]:relative tw:[&_.right-sidebar]:col-start-3 tw:[&_.right-sidebar]:row-start-1 tw:[&_.right-sidebar]:translate-x-0 tw:[&_.app-shell-center]:col-start-2 tw:[&_.app-shell-center]:row-start-1";
const APP_SHELL_CENTER_CLASS =
  "app-shell-center tw:relative tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col";
const APP_SHELL_COLUMN_CLASS_BY_STATE = {
  closedDebug:
    "left-drawer-closed desktop-debug-enabled tw:grid-cols-[var(--left-sidebar-close-width)_minmax(420px,1fr)_var(--right-sidebar-width)]",
  openDebug:
    "left-drawer-open desktop-debug-enabled tw:grid-cols-[var(--left-sidebar-width)_minmax(420px,1fr)_var(--right-sidebar-width)] tw:[&_.left-sidebar]:w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:min-w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:pointer-events-auto",
  closedNoDebug:
    "left-drawer-closed desktop-debug-disabled tw:grid-cols-[var(--left-sidebar-close-width)_minmax(420px,1fr)_0] tw:[&_.right-sidebar]:w-0 tw:[&_.right-sidebar]:min-w-0 tw:[&_.right-sidebar]:translate-x-full tw:[&_.right-sidebar]:border-l-0 tw:[&_.right-sidebar]:pointer-events-none",
  openNoDebug:
    "left-drawer-open desktop-debug-disabled tw:grid-cols-[var(--left-sidebar-width)_minmax(420px,1fr)_0] tw:[&_.left-sidebar]:w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:min-w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:pointer-events-auto tw:[&_.right-sidebar]:w-0 tw:[&_.right-sidebar]:min-w-0 tw:[&_.right-sidebar]:translate-x-full tw:[&_.right-sidebar]:border-l-0 tw:[&_.right-sidebar]:pointer-events-none",
} as const;

export const AppShell: React.FC = () => (
  <ConversationSurfaceProvider><AppShellContent /></ConversationSurfaceProvider>
);

const AppShellContent: React.FC = () => {
  const state = useAppState();

  /* Initialize business logic hooks */
  useAppRuntimes();
  const deriveChatAction = useDeriveChatAction();
  const onFeedback = useRunFeedbackAction();

  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const effectiveTerminalDockOpen = state.terminalDockOpen && isCoderAgent(currentWorker);
  const desktopRightSidebarVisible = state.rightSidebarOpen;

  const emptyLayoutClass = !state.chatId ? "timeline-empty-layout" : "";
  const columnClass = desktopRightSidebarVisible
    ? state.leftDrawerOpen
      ? APP_SHELL_COLUMN_CLASS_BY_STATE.openDebug
      : APP_SHELL_COLUMN_CLASS_BY_STATE.closedDebug
    : state.leftDrawerOpen
      ? APP_SHELL_COLUMN_CLASS_BY_STATE.openNoDebug
      : APP_SHELL_COLUMN_CLASS_BY_STATE.closedNoDebug;

  return (
    <MemoryOverlayProvider>
    <SettingsOverlayProvider>
      <CommandOverlayProvider>
        <GlobalSearchOverlayProvider>
          <GlobalShortcutLayer />
          <div
            className={[
              APP_SHELL_BASE_CLASS,
              columnClass,
              emptyLayoutClass,
              effectiveTerminalDockOpen ? "terminal-dock-open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            id="app"
          >
            <LeftSidebar />
            <div className={APP_SHELL_CENTER_CLASS}>
              <TopNav />
              <ConversationStage
                surfaceMode="main"
                deriveChatAction={deriveChatAction}
                onFeedback={onFeedback}
              />
              <BottomDock />
              {effectiveTerminalDockOpen && currentWorker ? (
                <TerminalDock
                  agentKey={currentWorker.sourceId}
                  workspaceKey={resolveTerminalDockWorkspaceKey(currentWorker)}
                  worker={currentWorker}
                />
              ) : null}
            </div>
            <RightSidebar />
            <ShellOverlays />
          </div>
        </GlobalSearchOverlayProvider>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
    </MemoryOverlayProvider>
  );
};
