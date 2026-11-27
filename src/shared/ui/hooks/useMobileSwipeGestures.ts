import { useEffect, useRef } from "react";
import {
  SWIPE_EDGE_ZONE,
  bandSwipeProgress,
  hasHorizontalIntent,
  resolveSwipeOpen,
  resolveSwipeSide,
  swipeOpenDirection,
  swipeVelocity,
  type SwipeSide,
} from "../lib/mobileSwipeGesture";
import type { MobileSwipeDrawerHandle } from "../MobileSwipeDrawer";

export interface MobileSwipePanelBinding {
  ref: React.RefObject<MobileSwipeDrawerHandle | null>;
  open: boolean;
  onOpen(): void;
  onClose(): void;
}

export interface MobileSwipeGestureOptions {
  rootRef: React.RefObject<HTMLElement | null>;
  left: MobileSwipePanelBinding;
  right: MobileSwipePanelBinding;
  /** Management pages and other overlays keep their own navigation. */
  disabled?: boolean;
}

/**
 * Elements that own the horizontal gesture themselves, or that are not safe to
 * drag from (text entry, sliders, embedded editors, popup surfaces).
 */
const BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[data-swipe-ignore]",
  "[role='slider']",
  ".ant-slider",
  ".ant-select",
  ".ant-picker",
  ".ant-tabs-nav",
  ".ant-drawer",
  ".ant-modal",
  ".ant-popover",
  ".ant-dropdown",
  ".ant-message",
  ".ant-notification",
  ".xterm",
  ".monaco-editor",
].join(", ");

interface GestureSample {
  t: number;
  x: number;
}

interface GestureSession {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  samples: GestureSample[];
  /** Screen edge the finger started on, for a new swipe. */
  edge: SwipeSide | null;
  panel: SwipeSide | null;
  direction: 1 | -1;
  claimed: boolean;
  claimDx: number;
  startProgress: number;
  fromClosed: boolean;
  width: number;
}

function activePanel(bindings: MobileSwipeGestureOptions): SwipeSide | null {
  const right = bindings.right;
  const left = bindings.left;
  const rightProgress = right.ref.current?.progressPx() ?? 0;
  const leftProgress = left.ref.current?.progressPx() ?? 0;
  // The right panel stacks above the navigation drawer, so it owns the gesture
  // whenever it is even partially on screen.
  if (rightProgress > 0.5) return "right";
  if (leftProgress > 0.5) return "left";
  if (right.open) return "right";
  if (left.open) return "left";
  return null;
}

function bindingFor(
  bindings: MobileSwipeGestureOptions,
  side: SwipeSide,
): MobileSwipePanelBinding {
  return side === "left" ? bindings.left : bindings.right;
}

function handleFor(
  bindings: MobileSwipeGestureOptions,
  side: SwipeSide,
): MobileSwipeDrawerHandle | null {
  return bindingFor(bindings, side).ref.current;
}

/**
 * 宿主抽屉（管理页本身）不算遮挡：手势根就在它内部时，页面内的左抽屉仍然要能滑出。
 * 只有与手势根平行的其它 open 抽屉、Modal 才阻断。
 */
function hasBlockingOverlay(root: HTMLElement): boolean {
  const drawers = document.querySelectorAll(".ant-drawer-open");
  for (const drawer of drawers) {
    if (!drawer.contains(root)) return true;
  }
  const modal = document.querySelector<HTMLElement>(".ant-modal-wrap");
  return Boolean(modal && modal.getClientRects().length > 0);
}

