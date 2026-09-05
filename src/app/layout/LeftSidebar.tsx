import React from "react";
import { useAppContext } from "@/app/state/AppContext";
import {
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
  type SidebarSettingsMenuAction,
} from "@/app/layout/sidebar/SidebarSettingsMenu";
import { useCommandOverlayActions } from "@/features/command-center/components/CommandOverlayProvider";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import { WorkerNavigator } from "@/features/workers/components/WorkerNavigator";
import { useMemoryOverlayActions } from "@/features/memory/components/MemoryOverlayProvider";

export {
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
} from "@/features/agents/lib/agentCreate";
export { handleCreateAgentSuccess } from "@/features/workers/lib/agentProjectCreated";

export const LeftSidebar: React.FC = () => {
  const { state } = useAppContext();
  const { openCommandOverlay } = useCommandOverlayActions();
  const { openOverlay } = useSettingsOverlayActions();
  const { openMemory } = useMemoryOverlayActions();
  const settingsSummaryBadges = React.useMemo(
    () => resolveSettingsSummaryBadges({ themeMode: state.themeMode }),
    [state.themeMode],
  );
  const handleSettingsMenuAction = React.useCallback(
    (action: SidebarSettingsMenuAction) => {
      let standaloneRoute = "";
      if (action.type === "open-skills") standaloneRoute = "/skills";
      if (action.type === "open-registries") standaloneRoute = "/registries";
      if (action.type === "open-mcp-servers") standaloneRoute = "/mcp-servers";
      if (action.type === "open-archive") standaloneRoute = "/archives";
      if (standaloneRoute) {
        window.open(
          `${standaloneRoute}${window.location.search || ""}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (action.type === "open-settings") openOverlay("settings");
      if (action.type === "open-memory-info") openMemory();
    },
    [openMemory, openOverlay],
  );
  return (
    <WorkerNavigator
      onOpenCommand={(type) => openCommandOverlay({ type })}
      onOpenMemory={openMemory}
      renderSettingsMenu={(close) => (
        <SidebarSettingsMenu
          onAction={(action) => {
            handleSettingsMenuAction(action);
            close();
          }}
        />
      )}
      settingsSummary={(
        <span className="settings-trigger-summary">
          {settingsSummaryBadges.map((badge) => (
            <span
              key={badge.key}
              className="settings-summary-chip"
              title={badge.title}
            >
              <span className="material-icon settings-summary-chip-icon">
                {badge.icon}
              </span>
              <span>{badge.label}</span>
            </span>
          ))}
        </span>
      )}
    />
  );
};
