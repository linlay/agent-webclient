/**
 * App-wide overlay scrollbars.
 *
 * Desktop's sidebar thumb is the shared visual/behavioural reference: a 6px
 * overlay pill that only appears while a container is scrolling, can be
 * dragged, and hides 800ms after the last scroll. This module generalises that
 * behaviour to every app-owned scroll container in the WebClient.
 *
 * Native scrollbars stay visible until the first successful install. CSS hides
 * them under `html[data-overlay-scrollbars="ready"]`, so a script failure keeps
 * the native fallback instead of leaving the app without a scroll indicator.
 * The standalone conversation export keeps its own native scrollbar by design.
 */

export const OVERLAY_SCROLLBAR_HIDE_DELAY_MS = 800;
export const OVERLAY_SCROLLBAR_MIN_LENGTH = 24;
export const OVERLAY_SCROLLBAR_READY_ATTRIBUTE = "data-overlay-scrollbars";
export const OVERLAY_SCROLLBAR_OPT_OUT_PROPERTY = "--app-scrollbar-overlay";
export const OVERLAY_SCROLLBAR_INSET_END_PROPERTY = "--app-scrollbar-inset-end";

type ScrollAxis = "vertical" | "horizontal";

interface ScrollMetrics {
  clientSize: number;
  scrollSize: number;
  scrollOffset: number;
}

export interface ThumbGeometry {
  length: number;
  offset: number;
  visible: boolean;
}

export function computeThumbGeometry(input: {
  clientSize: number;
  scrollSize: number;
  scrollOffset: number;
  minLength?: number;
}): ThumbGeometry {
  const minLength = input.minLength ?? OVERLAY_SCROLLBAR_MIN_LENGTH;
  if (!Number.isFinite(input.clientSize) || input.clientSize <= 0) {
    return { length: 0, offset: 0, visible: false };
  }
  const range = input.scrollSize - input.clientSize;
  if (!Number.isFinite(range) || range <= 0) {
    return { length: 0, offset: 0, visible: false };
  }
  const length = Math.min(
    input.clientSize,
    Math.max(minLength, (input.clientSize * input.clientSize) / input.scrollSize),
  );
  const travel = input.clientSize - length;
  const progress = Math.min(1, Math.max(0, input.scrollOffset / range));
  return { length, offset: progress * travel, visible: true };
}

