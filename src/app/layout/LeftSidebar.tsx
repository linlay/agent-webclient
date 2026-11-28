import React from "react";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { useAppContext } from "@/app/state/AppContext";
import {
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
  type SidebarSettingsMenuAction,
} from "@/app/layout/sidebar/SidebarSettingsMenu";
import { useCommandOverlayActions } from "@/features/command-center/components/CommandOverlayProvider";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import { useMemoryOverlayActions } from "@/features/memory/components/MemoryOverlayProvider";
import { WorkerNavigator } from "@/features/workers/components/WorkerNavigator";
import { useGlobalSearchActions } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useClientPageNavigation } from "@/shared/ui/ClientNavigationContext";

export {
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
} from "@/features/agents/lib/agentCreate";
export { handleCreateAgentSuccess } from "@/features/workers/lib/agentProjectCreated";

export interface LeftSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  /** 移动端：从设置菜单打开了独立页面，壳层据此在页面关闭后恢复设置菜单。 */
  onSettingsPageOpen?: () => void;
  /** 移动端：壳层要求重新打开设置菜单时递增这个序号。 */
  settingsMenuReopenToken?: number;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  mobile = false,
  onClose,
  onSettingsPageOpen,
  settingsMenuReopenToken,
}) => {
  const navigatePage = useClientPageNavigation();
  const openTarget = useOpenTarget();
  const { state } = useAppContext();
  const { openCommandOverlay } = useCommandOverlayActions();
  const { openMemory } = useMemoryOverlayActions();
  const { openOverlay } = useSettingsOverlayActions();
  const { openGlobalSearch } = useGlobalSearchActions();
  const settingsSummaryBadges = React.useMemo(
    () => resolveSettingsSummaryBadges({ themeMode: state.themeMode }),
    [state.themeMode],
  );
  const handleSettingsMenuAction = React.useCallback(
    (action: SidebarSettingsMenuAction) => {
      let standaloneRoute = "";
      if (action.type === "open-agents") standaloneRoute = "/agents";
      if (action.type === "open-skills") standaloneRoute = "/skills";
      if (action.type === "open-registries") standaloneRoute = "/registries";
      if (action.type === "open-connectors") standaloneRoute = "/connectors";
      if (action.type === "open-archive") standaloneRoute = "/archives";
      if (standaloneRoute) {
        if (navigatePage) {
          // 记下这个页面是从设置菜单打开的，页面抽屉关闭后可以回到菜单。
          onSettingsPageOpen?.();
          onClose?.();
          navigatePage(standaloneRoute);
          return;
        }
        window.open(
          `${standaloneRoute}${window.location.search || ""}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (action.type === "open-settings") openOverlay("settings");
    },
    [openOverlay, navigatePage, onClose, onSettingsPageOpen],
  );
  return (
    <>
    <WorkerNavigator
      mobile={mobile} onClose={onClose}
      settingsMenuReopenToken={settingsMenuReopenToken}
      onOpenProject={(agentKey) => { onClose?.(); openTarget({ version: 1, kind: "project", agentKey }); }}
      onOpenSearch={() => { onClose?.(); openGlobalSearch(); }}
      onOpenCommand={(type) => { onClose?.(); openCommandOverlay({ type }); }}
      onOpenMemory={() => { onClose?.(); openMemory(); }}
      renderSettingsMenu={(close) => (
        <SidebarSettingsMenu
          onAction={(action) => {
            handleSettingsMenuAction(action);
            onClose?.();
            close();
          }}
        />
      )}
      settingsSummary={
        <span className="settings-trigger-summary">
          {settingsSummaryBadges.map((badge) => (
            <span
              key={badge.key}
              className="settings-summary-chip"
              title={badge.title}
              role="img"
              aria-label={badge.title}
            >
              <MaterialIcon name={badge.icon} />
            </span>
          ))}
        </span>
      }
    />
    </>
  );
};
