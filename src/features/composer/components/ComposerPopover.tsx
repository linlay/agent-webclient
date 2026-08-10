import React from "react";
import { Popover } from "antd";

export interface ComposerPanel {
  open: boolean;
  destroyOnHidden?: boolean;
  content: React.ReactNode;
}

interface ComposerPopoverProps {
  children: React.ReactElement;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  width?: number;
  /** 按优先级排列，取第一个 open 的 panel 渲染 */
  panels: ComposerPanel[];
}

export const ComposerPopover: React.FC<ComposerPopoverProps> = ({
  children,
  getPopupContainer,
  width,
  panels,
}) => {
  const activePanel = panels.find((p) => p.open);

  return (
    <Popover
      open={!!activePanel}
      placement="topLeft"
      arrow={false}
      autoAdjustOverflow
      classNames={{ root: "composer-popover-overlay" }}
      destroyOnHidden={activePanel?.destroyOnHidden ?? false}
      styles={{
        root: {
          width,
          maxWidth: "calc(100vw - 24px)",
          zIndex: 1200,
        },
      }}
      getPopupContainer={getPopupContainer}
      content={activePanel?.content ?? null}
    >
      {children}
    </Popover>
  );
};