export function parseOverlayInsetEnd(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isOverlayScrollbarDisabled(style: CSSStyleDeclaration): boolean {
  return style.getPropertyValue(OVERLAY_SCROLLBAR_OPT_OUT_PROPERTY).trim().toLowerCase() === "off";
}

function isScrollableOverflow(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function readAxisMetrics(element: HTMLElement, axis: ScrollAxis): ScrollMetrics {
  if (axis === "vertical") {
    return {
      clientSize: element.clientHeight,
      scrollSize: element.scrollHeight,
      scrollOffset: element.scrollTop,
    };
  }
  return {
    clientSize: element.clientWidth,
    scrollSize: element.scrollWidth,
    scrollOffset: element.scrollLeft,
  };
}

const INSTALLED_DOCUMENTS = new WeakSet<Document>();

export function installOverlayScrollbars(win: Window = window): () => void {
  const doc = win.document;
  const start = (): (() => void) => {
    if (INSTALLED_DOCUMENTS.has(doc) || !doc.body) return () => {};
    INSTALLED_DOCUMENTS.add(doc);
    const root = doc.documentElement;
    const body = doc.body;
    const vertical = doc.createElement("div");
    const horizontal = doc.createElement("div");
    for (const [axis, thumb] of [
      ["vertical", vertical],
      ["horizontal", horizontal],
    ] as const) {
      thumb.className = "app-scrollbar-thumb";
      thumb.dataset.scrollbarAxis = axis;
      thumb.setAttribute("aria-hidden", "true");
      thumb.hidden = true;
      body.append(thumb);
    }

    let hideTimer: number | undefined;
    let animationFrame = 0;
    let activeTarget: HTMLElement | null = null;
    let observedTarget: HTMLElement | null = null;
    let drag:
      | {
          axis: ScrollAxis;
          pointerId: number;
          startPosition: number;
          startScrollOffset: number;
          target: HTMLElement;
        }
      | undefined;

    const ResizeObserverCtor = (win as Window & typeof globalThis).ResizeObserver;
    const resizeObserver =
      typeof ResizeObserverCtor === "function" ? new ResizeObserverCtor(() => syncActiveTarget()) : null;

    function clearHideTimer() {
      if (hideTimer !== undefined) {
        win.clearTimeout(hideTimer);
        hideTimer = undefined;
      }
    }

    function hideThumbs() {
      hideTimer = undefined;
      vertical.hidden = true;
      vertical.classList.remove("is-visible");
      horizontal.hidden = true;
      horizontal.classList.remove("is-visible");
      resizeObserver?.disconnect();
      observedTarget = null;
      activeTarget = null;
    }

    function scheduleHide() {
      clearHideTimer();
      if (drag) return;
      hideTimer = win.setTimeout(hideThumbs, OVERLAY_SCROLLBAR_HIDE_DELAY_MS);
    }

    function observeTarget(target: HTMLElement) {
      if (!resizeObserver || observedTarget === target) return;
      resizeObserver.disconnect();
      resizeObserver.observe(target);
      observedTarget = target;
    }

    function placeThumb(
      axis: ScrollAxis,
      geometry: ThumbGeometry,
      rect: { right: number; bottom: number; left: number; top: number },
      insetEnd: number,
    ) {
      const thumb = axis === "vertical" ? vertical : horizontal;
      if (!geometry.visible) {
        thumb.hidden = true;
        thumb.classList.remove("is-visible");
        return;
      }
      thumb.hidden = false;
      thumb.classList.add("is-visible");
      if (axis === "vertical") {
        thumb.style.height = `${geometry.length}px`;
        thumb.style.top = `${rect.top + geometry.offset}px`;
        thumb.style.right = `${win.innerWidth - rect.right - insetEnd}px`;
        return;
      }
      thumb.style.width = `${geometry.length}px`;
      thumb.style.left = `${rect.left + geometry.offset}px`;
      thumb.style.bottom = `${win.innerHeight - rect.bottom}px`;
    }

    function syncTarget(target: HTMLElement) {
      const isDocumentTarget =
        target === doc.scrollingElement || target === doc.documentElement || target === doc.body;
      const rect = isDocumentTarget
        ? { right: win.innerWidth, bottom: win.innerHeight, left: 0, top: 0 }
        : target.getBoundingClientRect();

      let insetEnd = 0;
      let overflowX = "auto";
      let overflowY = "auto";
      if (!isDocumentTarget) {
        const style = win.getComputedStyle(target);
        if (isOverlayScrollbarDisabled(style)) {
          vertical.hidden = true;
          vertical.classList.remove("is-visible");
          horizontal.hidden = true;
          horizontal.classList.remove("is-visible");
          return;
        }
        insetEnd = parseOverlayInsetEnd(style.getPropertyValue(OVERLAY_SCROLLBAR_INSET_END_PROPERTY));
        overflowX = style.overflowX;
        overflowY = style.overflowY;
      }
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= win.innerWidth || rect.top >= win.innerHeight) {
        vertical.hidden = true;
        vertical.classList.remove("is-visible");
        horizontal.hidden = true;
        horizontal.classList.remove("is-visible");
        return;
      }

      const verticalGeometry = isScrollableOverflow(overflowY)
        ? computeThumbGeometry(readAxisMetrics(target, "vertical"))
        : { length: 0, offset: 0, visible: false };
      const horizontalGeometry = isScrollableOverflow(overflowX)
        ? computeThumbGeometry(readAxisMetrics(target, "horizontal"))
        : { length: 0, offset: 0, visible: false };
      placeThumb("vertical", verticalGeometry, rect, insetEnd);
      placeThumb("horizontal", horizontalGeometry, rect, insetEnd);
      if (!verticalGeometry.visible && !horizontalGeometry.visible) {
        resizeObserver?.disconnect();
        observedTarget = null;
        return;
      }
      observeTarget(target);
    }

    function syncActiveTarget() {
      if (activeTarget) syncTarget(activeTarget);
    }

    function resolveScrollTarget(target: EventTarget | null): HTMLElement | null {
      if (!target) return null;
      if (target === doc || target === win) {
        return doc.scrollingElement as HTMLElement | null;
      }
      if (target instanceof HTMLElement) return target;
      return null;
    }

    function handleScroll(event: Event) {
      const target = resolveScrollTarget(event.target);
      if (!target) return;
      if (drag && drag.target !== target) return;
      if (activeTarget !== target) {
        activeTarget = target;
        observedTarget = null;
      }
      if (!animationFrame) {
        animationFrame = win.requestAnimationFrame(() => {
          animationFrame = 0;
          if (activeTarget) syncTarget(activeTarget);
        });
      }
      scheduleHide();
    }

    function handleWheel(axis: ScrollAxis, event: WheelEvent) {
      const target = activeTarget;
      if (!target) return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? axis === "vertical"
            ? target.clientHeight
            : target.clientWidth
          : event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : 1;
      if (axis === "vertical") {
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        target.scrollTop += delta * unit;
      } else {
        const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
        target.scrollLeft += delta * unit;
      }
      syncTarget(target);
      scheduleHide();
    }

    function thumbForAxis(axis: ScrollAxis): HTMLDivElement {
      return axis === "vertical" ? vertical : horizontal;
    }

    function handlePointerDown(axis: ScrollAxis, event: PointerEvent) {
      if (event.button !== 0 || !activeTarget) return;
      event.preventDefault();
      event.stopPropagation();
      const thumb = thumbForAxis(axis);
      drag = {
        axis,
        pointerId: event.pointerId,
        startPosition: axis === "vertical" ? event.clientY : event.clientX,
        startScrollOffset: axis === "vertical" ? activeTarget.scrollTop : activeTarget.scrollLeft,
        target: activeTarget,
      };
      clearHideTimer();
      try {
        thumb.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; pointermove still fires while the
        // pointer is over the thumb.
      }
    }

    function handlePointerMove(axis: ScrollAxis, event: PointerEvent) {
      if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId) return;
      const thumb = thumbForAxis(axis);
      const target = drag.target;
      const metrics = readAxisMetrics(target, axis);
      const thumbSize = axis === "vertical" ? thumb.offsetHeight : thumb.offsetWidth;
      const travel = metrics.clientSize - thumbSize;
      if (travel <= 0) return;
      const position = axis === "vertical" ? event.clientY : event.clientX;
      const delta = ((position - drag.startPosition) * (metrics.scrollSize - metrics.clientSize)) / travel;
      if (axis === "vertical") {
        target.scrollTop = drag.startScrollOffset + delta;
      } else {
        target.scrollLeft = drag.startScrollOffset + delta;
      }
      syncTarget(target);
    }

    function handlePointerEnd(axis: ScrollAxis, event: PointerEvent) {
      if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId) return;
      const thumb = thumbForAxis(axis);
      drag = undefined;
      try {
        if (thumb.hasPointerCapture(event.pointerId)) {
          thumb.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The pointer may already be released.
      }
      scheduleHide();
    }

    function handleWindowResize() {
      syncActiveTarget();
    }

    const pointerHandlers: Array<{
      axis: ScrollAxis;
      thumb: HTMLDivElement;
      down: (event: PointerEvent) => void;
      move: (event: PointerEvent) => void;
      end: (event: PointerEvent) => void;
      wheel: (event: WheelEvent) => void;
    }> = (["vertical", "horizontal"] as const).map((axis) => {
      const thumb = thumbForAxis(axis);
      return {
        axis,
        thumb,
        down: (event) => handlePointerDown(axis, event),
        move: (event) => handlePointerMove(axis, event),
        end: (event) => handlePointerEnd(axis, event),
        wheel: (event) => handleWheel(axis, event),
      };
    });

    doc.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    win.addEventListener("resize", handleWindowResize);
    for (const handler of pointerHandlers) {
      handler.thumb.addEventListener("pointerdown", handler.down);
      handler.thumb.addEventListener("pointermove", handler.move);
      handler.thumb.addEventListener("pointerup", handler.end);
      handler.thumb.addEventListener("pointercancel", handler.end);
      handler.thumb.addEventListener("lostpointercapture", handler.end);
      handler.thumb.addEventListener("wheel", handler.wheel, { passive: false });
    }
    root.setAttribute(OVERLAY_SCROLLBAR_READY_ATTRIBUTE, "ready");

    return () => {
      INSTALLED_DOCUMENTS.delete(doc);
      clearHideTimer();
      if (animationFrame) win.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      doc.removeEventListener("scroll", handleScroll, { capture: true });
      win.removeEventListener("resize", handleWindowResize);
      for (const handler of pointerHandlers) {
        handler.thumb.removeEventListener("pointerdown", handler.down);
        handler.thumb.removeEventListener("pointermove", handler.move);
        handler.thumb.removeEventListener("pointerup", handler.end);
        handler.thumb.removeEventListener("pointercancel", handler.end);
        handler.thumb.removeEventListener("lostpointercapture", handler.end);
        handler.thumb.removeEventListener("wheel", handler.wheel);
        handler.thumb.remove();
      }
      root.removeAttribute(OVERLAY_SCROLLBAR_READY_ATTRIBUTE);
    };
  };

  if (doc.body) return start();
  let cleanup: (() => void) | null = null;
  const onReady = () => {
    cleanup = start();
  };
  doc.addEventListener("DOMContentLoaded", onReady, { once: true });
  return () => {
    doc.removeEventListener("DOMContentLoaded", onReady);
    cleanup?.();
  };
}
