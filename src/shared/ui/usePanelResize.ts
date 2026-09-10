import React from "react";

export type PanelResizeAxis = "horizontal" | "vertical";

export type UsePanelResizeOptions = {
  /** 拖拽轴：horizontal 调整宽度，vertical 调整高度。 */
  axis: PanelResizeAxis;
  /** 为 true 时指针向坐标减小方向移动记为正增量（右侧栏、底部 dock 的手柄）。 */
  invert?: boolean;
  /** 拖拽开始时触发一次，可在此记录面板初始尺寸。 */
  onResizeStart?: () => void;
  /** 指针移动时触发；delta 为相对拖拽起点的增量，正值表示面板变大。 */
  onResize: (delta: number) => void;
  /** 拖拽结束（pointerup / pointercancel）时触发一次，delta 为最后一次移动的增量。 */
  onResizeEnd?: (delta: number) => void;
};

export type UsePanelResizeResult = {
  isResizing: boolean;
  handlePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
};

/**
 * 通用面板拖拽调整尺寸 hook：只负责拖拽交互本身（pointer 捕获、
 * 拖拽期间的全局 cursor / 禁止选中等），尺寸计算、夹紧、持久化和
 * 键盘可访问性由调用方自行处理。
 */
export function usePanelResize(
  options: UsePanelResizeOptions,
): UsePanelResizeResult {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const [isResizing, setIsResizing] = React.useState(false);
  const startPointRef = React.useRef(0);
  const lastDeltaRef = React.useRef(0);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add(
        optionsRef.current.axis === "vertical"
          ? "panel-resizing-vertical"
          : "panel-resizing-horizontal",
      );
      startPointRef.current =
        optionsRef.current.axis === "vertical"
          ? event.clientY
          : event.clientX;
      lastDeltaRef.current = 0;
      setIsResizing(true);
      optionsRef.current.onResizeStart?.();

      const computeDelta = (pointerEvent: PointerEvent): number => {
        const current =
          optionsRef.current.axis === "vertical"
            ? pointerEvent.clientY
            : pointerEvent.clientX;
        const delta = current - startPointRef.current;
        return optionsRef.current.invert ? -delta : delta;
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = computeDelta(moveEvent);
        lastDeltaRef.current = delta;
        optionsRef.current.onResize(delta);
      };

      const finishResize = (upEvent: PointerEvent) => {
        if (handle.hasPointerCapture?.(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId);
        }
        document.body.classList.remove(
          "panel-resizing-vertical",
          "panel-resizing-horizontal",
        );
        setIsResizing(false);
        optionsRef.current.onResizeEnd?.(lastDeltaRef.current);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishResize);
      window.addEventListener("pointercancel", finishResize);
    },
    [],
  );

  return { isResizing, handlePointerDown };
}
