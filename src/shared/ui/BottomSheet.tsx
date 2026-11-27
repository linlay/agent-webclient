import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Drawer } from "antd";
import {
  findSheetScrollParent,
  isSheetDragCandidate,
  shouldDismissSheet,
} from "./bottomSheetGesture";
import styles from "./BottomSheet.module.css";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** 读屏用的面板名称；面板本身不画标题栏。 */
  ariaLabel: string;
  /** Portal 宿主选择器：默认渲染到文档根，移动壳里应传 `.layout-mobile`。 */
  getContainer?: string;
  zIndex?: number;
  rootClassName?: string;
  children: React.ReactNode;
}

const SETTLE_MS = 220;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 拖动手势结束后吞掉紧随其后的那次点击，避免误触面板里的条目。 */
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

/**
 * 从底部升起的面板：没有标题栏，靠遮罩、Esc 和下拉手势关闭。
 * 下拉时面板 1:1 跟手，松手按距离／速度决定回弹还是关闭，
 * 关闭时保留已下拉的位移，交给抽屉自己的滑出动画接着走完。
 */
export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  getContainer,
  zIndex = 1020,
  rootClassName,
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = React.useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const writeOffset = useCallback((offset: number, animate: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = animate && !prefersReducedMotion()
      ? `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "none";
    panel.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : "";
  }, []);

  // 复用同一个 DOM：重新打开前清掉上次关闭时留下的位移，否则面板会从半开处升起。
  useLayoutEffect(() => {
    if (open) writeOffset(0, false);
  }, [open, writeOffset]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    interface Gesture {
      id: number;
      startX: number;
      startY: number;
      offset: number;
      claimed: boolean;
      scroller: HTMLElement | null;
      lastY: number;
      lastAt: number;
      velocity: number;
    }

    let gesture: Gesture | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = event.touches[0];
      gesture = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        offset: 0,
        claimed: false,
        scroller: findSheetScrollParent(event.target as Element | null, panel),
        lastY: touch.clientY,
        lastAt: performance.now(),
        velocity: 0,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = gesture;
      if (!current) return;
      const touch = Array.from(event.touches).find((item) => item.identifier === current.id);
      if (!touch) return;
      const dx = touch.clientX - current.startX;
      const dy = touch.clientY - current.startY;
      if (!current.claimed) {
        const candidate = isSheetDragCandidate({
          dx,
          dy,
          scrollTop: current.scroller?.scrollTop ?? 0,
        });
        if (!candidate) return;
        current.claimed = true;
      }
      // 接管之后不再让浏览器把这次触摸当成滚动／橡皮筋。
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      const elapsed = now - current.lastAt;
      if (elapsed > 0) current.velocity = (touch.clientY - current.lastY) / elapsed;
      current.lastAt = now;
      current.lastY = touch.clientY;
      current.offset = Math.max(0, dy);
      writeOffset(current.offset, false);
    };

    const finish = (dismissable: boolean) => {
      const current = gesture;
      gesture = null;
      if (!current?.claimed) return;
      swallowNextClick();
      const height = panel.getBoundingClientRect().height || panel.offsetHeight;
      const dismiss = dismissable && shouldDismissSheet({
        offset: current.offset,
        velocity: current.velocity,
        height,
      });
      if (dismiss) {
        // 保留当前位移，让抽屉的关闭动画从这里继续往下滑。
        closeRef.current();
        return;
      }
      writeOffset(0, true);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) finish(true);
    };
    const onTouchCancel = () => finish(false);

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd);
    panel.addEventListener("touchcancel", onTouchCancel);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [open, writeOffset]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      closable={false}
      aria-labelledby={labelId}
      getContainer={getContainer}
      rootClassName={rootClassName}
      rootStyle={{ position: "absolute", zIndex }}
      // 面板叠在页面抽屉之上，不能让 antd 把宿主抽屉整体推开。
      push={false}
      styles={{
        // 阴影和背景都交给面板自己，下拉时不会留下一条悬空的抽屉边框。
        wrapper: { boxShadow: "none" },
        content: { background: "transparent", boxShadow: "none" },
        body: { padding: 0, overflow: "hidden" },
      }}
    >
      <div ref={panelRef} className={styles.panel}>
        <span id={labelId} className={styles.srOnly}>{ariaLabel}</span>
        <div className={styles.gripRow} aria-hidden="true">
          <span className={styles.grip} />
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </Drawer>
  );
}
