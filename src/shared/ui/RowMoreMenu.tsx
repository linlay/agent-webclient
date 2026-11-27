import React, { useState } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import styles from "./RowMoreMenu.module.css";

export interface RowMoreMenuProps {
  /** 更多按钮与右键菜单共用同一份菜单项 */
  items: MenuProps["items"];
  onSelect: MenuProps["onClick"];
  /** 触发按钮的 title 与默认无障碍名称 */
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** 行容器额外 class，用于各列表自己的定位与 hover 底色 */
  className?: string;
  /** 行容器属性（role、tabIndex、onClick、onKeyDown 等） */
  rowProps?: React.HTMLAttributes<HTMLDivElement>;
  /** 需要把行容器作为拖拽节点时传入 */
  rowRef?: React.Ref<HTMLDivElement>;
  rowStyle?: React.CSSProperties;
  /**
   * 触屏/移动端由调用方接管菜单展示（例如改用 BottomSheet）。
   * 传入后不再渲染 Dropdown，按钮点击只回调，右键菜单也不出现。
   */
  onMoreClick?: () => void;
  children: React.ReactNode;
}

/**
 * 列表行右侧的「更多操作」。
 * 交互与 Agent 管理台列表一致：hover / 键盘聚焦时浮现 mini 幽灵按钮，
 * 点击按钮或右键行内任意位置打开同一份菜单（右键定位在指针处，且不改变选中项）；
 * 按钮绝对定位叠加在行右端，不占用布局，被覆盖内容的让位交给各列表自己的样式。
 */
export const RowMoreMenu: React.FC<RowMoreMenuProps> = ({
  items,
  onSelect,
  label,
  ariaLabel,
  disabled = false,
  className = "",
  rowProps,
  rowRef,
  rowStyle,
  onMoreClick,
  children,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActions = Array.isArray(items) && items.length > 0;
  const menu: MenuProps = { items, onClick: onSelect };
  const moreButton = hasActions ? (
    <UiButton
      size="mini"
      variant="ghost"
      iconOnly
      className={styles.button}
      disabled={disabled}
      title={label}
      aria-label={ariaLabel ?? label}
      aria-haspopup={onMoreClick ? "dialog" : "menu"}
      onClick={(event) => {
        event.stopPropagation();
        onMoreClick?.();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <MaterialIcon name="more_horiz" />
    </UiButton>
  ) : null;
  if (onMoreClick) {
    return (
      <div
        {...rowProps}
        ref={rowRef}
        style={rowStyle}
        className={`${styles.row} ${className}`.trim()}
        data-has-actions={hasActions ? "" : undefined}
      >
        {children}
        {moreButton}
      </div>
    );
  }
  return (
    <Dropdown
      trigger={["contextMenu"]}
      disabled={disabled || !hasActions}
      onOpenChange={setMenuOpen}
      menu={menu}
    >
      <div
        {...rowProps}
        ref={rowRef}
        style={rowStyle}
        className={`${styles.row} ${className}`.trim()}
        data-menu-open={menuOpen || undefined}
        data-has-actions={hasActions ? "" : undefined}
      >
        {children}
        {moreButton ? (
          <Dropdown
            trigger={["click"]}
            disabled={disabled}
            onOpenChange={setMenuOpen}
            menu={menu}
          >
            {moreButton}
          </Dropdown>
        ) : null}
      </div>
    </Dropdown>
  );
};
