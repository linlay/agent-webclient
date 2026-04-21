import React from "react";
import type { AppAction } from "@/app/state/actions";
import type {
  ThemeMode,
  TransportMode,
  WsConnectionStatus,
} from "@/app/state/types";
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
        ? `当前传输模式：WebSocket（连接异常：${wsDetail}）`
        : input.wsStatus === "connecting"
          ? "当前传输模式：WebSocket（连接中）"
          : input.wsStatus === "connected"
            ? "当前传输模式：WebSocket（连接已就绪）"
            : "当前传输模式：WebSocket"
      : "当前传输模式：SSE";

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
      label: input.themeMode === "dark" ? "夜" : "日",
      title:
        input.themeMode === "dark" ? "当前界面：夜间模式" : "当前界面：日间模式",
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
      ? "当前连接状态：WebSocket 连接中。"
      : input.wsStatus === "connected"
        ? "当前连接状态：WebSocket 已就绪。"
        : detail
          ? `当前连接状态：${detail}`
          : "进入完整设置对话框查看连接与主题详情。";

  return [
    {
      key: "entry",
      title: "设置",
      items: [
        {
          key: "open-settings",
          label: "打开设置...",
          description: wsDescription,
          icon: "tune",
          action: { type: "open-settings" },
        },
      ],
    },
    {
      key: "reserved",
      title: "预留",
      items: [
        {
          key: "reserved-connection",
          label: "连接设置（即将开放）",
          description: "预留菜单入口，后续补充。",
          icon: "sync_alt",
          disabled: true,
          action: { type: "noop" },
        },
        {
          key: "reserved-appearance",
          label: "外观偏好（即将开放）",
          description: "预留菜单入口，后续补充。",
          icon: "palette",
          disabled: true,
          action: { type: "noop" },
        },
        {
          key: "reserved-shortcuts",
          label: "快捷键（即将开放）",
          description: "预留菜单入口，后续补充。",
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
    <div className="sidebar-settings-menu" role="menu" aria-label="设置菜单">
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
                      <span className="sidebar-settings-item-badge">当前</span>
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
