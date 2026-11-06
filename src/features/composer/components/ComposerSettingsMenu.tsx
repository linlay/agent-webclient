import React from "react";
import { Dropdown, type MenuProps } from "antd";
import { UiButton, type UiButtonProps } from "@/shared/ui/UiButton";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import modelPresentation from "@/features/model-config/components/ModelMenu.module.css";

const presentationClasses = bindCssModuleClasses({ ...modelPresentation });
const QUERY_SETTINGS_BUTTON_CLASS =
  "query-settings-btn tw:!min-h-8 tw:!rounded-lg tw:!px-2 tw:!text-[13px] tw:text-text-muted tw:[&_.material-icon]:flex-none tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:min-w-0 tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1 tw:[&_.ui-btn-label>span:not(.material-icon)]:min-w-0 tw:[&_.ui-btn-label>span:not(.material-icon)]:overflow-hidden tw:[&_.ui-btn-label>span:not(.material-icon)]:text-ellipsis tw:[&_.ui-btn-label>span:not(.material-icon)]:whitespace-nowrap";
const QUERY_SETTINGS_ICON_BUTTON_CLASS =
  "query-settings-btn tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:flex-none tw:!rounded-lg tw:!p-0 tw:text-text-muted tw:[&_.material-icon]:text-xl";

// Shared presentation only: callers own option semantics and persistence.
export function ComposerSettingsMenu({ menu, label, title, icon, compact = false, disabled = false, showIcon = false, onOpenChange, buttonProps = {} }: {
  menu: MenuProps;
  label: React.ReactNode;
  title: string;
  icon: MaterialIconName;
  compact?: boolean;
  disabled?: boolean;
  showIcon?: boolean;
  onOpenChange?: (open: boolean) => void;
  buttonProps?: UiButtonProps;
}) {
  const { className = "", ...rest } = buttonProps;
  return <Dropdown disabled={disabled} menu={{ ...menu, className: presentationClasses("query-settings-menu") }}
    onOpenChange={onOpenChange} placement="topRight" trigger={["click"]}>
    <UiButton variant="ghost" size="sm" iconOnly={compact} disabled={disabled}
      title={title} aria-label={title}
      onClick={event => event.preventDefault()}
      {...rest}
      className={`${compact ? QUERY_SETTINGS_ICON_BUTTON_CLASS : QUERY_SETTINGS_BUTTON_CLASS} ${showIcon ? "ui-icon-hover-24" : ""} ${className}`.trim()}>
      {(compact || showIcon) && <MaterialIcon name={icon} className={compact ? undefined : "ui-icon-hover-24-target"} />}
      {!compact && <>{label}<MaterialIcon name="expand_more" /></>}
    </UiButton>
  </Dropdown>;
}
