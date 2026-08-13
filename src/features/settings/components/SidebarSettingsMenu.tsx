import React from "react";
import type {
  ThemeMode,
  WsConnectionStatus,
} from "@/app/state/types";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { isMemoryEnabled } from "@/shared/config/featureFlags";

export interface SettingsSummaryBadge {
  key: "transport" | "theme";
  icon: MaterialIconName;
  label: string;
  title: string;
}

export type SidebarSettingsMenuAction =
  | { type: "open-skills" }
  | { type: "open-settings" }
  | { type: "open-registries" }
  | { type: "open-mcp-servers" }
  | { type: "open-archive" }
  | { type: "open-memory-info" }
  | { type: "noop" };

export interface SidebarSettingsMenuItem {
  key: string;
  label: string;
  description?: string;
  title?: string;
  icon?: MaterialIconName;
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
  themeMode: ThemeMode;
  wsStatus: WsConnectionStatus;
  wsErrorMessage?: string;
}): SettingsSummaryBadge[] {
  const transportLabel = "WS";
  const wsDetail = String(input.wsErrorMessage || "").trim();
  const transportTitle = wsDetail
    ? t("settingsMenu.summary.transport.wsError", { detail: wsDetail })
    : input.wsStatus === "connecting"
      ? t("settingsMenu.summary.transport.wsConnecting")
      : input.wsStatus === "connected"
        ? t("settingsMenu.summary.transport.wsConnected")
        : t("settingsMenu.summary.transport.ws");

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

export function buildSidebarSettingsMenuSections(_input: {
  wsStatus?: WsConnectionStatus;
  wsErrorMessage?: string;
}): SidebarSettingsMenuSection[] {
  return [
    {
      key: "entry",
      title: t("settingsMenu.section.entry"),
      items: [
        {
          key: "open-skills",
          label: t("settingsMenu.skills"),
          icon: "skills",
          action: { type: "open-skills" },
        },
        {
          key: "open-mcp-servers",
          label: t("settingsMenu.mcpServers"),
          icon: "hub",
          action: { type: "open-mcp-servers" },
        },
        {
          key: "open-registries",
          label: t("settingsMenu.registries"),
          icon: "hub",
          action: { type: "open-registries" },
        },
        {
          key: "open-archive",
          label: t("settingsMenu.archive"),
          icon: "inventory_2",
          action: { type: "open-archive" },
        },
        {
          key: "open-settings",
          label: t("settingsMenu.openSettings"),
          icon: "settings",
          action: { type: "open-settings" },
        },
        ...(isMemoryEnabled()
          ? [
              {
                key: "open-memory-info",
                label: t("settingsMenu.memoryInfo"),
                icon: "database" as const,
                action: { type: "open-memory-info" as const },
              },
            ]
          : []),
      ],
    }
  ];
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
                className={`sidebar-settings-item ui-icon-hover-24 ${item.active ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
                title={item.title || item.label}
                disabled={item.disabled}
                aria-pressed={item.active}
                onClick={() => onAction(item.action)}
              >
                <span className="sidebar-settings-item-content">
                  <span className="sidebar-settings-item-head">
                    {item.icon ? (
                      <MaterialIcon
                        name={item.icon}
                        className="sidebar-settings-item-icon ui-icon-hover-24-target"
                      />
                    ) : null}
                    <span className="sidebar-settings-item-label">
                      {item.label}
                    </span>
                    {item.active ? (
                      <span className="sidebar-settings-item-badge">{t("settingsMenu.status.current")}</span>
                    ) : null}
                  </span>
                </span>
              </UiButton>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
