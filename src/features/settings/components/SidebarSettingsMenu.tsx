import React from "react";
import type { AppAction } from "@/app/state/actions";
import type {
  ThemeMode,
  TransportMode,
  WsConnectionStatus,
} from "@/app/state/types";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

export interface SettingsSummaryBadge {
  key: "transport" | "theme";
  icon: string;
  label: string;
  title: string;
}

export type SidebarSettingsMenuAction =
  | { type: "open-settings" }
  | { type: "open-memory-info" }
  | { type: "noop" };

export interface SidebarSettingsMenuItem {
  key: string;
  label: string;
  description?: string;
  title?: string;
  icon?: string;
  active?: boolean;
  disabled?: boolean;
  action: SidebarSettingsMenuAction;
}

export interface SidebarSettingsMenuSection {
  key: string;
  title: string;
  items: SidebarSettingsMenuItem[];
}

export interface SidebarSettingsMenuProps {
  wsStatus?: WsConnectionStatus;
  wsErrorMessage?: string;
  onAction: (action: SidebarSettingsMenuAction) => void;
}

export function resolveSettingsSummaryBadges(input: {
  transportMode: TransportMode;
  themeMode: ThemeMode;
  wsStatus: WsConnectionStatus;
  wsErrorMessage?: string;
}): SettingsSummaryBadge[] {
  const transportLabel = input.transportMode === "ws" ? "WS" : "SSE";
  const wsDetail = String(input.wsErrorMessage || "").trim();
  const transportTitle =
    input.transportMode === "ws"
      ? wsDetail
        ? t("settingsMenu.summary.transport.wsError", { detail: wsDetail })
        : input.wsStatus === "connecting"
          ? t("settingsMenu.summary.transport.wsConnecting")
          : input.wsStatus === "connected"
            ? t("settingsMenu.summary.transport.wsConnected")
            : t("settingsMenu.summary.transport.ws")
      : t("settingsMenu.summary.transport.sse");

  return [
    {
      key: "transport",
      icon: "swap_horiz",
      label: transportLabel,
      title: transportTitle,
    },
    {
      key: "theme",
      icon: input.themeMode === "dark" ? "dark_mode" : "light_mode",
      label:
        input.themeMode === "dark"
          ? t("settingsMenu.summary.theme.darkLabel")
          : t("settingsMenu.summary.theme.lightLabel"),
      title:
        input.themeMode === "dark"
          ? t("settingsMenu.summary.theme.darkTitle")
          : t("settingsMenu.summary.theme.lightTitle"),
    },
  ];
}

export function buildSidebarSettingsMenuSections(input: {
  wsStatus?: WsConnectionStatus;
  wsErrorMessage?: string;
}): SidebarSettingsMenuSection[] {
  const detail = String(input.wsErrorMessage || "").trim();
  const wsDescription =
    input.wsStatus === "connecting"
      ? t("settingsMenu.ws.connecting")
      : input.wsStatus === "connected"
        ? t("settingsMenu.ws.connected")
        : detail
          ? t("settingsMenu.ws.error", { detail })
          : t("settingsMenu.ws.default");

  return [
    {
      key: "entry",
      title: t("settingsMenu.section.entry"),
      items: [
        {
          key: "open-settings",
          label: t("settingsMenu.openSettings"),
          description: wsDescription,
          icon: "tune",
          action: { type: "open-settings" },
        },
        {
          key: "open-memory-info",
          label: t("settingsMenu.memoryInfo"),
          description: t("settingsMenu.memoryInfoDescription"),
          icon: "database",
          action: { type: "open-memory-info" },
        },
      ],
    },
    {
      key: "reserved",
      title: t("settingsMenu.section.reserved"),
      items: [
        {
          key: "reserved-connection",
          label: t("settingsMenu.reserved.connection"),
          description: t("settingsMenu.reserved.description"),
          icon: "sync_alt",
          disabled: true,
          action: { type: "noop" },
        },
        {
          key: "reserved-appearance",
          label: t("settingsMenu.reserved.appearance"),
          description: t("settingsMenu.reserved.description"),
          icon: "palette",
          disabled: true,
          action: { type: "noop" },
        },
        {
          key: "reserved-shortcuts",
          label: t("settingsMenu.reserved.shortcuts"),
          description: t("settingsMenu.reserved.description"),
          icon: "keyboard_command_key",
          disabled: true,
          action: { type: "noop" },
        },
      ],
    },
  ];
}

export function dispatchSidebarSettingsAction(
  action: SidebarSettingsMenuAction,
  dispatch: React.Dispatch<AppAction>,
): boolean {
  if (action.type === "open-settings") {
    dispatch({ type: "SET_SETTINGS_OPEN", open: true });
    return true;
  }
  if (action.type === "open-memory-info") {
    dispatch({ type: "SET_MEMORY_INFO_OPEN", open: true });
    return true;
  }
  return false;
}

export const SidebarSettingsMenu: React.FC<SidebarSettingsMenuProps> = ({
  wsStatus,
  wsErrorMessage,
  onAction,
}) => {
  const sections = React.useMemo(
    () => buildSidebarSettingsMenuSections({ wsStatus, wsErrorMessage }),
    [wsErrorMessage, wsStatus],
  );

  return (
    <div className="sidebar-settings-menu" role="menu" aria-label={t("settingsMenu.ariaLabel")}>
      {sections.map((section) => (
        <div className="sidebar-settings-section" key={section.key}>
          <div className="sidebar-settings-section-title">{section.title}</div>
          <div className="sidebar-settings-section-body">
            {section.items.map((item) => (
              <UiButton
                key={item.key}
                variant="ghost"
                size="sm"
                className={`sidebar-settings-item ${item.active ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
                title={item.title || item.description || item.label}
                disabled={item.disabled}
                aria-pressed={item.active}
                onClick={() => onAction(item.action)}
              >
                <span className="sidebar-settings-item-content">
                  <span className="sidebar-settings-item-head">
                    {item.icon ? (
                      <MaterialIcon
                        name={item.icon}
                        className="sidebar-settings-item-icon"
                      />
                    ) : null}
                    <span className="sidebar-settings-item-label">
                      {item.label}
                    </span>
                    {item.active ? (
                      <span className="sidebar-settings-item-badge">{t("settingsMenu.status.current")}</span>
                    ) : null}
                  </span>
                  {item.description ? (
                    <span className="sidebar-settings-item-description">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </UiButton>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
