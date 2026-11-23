import { useEffect } from "react";

const LOCKED_VIEWPORT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  // Draw under the notch.
  ["viewport-fit", "cover"],
  // Let Chromium resize the layout viewport with the keyboard instead of only
  // shrinking the visual viewport: Edge Android otherwise reports a viewport shorter
  // than the visible area, leaving a blank strip under the composer. WebKit ignores
  // the hint and keeps the visual-viewport path.
  ["interactive-widget", "resizes-content"],
  // The shell is a fixed app frame measured at the layout width; pinch zoom crops the
  // composer and top nav instead of enlarging readable content.
  ["maximum-scale", "1"],
  ["user-scalable", "no"],
];

/**
 * Viewport contract of the /mobile shell: notch-safe, keyboard-aware, and never
 * pinch-zoomable. The metadata only covers browsers that honor it; WebKit is handled
 * by canceling its gesture events and any multi-touch move while the shell is mounted.
 */
export function useMobileViewportLock() {
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) return;
    const previous = viewport.content;
    const parts = previous.split(",").map(part => part.trim()).filter(Boolean);
    for (const [key, value] of LOCKED_VIEWPORT_FIELDS) {
      const index = parts.findIndex(part => part.split("=")[0].trim().toLowerCase() === key);
      if (index >= 0) parts[index] = `${key}=${value}`;
      else parts.push(`${key}=${value}`);
    }
    viewport.content = parts.join(", ");
    return () => { viewport.content = previous; };
  }, []);

  useEffect(() => {
    // iOS Safari has ignored user-scalable=no since iOS 10 and reports pinch through
    // gesture* events; Chromium can still deliver a two-finger touchmove. Cancel both
    // so the fixed shell keeps the layout width it measured.
    const blockGesture: EventListener = event => { event.preventDefault(); };
    const blockPinch: EventListener = event => {
      if ((event as TouchEvent).touches.length > 1) event.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false };
    document.addEventListener("gesturestart", blockGesture, options);
    document.addEventListener("gesturechange", blockGesture, options);
    document.addEventListener("touchmove", blockPinch, options);
    return () => {
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("touchmove", blockPinch);
    };
  }, []);
}
