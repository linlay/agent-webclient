import React, { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { ShellOverlays } from "@/app/layout/ShellOverlays";
import { SettingsOverlayProvider } from "@/features/settings/components/SettingsOverlayProvider";
import { CommandOverlayProvider } from "@/features/workers/components/CommandOverlayProvider";
import { GlobalSearchOverlayProvider } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { TerminalDock, resolveTerminalDockWorkspaceKey } from "./TerminalDock";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { GlobalShortcutLayer } from "@/features/workers/hooks/useGlobalShortcuts";

const APP_SHELL_BASE_CLASS =
  "app-shell layout-desktop-fixed tw:grid tw:h-screen tw:overflow-hidden tw:bg-bg-base tw:[&_.bottom-dock]:col-start-2 tw:[&_.bottom-dock]:row-start-3 tw:[&_.conversation-stage]:col-start-2 tw:[&_.conversation-stage]:row-start-2 tw:[&_.drawer-close]:hidden tw:[&_.left-sidebar]:col-start-1 tw:[&_.left-sidebar]:row-[1/-1] tw:[&_.left-sidebar]:min-w-0 tw:[&_.right-sidebar]:relative tw:[&_.right-sidebar]:col-start-3 tw:[&_.right-sidebar]:row-[1/-1] tw:[&_.right-sidebar]:translate-x-0 tw:[&_.terminal-dock]:col-start-2 tw:[&_.terminal-dock]:row-start-4";
const APP_SHELL_ROW_CLASS_BY_STATE = {
  default: "tw:grid-rows-[auto_minmax(0,1fr)_auto]",
  terminal: "tw:grid-rows-[auto_minmax(0,1fr)_auto_auto]",
  empty:
    "timeline-empty-layout tw:grid-rows-[auto_minmax(0,2fr)_minmax(0,3fr)_auto]",
  emptyTerminal:
    "timeline-empty-layout tw:grid-rows-[auto_minmax(0,2fr)_minmax(0,3fr)_auto]",
} as const;
const APP_SHELL_COLUMN_CLASS_BY_STATE = {
  closedDebug:
    "left-drawer-closed desktop-debug-enabled tw:grid-cols-[var(--left-sidebar-close-width)_minmax(0,1fr)_var(--right-sidebar-width)]",
  openDebug:
    "left-drawer-open desktop-debug-enabled tw:grid-cols-[var(--left-sidebar-width)_minmax(0,1fr)_var(--right-sidebar-width)] tw:[&_.left-sidebar]:w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:min-w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:pointer-events-auto",
  closedNoDebug:
    "left-drawer-closed desktop-debug-disabled tw:grid-cols-[var(--left-sidebar-close-width)_minmax(0,1fr)_0] tw:[&_.right-sidebar]:w-0 tw:[&_.right-sidebar]:min-w-0 tw:[&_.right-sidebar]:translate-x-full tw:[&_.right-sidebar]:border-l-0 tw:[&_.right-sidebar]:pointer-events-none",
  openNoDebug:
    "left-drawer-open desktop-debug-disabled tw:grid-cols-[var(--left-sidebar-width)_minmax(0,1fr)_0] tw:[&_.left-sidebar]:w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:min-w-[var(--left-sidebar-width)] tw:[&_.left-sidebar]:pointer-events-auto tw:[&_.right-sidebar]:w-0 tw:[&_.right-sidebar]:min-w-0 tw:[&_.right-sidebar]:translate-x-full tw:[&_.right-sidebar]:border-l-0 tw:[&_.right-sidebar]:pointer-events-none",
} as const;

export const AppShell: React.FC = () => {
  const state = useAppState();

  /* Initialize business logic hooks */
  useAppRuntimes();

  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const desktopRightSidebarVisible = state.rightSidebarOpen;

  const rowClass = !state.chatId
    ? state.terminalDockOpen
      ? APP_SHELL_ROW_CLASS_BY_STATE.emptyTerminal
      : APP_SHELL_ROW_CLASS_BY_STATE.empty
    : state.terminalDockOpen
      ? APP_SHELL_ROW_CLASS_BY_STATE.terminal
      : APP_SHELL_ROW_CLASS_BY_STATE.default;
  const columnClass = desktopRightSidebarVisible
    ? state.leftDrawerOpen
      ? APP_SHELL_COLUMN_CLASS_BY_STATE.openDebug
      : APP_SHELL_COLUMN_CLASS_BY_STATE.closedDebug
    : state.leftDrawerOpen
      ? APP_SHELL_COLUMN_CLASS_BY_STATE.openNoDebug
      : APP_SHELL_COLUMN_CLASS_BY_STATE.closedNoDebug;

  return (
    <SettingsOverlayProvider>
      <CommandOverlayProvider>
        <GlobalSearchOverlayProvider>
          <GlobalShortcutLayer />
          <div
            className={[
              APP_SHELL_BASE_CLASS,
              columnClass,
              rowClass,
              state.terminalDockOpen ? "terminal-dock-open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            id="app"
          >
            <TopNav />
            <LeftSidebar />
            <ConversationStage />
            <RightSidebar />
            <BottomDock />
            {state.terminalDockOpen && currentWorker?.type === "agent" ? (
              <TerminalDock
                agentKey={currentWorker.sourceId}
                workspaceKey={resolveTerminalDockWorkspaceKey(currentWorker)}
                worker={currentWorker}
              />
            ) : null}
            <ShellOverlays />
          </div>
        </GlobalSearchOverlayProvider>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
  );
};
