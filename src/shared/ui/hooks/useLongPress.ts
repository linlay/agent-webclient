import { useCallback, useEffect, useRef } from "react";

const DEFAULT_DELAY_MS = 500;
const DEFAULT_MOVE_TOLERANCE_PX = 10;

/** 长按识别后吞掉紧随其后的 click，避免面板刚打开就被松手点击关掉。 */
function swallowNextClick() {
  if (typeof window === "undefined") return;
  let timer = 0;
  const cleanup = () => {
    window.removeEventListener("click", swallow, true);
    window.clearTimeout(timer);
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  window.addEventListener("click", swallow, true);
  timer = window.setTimeout(cleanup, 400);
}

export interface LongPressOptions {
  delayMs?: number;
  moveTolerancePx?: number;
  disabled?: boolean;
  /** 起手落在这些元素里不触长按（例如列表的拖拽手柄）。 */
  ignoreTarget?: (target: Element) => boolean;
}

/**
 * 触屏列表项的统一定长按手势：按住 500ms 触发，移动超过 10px 或落在拖拽手柄上取消；
 * 触发后吞掉松手 click，调用方在 onClick 里用 consumeClick 判断是否要忽略这次选中。
 */
export function useLongPress(
  onLongPress?: () => void,
  options: LongPressOptions = {},
) {
  const {
    delayMs = DEFAULT_DELAY_MS,
    moveTolerancePx = DEFAULT_MOVE_TOLERANCE_PX,
    disabled = false,
    ignoreTarget,
  } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const suppressRef = useRef(false);
  const active = Boolean(onLongPress) && !disabled;

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!active) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as Element | null;
      if (target && ignoreTarget?.(target)) return;
      startRef.current = { x: event.clientX, y: event.clientY };
      clear();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        suppressRef.current = true;
        swallowNextClick();
        window.setTimeout(() => {
          suppressRef.current = false;
        }, 600);
        onLongPress?.();
      }, delayMs);
    },
    [active, clear, delayMs, ignoreTarget, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (timerRef.current === null) return;
      const { x, y } = startRef.current;
      if (
        Math.hypot(event.clientX - x, event.clientY - y) >
        moveTolerancePx
      ) {
        clear();
      }
    },
    [clear, moveTolerancePx],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (active) event.preventDefault();
    },
    [active],
  );

  const consumeClick = useCallback(() => {
    if (!suppressRef.current) return false;
    suppressRef.current = false;
    return true;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    consumeClick,
    longPressProps: active
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp: clear,
          onPointerCancel: clear,
          onPointerLeave: clear,
          onContextMenu,
        }
      : {},
  };
}
