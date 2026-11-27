import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { MaterialIcon, type MaterialIconName } from "@/shared/icons/material";
import styles from "./MobilePageHeaderAction.module.css";

/** 页面需要在移动壳层标题栏右侧暴露的动作（例如“切换智能体”）。 */
export interface MobilePageHeaderAction {
  /** 主文案，例如当前智能体名称。 */
  label: string;
  /** 读屏名称；省略时使用可见 label。 */
  ariaLabel?: string;
  /** 主文案前的身份图标（通常是 Agent 头像）。 */
  avatar?: React.ReactNode;
  /** 尾部动作文案，例如「切换」；与 icon 一起渲染。 */
  actionLabel?: string;
  icon?: MaterialIconName;
  /** 是否对应一个已展开的面板，映射到按钮的 aria-expanded。 */
  expanded?: boolean;
  onActivate: () => void;
}

const SetterContext = createContext<((action: MobilePageHeaderAction | null) => void) | null>(null);
const ActionContext = createContext<MobilePageHeaderAction | null>(null);

/**
 * 管理页的页面抽屉由 MobileLayout 渲染，页面内容在 <Outlet/> 里。
 * 页面通过 hook 注册标题栏动作，壳层在 Drawer 的 extra 槽位渲染，
 * 不需要页面反向导入 app/layout。
 */
export function MobilePageHeaderActionProvider({ children }: { children: React.ReactNode }) {
  const [action, setAction] = useState<MobilePageHeaderAction | null>(null);
  const setter = useCallback((next: MobilePageHeaderAction | null) => setAction(next), []);
  return (
    <SetterContext.Provider value={setter}>
      <ActionContext.Provider value={action}>{children}</ActionContext.Provider>
    </SetterContext.Provider>
  );
}

/** 页面里调用；传 null 表示当前页面不提供标题栏动作。 */
export function useMobilePageHeaderAction(action: MobilePageHeaderAction | null) {
  const setAction = useContext(SetterContext);
  const label = action?.label;
  const ariaLabel = action?.ariaLabel;
  const avatar = action?.avatar;
  const actionLabel = action?.actionLabel;
  const icon = action?.icon;
  const expanded = action?.expanded;
  const onActivate = action?.onActivate;

  useEffect(() => {
    if (!setAction) return;
    setAction(
      label
        ? {
            label,
            ariaLabel,
            avatar,
            actionLabel,
            icon,
            expanded,
            onActivate: onActivate as () => void,
          }
        : null,
    );
  }, [setAction, label, ariaLabel, avatar, actionLabel, icon, expanded, onActivate]);

  // 页面卸载时清空，避免动作留在下一个页面标题栏。
  useEffect(() => {
    if (!setAction) return;
    return () => setAction(null);
  }, [setAction]);
}

/** 由 MobileLayout 放进页面 Drawer 的 extra 槽位。 */
export function MobilePageHeaderActionSlot() {
  const action = useContext(ActionContext);
  if (!action) return null;
  return (
    <button
      type="button"
      className={styles.action}
      aria-haspopup="dialog"
      aria-expanded={action.expanded}
      aria-label={action.ariaLabel || action.label}
      onClick={action.onActivate}
    >
      {action.avatar ? <span className={styles.avatar}>{action.avatar}</span> : null}
      <span className={styles.label}>{action.label}</span>
      {action.actionLabel ? (
        <span className={styles.trailing}>
          {action.icon ? <MaterialIcon className={styles.icon} name={action.icon} /> : null}
          <span className={styles.trailingLabel}>{action.actionLabel}</span>
        </span>
      ) : action.icon ? (
        <MaterialIcon className={styles.icon} name={action.icon} />
      ) : null}
    </button>
  );
}
