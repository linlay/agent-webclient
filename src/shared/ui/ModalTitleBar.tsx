import React from "react";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

/**
 * CommandModal / CommandDrawer 内嵌控制台（HistoryModal、AutomationHistoryConsole、AgentConsole）
 * 的标题栏。默认在标题右侧渲染 esc 关闭按钮；Drawer 场景（variant="drawer"）在左侧
 * 渲染收起箭头，点击均调用 onClose。
 */
export const ModalTitleBar: React.FC<{
  title?: React.ReactNode;
  onClose: () => void;
  variant?: "default" | "drawer";
  className?: string;
  children?: React.ReactNode;
}> = ({ title, onClose, variant = "default", className = "", children }) => {
  const { t } = useI18n();
  const isDrawer = variant === "drawer";

  return (
    <div
      className={`command-modal-title modal-title-bar ${isDrawer ? "modal-title-bar-drawer" : ""} ${className}`.trim()}
    >
      {isDrawer ? (
        <UiButton
          className="modal-title-bar-collapse ui-icon-hover-24"
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={t("modalTitleBar.collapse")}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <MaterialIcon name="keyboard_arrow_right" />
        </UiButton>
      ) : null}
      {title ? <span className="modal-title-bar-title">{title}</span> : null}
      {children}
      {!isDrawer ? (
        <UiButton
          className="ui-icon-hover-24"
          size="sm"
          variant="ghost"
          iconOnly
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <MaterialIcon name="close" />
        </UiButton>
      ) : null}
    </div>
  );
};
