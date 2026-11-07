import React from "react";
import { isPlatformBackendMode } from "@/shared/config/backendMode";
import "./SidebarSettingsMenu.module.css";
import type { ThemeMode } from "@/shared/styles/theme";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { isDesktopAppMode } from "@/shared/utils/routing";

export interface SettingsSummaryBadge {
  key: "theme";
  icon: MaterialIconName;
  title: string;
}

export type SidebarSettingsMenuAction =
  | { type: "open-mailbox" }
  | { type: "open-agents" }
  | { type: "open-skills" }
  | { type: "open-settings" }
  | { type: "open-registries" }
  | { type: "open-connectors" }
  | { type: "open-webapps" }
  | { type: "open-archive" }
  | { type: "noop" };

export interface SidebarSettingsMenuItem {
  key: string;
  label: string;
  description?: string;
  title?: string;
  icon?: MaterialIconName;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  action: SidebarSettingsMenuAction;
}

export interface SidebarSettingsMenuSection {
  key: string;
  title: string;
  items: SidebarSettingsMenuItem[];
}

export interface SidebarSettingsMenuProps {
  pendingMailCount?: number;
  onAction: (action: SidebarSettingsMenuAction) => void;
}

export function resolveSettingsSummaryBadges(input: {
  themeMode: ThemeMode;
}): SettingsSummaryBadge[] {
  return [
    {
      key: "theme",
      icon: input.themeMode === "dark" ? "dark_mode" : "light_mode",
      title:
        input.themeMode === "dark"
          ? t("settingsMenu.summary.theme.darkTitle")
          : t("settingsMenu.summary.theme.lightTitle"),
    },
  ];
}

export function buildSidebarSettingsMenuSections(pendingMailCount = 0): SidebarSettingsMenuSection[] {
  return [
    {
      key: "entry",
      title: t("settingsMenu.section.entry"),
      items: [
        ...(isPlatformBackendMode() && !isDesktopAppMode() ? [{ key: "open-webapps", label: t("webapps.title"), icon: "inventory_2" as const, action: { type: "open-webapps" as const } }] : []),
        {
          key: "open-agents",
          label: t("leftSidebar.quickActions.agents"),
          icon: "agent_type",
          action: { type: "open-agents" },
        },
        {
          key: "open-skills",
          label: t("settingsMenu.skills"),
          icon: "bolt",
          action: { type: "open-skills" },
        },
        {
          key: "open-connectors",
          label: t("settingsMenu.connectors"),
          icon: "power_2",
          action: { type: "open-connectors" },
        },
        {
          key: "open-registries",
          label: t("settingsMenu.registries"),
          icon: "tune",
          action: { type: "open-registries" },
        },
        {
          key: "open-mailbox",
          label: t("mailbox.title"),
          icon: "draft",
          badge: pendingMailCount > 0 ? pendingMailCount > 99 ? "99+" : String(pendingMailCount) : undefined,
          action: { type: "open-mailbox" },
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
      ],
    }
  ];
}

export const SidebarSettingsMenu: React.FC<SidebarSettingsMenuProps> = ({
  onAction, pendingMailCount = 0,
}) => {
  const sections = React.useMemo(
    () => buildSidebarSettingsMenuSections(pendingMailCount),
    [pendingMailCount],
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
                    {item.active || item.badge ? (
                      <span className="sidebar-settings-item-badge">{item.badge || t("settingsMenu.status.current")}</span>
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