function hasSelection(): boolean {
  const selection =
    typeof window.getSelection === "function" ? window.getSelection() : null;
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

/** Let inner scrollers (code blocks, tables, attachment strips) keep panning. */
function startsInsideHorizontalScroller(
  target: Element,
  root: HTMLElement,
): boolean {
  let node: Element | null = target;
  while (node && node !== root) {
    if (node.scrollWidth > node.clientWidth + 2) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (
        overflowX === "auto" ||
        overflowX === "scroll" ||
        overflowX === "overlay"
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

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
  timer = window.setTimeout(cleanup, 400);
  window.addEventListener("click", swallow, true);
}

/**
 * Swipe contract of the `/mobile` shell:
 * - closed: swipe right opens the navigation drawer, swipe left opens content;
 * - open: the same drawer follows the finger 1:1 and closes on a swipe back;
 * - release decides from projected momentum, and a running settle can be
 *   grabbed again at any frame.
 */
export function useMobileSwipeGestures(options: MobileSwipeGestureOptions) {
  const bindingsRef = useRef(options);
  bindingsRef.current = options;
  const sessionRef = useRef<GestureSession | null>(null);

  useEffect(() => {
    const root = bindingsRef.current.rootRef.current;
    if (!root) return;

    const startedOn = (target: Element | null): Element | null => {
      if (!target || !root.contains(target)) return null;
      return target;
    };

    const onPointerDown = (event: PointerEvent) => {
      const bindings = bindingsRef.current;
      if (bindings.disabled || sessionRef.current) return;
      if (event.isPrimary === false) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (hasBlockingOverlay(root)) return;
      const target = startedOn(event.target as Element | null);
      if (!target) return;
      // 祖先抽屉是页面容器本身，不是浮层；只拦手势根内部或平行的弹层。
      const blocked = target.closest(BLOCKED_TARGET_SELECTOR);
      if (blocked && !blocked.contains(root)) return;
      if (hasSelection()) return;
      if (startsInsideHorizontalScroller(target, root)) return;

      const locked = activePanel(bindings);
      const rect = root.getBoundingClientRect();
      const edge: SwipeSide | null =
        event.clientX <= rect.left + SWIPE_EDGE_ZONE
          ? "left"
          : event.clientX >= rect.right - SWIPE_EDGE_ZONE
            ? "right"
            : null;
      // A mouse dragging across selected text is how people select text; only
      // the screen edges begin a swipe for pointer devices.
      if (event.pointerType === "mouse" && !locked && !edge) return;

      const session: GestureSession = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || "touch",
        startX: event.clientX,
        startY: event.clientY,
        samples: [{ t: performance.now(), x: event.clientX }],
        edge,
        panel: locked,
        direction: locked ? swipeOpenDirection(locked) : 1,
        claimed: false,
        claimDx: 0,
        startProgress: 0,
        fromClosed: true,
        width: 0,
      };

      if (locked) {
        // Grabbing a moving drawer freezes it under the finger immediately.
        const handle = handleFor(bindings, locked);
        if (!handle) return;
        handle.beginDrag();
        session.startProgress = handle.progressPx();
        session.width = handle.width();
        session.direction = swipeOpenDirection(locked);
      }
      sessionRef.current = session;
    };

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      const bindings = bindingsRef.current;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      const now = performance.now();
      session.samples.push({ t: now, x: event.clientX });
      if (session.samples.length > 24) session.samples.shift();

      if (!session.claimed) {
        if (!hasHorizontalIntent(dx, dy)) return;
        if (hasSelection()) return;
        if (session.panel) {
          const direction = swipeOpenDirection(session.panel);
          const handle = handleFor(bindings, session.panel);
          if (!handle) return;
          const width = handle.width();
          const progress = handle.progressPx();
          const atOpenEdge = width > 0 && progress >= width - 0.5;
          const atClosedEdge = progress <= 0.5;
          // A resting drawer only moves back toward closed; a drawer caught
          // mid-settle can be grabbed in either direction.
          if (atOpenEdge && dx * direction >= 0) return;
          if (atClosedEdge && dx * direction <= 0) return;
          session.direction = direction;
          session.claimed = true;
          session.claimDx = dx;
          session.startProgress = progress;
          session.width = width;
          session.fromClosed = atClosedEdge;
          if (session.fromClosed) session.startProgress = 0;
        } else {
          const side = resolveSwipeSide(dx, dy);
          if (!side) return;
          if (session.pointerType === "mouse" && session.edge !== side) return;
          const other = side === "left" ? bindings.right : bindings.left;
          if (
            other.open ||
            (other.ref.current?.progressPx() ?? 0) > 0.5
          ) {
            return;
          }
          const handle = handleFor(bindings, side);
          if (!handle) return;
          session.panel = side;
          session.direction = swipeOpenDirection(side);
          session.claimed = true;
          session.claimDx = dx;
          handle.beginDrag();
          session.startProgress = handle.progressPx();
          session.width = handle.width();
          session.fromClosed = session.startProgress <= 0.5;
          if (session.fromClosed) session.startProgress = 0;
        }
      }

      if (!session.claimed || !session.panel) return;
      const handle = handleFor(bindings, session.panel);
      if (!handle) return;
      const travelled = session.fromClosed ? dx : dx - session.claimDx;
      const next = bandSwipeProgress(
        session.startProgress + travelled * session.direction,
        session.width,
      );
      handle.dragTo(next);
    };

    const finish = (commit: boolean) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session) return;
      const bindings = bindingsRef.current;
      if (!session.claimed || !session.panel) {
        if (session.panel) {
          handleFor(bindings, session.panel)?.cancelDrag();
        }
        return;
      }
      const handle = handleFor(bindings, session.panel);
      if (!handle) return;
      if (!commit) {
        handle.cancelDrag();
        return;
      }
      const binding = bindingFor(bindings, session.panel);
      const velocity =
        swipeVelocity(session.samples, performance.now()) * session.direction;
      const open = resolveSwipeOpen(
        handle.progressPx(),
        velocity,
        session.width,
      );
      handle.endDrag(open, velocity);
      if (open !== binding.open) {
        if (open) binding.onOpen();
        else binding.onClose();
      }
      swallowNextClick();
    };

    const onPointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      finish(true);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      finish(false);
    };

    // Losing focus mid-swipe (app switch, browser chrome) must not leave the
    // drawer frozen between states.
    const onWindowBlur = () => {
      if (sessionRef.current) finish(false);
    };

    // The touchmove listener is what keeps a claimed horizontal gesture from
    // turning into a scroll; unclaimed gestures (vertical reading) are untouched.
    const onTouchMove = (event: TouchEvent) => {
      if (!sessionRef.current?.claimed) return;
      if (event.cancelable) event.preventDefault();
    };

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      sessionRef.current = null;
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
}
