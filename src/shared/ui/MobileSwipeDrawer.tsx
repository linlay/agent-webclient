import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  advanceSwipeSpring,
  type SwipeSide,
} from "./lib/mobileSwipeGesture";
import styles from "./MobileSwipeDrawer.module.css";

export type MobileSwipeDrawerSide = SwipeSide;

/**
 * The imperative surface the swipe engine drives. The drawer owns presentation
 * and motion; the engine only measures, moves, and hands back the release
 * velocity so drag and settle share one continuous trajectory.
 */
export interface MobileSwipeDrawerHandle {
  /** Current visual openness in px (0 closed, width fully open). */
  progressPx(): number;
  /** Panel width in px; 0 before first layout. */
  width(): number;
  /** Freeze any running settle at its current presentation value. */
  beginDrag(): void;
  /** Move the panel 1:1; may exceed the open boundary for rubber-banding. */
  dragTo(progressPx: number): void;
  /** Spring to the committed state, continuing at the release velocity. */
  endDrag(open: boolean, velocityPxPerSecond: number): void;
  /** Return to the logical state (used when a gesture never claimed). */
  cancelDrag(): void;
}

export interface MobileSwipeDrawerProps {
  side: MobileSwipeDrawerSide;
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog; the panel content owns its own header. */
  ariaLabel: string;
  className?: string;
  /** 面板占满整宽（默认左右抽屉保留 16px 遮罩，给壳层导航留出手势边界）。 */
  fullWidth?: boolean;
  children: React.ReactNode;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const MobileSwipeDrawer = forwardRef<
  MobileSwipeDrawerHandle,
  MobileSwipeDrawerProps
>(function MobileSwipeDrawer(
  { side, open, onClose, ariaLabel, className, fullWidth = false, children },
  ref,
) {
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const widthRef = useRef(0);
  const draggingRef = useRef(false);
  const engagedRef = useRef(false);
  const openRef = useRef(open);
  const animationRef = useRef<number | null>(null);
  const animationTargetRef = useRef<number | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const lastVelocityRef = useRef(0);
  const [engaged, setEngaged] = useState(false);

  openRef.current = open;
  closeRef.current = onClose;

  const measureWidth = useCallback((): number => {
    const panel = panelRef.current;
    if (!panel) return widthRef.current;
    const measured = panel.offsetWidth;
    if (measured > 0) widthRef.current = measured;
    return widthRef.current;
  }, []);

  const applyProgress = useCallback(
    (value: number) => {
      const width = widthRef.current || measureWidth();
      progressRef.current = value;
      const panel = panelRef.current;
      if (panel && width > 0) {
        const offset = side === "left" ? -(width - value) : width - value;
        panel.style.transform = `translate3d(${offset}px, 0, 0)`;
      }
      if (maskRef.current && width > 0) {
        const opacity = Math.min(1, Math.max(0, value / width));
        maskRef.current.style.opacity = String(opacity);
      }
      const layer = layerRef.current;
      if (layer) {
        layer.style.visibility =
          value > 0.5 || draggingRef.current || engagedRef.current
            ? "visible"
            : "hidden";
      }
    },
    [measureWidth, side],
  );

  // Capture the trigger before the shell marks the conversation inert: an inert
  // ancestor blurs its focused descendant, which would lose the return target.
  const rememberFocus = useCallback(() => {
    if (previousFocusRef.current) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const engage = useCallback(
    (value: boolean) => {
      if (engagedRef.current === value) return;
      engagedRef.current = value;
      setEngaged(value);
      if (!value && layerRef.current) layerRef.current.style.visibility = "hidden";
    },
    [],
  );

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    animationTargetRef.current = null;
  }, []);

  const animateTo = useCallback(
    (target: number, initialVelocity: number) => {
      cancelAnimation();
      const width = measureWidth();
      const clampedTarget = Math.min(width, Math.max(0, target));
      animationTargetRef.current = clampedTarget;
      if (!engagedRef.current) {
        rememberFocus();
        engagedRef.current = true;
        setEngaged(true);
      }
      if (
        prefersReducedMotion() ||
        (Math.abs(progressRef.current - clampedTarget) < 0.5 &&
          Math.abs(initialVelocity) < 1)
      ) {
        applyProgress(clampedTarget);
        animationTargetRef.current = null;
        lastVelocityRef.current = 0;
        if (clampedTarget <= 0) engage(false);
        return;
      }
      let state = {
        position: progressRef.current,
        velocity: initialVelocity,
      };
      let last = performance.now();
      const frame = (now: number) => {
        state = advanceSwipeSpring(
          state,
          clampedTarget,
          (now - last) / 1000,
        );
        last = now;
        if (state.position <= 0) {
          state.position = 0;
          if (state.velocity < 0) state.velocity = 0;
        }
        if (width > 0 && state.position >= width) {
          state.position = width;
          if (state.velocity > 0) state.velocity = 0;
        }
        lastVelocityRef.current = state.velocity;
        applyProgress(state.position);
        if (
          Math.abs(state.velocity) < 1 &&
          Math.abs(state.position - clampedTarget) < 0.5
        ) {
          applyProgress(clampedTarget);
          lastVelocityRef.current = 0;
          animationRef.current = null;
          animationTargetRef.current = null;
          if (clampedTarget <= 0) engage(false);
          return;
        }
        animationRef.current = requestAnimationFrame(frame);
      };
      animationRef.current = requestAnimationFrame(frame);
    },
    [applyProgress, cancelAnimation, engage, measureWidth, rememberFocus],
  );

  const settleTo = useCallback(
    (nextOpen: boolean) => {
      if (draggingRef.current) return;
      const width = measureWidth();
      // The panel can be laid out before it has a measurable width (e.g. while
      // the shell is still hidden); wait for the resize pass instead of
      // interpreting a 0px target as closed.
      if (nextOpen && width <= 0) return;
      const target = nextOpen ? width : 0;
      if (
        animationRef.current !== null &&
        animationTargetRef.current === target
      ) {
        return;
      }
      if (
        !nextOpen &&
        animationRef.current === null &&
        progressRef.current <= 0.5
      ) {
        applyProgress(0);
        engage(false);
        return;
      }
      // Interrupting a running settle keeps its velocity so a reversal has no
      // brick-wall stop.
      animateTo(target, lastVelocityRef.current);
    },
    [animateTo, applyProgress, engage, measureWidth],
  );

  useImperativeHandle(
    ref,
    () => ({
      progressPx: () => progressRef.current,
      width: () => measureWidth(),
      beginDrag: () => {
        cancelAnimation();
        lastVelocityRef.current = 0;
        draggingRef.current = true;
        if (engagedRef.current === false) {
          rememberFocus();
          engagedRef.current = true;
          setEngaged(true);
        }
        measureWidth();
        applyProgress(progressRef.current);
      },
      dragTo: (value: number) => {
        applyProgress(value);
      },
      endDrag: (nextOpen: boolean, velocityPxPerSecond: number) => {
        draggingRef.current = false;
        lastVelocityRef.current = velocityPxPerSecond;
        const target = nextOpen ? measureWidth() : 0;
        animateTo(target, velocityPxPerSecond);
      },
      cancelDrag: () => {
        draggingRef.current = false;
        settleTo(openRef.current);
      },
    }),
    [animateTo, applyProgress, cancelAnimation, measureWidth, rememberFocus, settleTo],
  );

  useEffect(() => {
    settleTo(open);
  }, [open, settleTo]);

  useEffect(() => {
    if (!engaged) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // 上面还叠着 antd Drawer（如行内动作 BottomSheet）时，把 Esc 让给它；
      // 页面抽屉本身包含当前 layer，不算上层浮层。
      const layer = layerRef.current;
      if (layer) {
        const hasUpperDrawer = Array.from(
          document.querySelectorAll(".ant-drawer-open"),
        ).some(drawer => !drawer.contains(layer));
        if (hasUpperDrawer) return;
      }
      // 捕获阶段拦住 Esc，避免同一次按键把外层页面抽屉一起关掉。
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [engaged]);

  // Focus moves into the drawer while it is present and returns to the control
  // that opened it. Text fields are skipped so closing never re-opens the
  // soft keyboard on a phone.
  useEffect(() => {
    if (engaged) {
      const frame = requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (panel && !panel.contains(document.activeElement)) {
          panel.focus({ preventScroll: true });
        }
      });
      return () => cancelAnimationFrame(frame);
    }
    const previous = previousFocusRef.current;
    previousFocusRef.current = null;
    if (
      previous?.isConnected &&
      previous.tagName !== "INPUT" &&
      previous.tagName !== "TEXTAREA" &&
      !previous.isContentEditable
    ) {
      previous.focus({ preventScroll: true });
    }
  }, [engaged]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (engaged) layer.removeAttribute("inert");
    else layer.setAttribute("inert", "");
  }, [engaged]);

  useEffect(() => {
    const onResize = () => {
      if (draggingRef.current) return;
      const width = measureWidth();
      if (width > 0) applyProgress(openRef.current ? width : progressRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyProgress, measureWidth]);

  useEffect(() => cancelAnimation, [cancelAnimation]);

  return (
    <div
      ref={layerRef}
      className={[styles.layer, className || ""].filter(Boolean).join(" ")}
      data-side={side}
      data-full-width={fullWidth ? "true" : undefined}
      data-mobile-drawer={side}
      data-open={open ? "true" : undefined}
      aria-hidden={engaged ? undefined : true}
    >
      <div
        ref={maskRef}
        className={styles.mask}
        data-mobile-swipe-mask={side}
        aria-hidden="true"
        onClick={() => closeRef.current()}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal={engaged ? true : undefined}
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
});
