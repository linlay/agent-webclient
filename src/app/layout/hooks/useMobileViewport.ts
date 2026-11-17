import { useLayoutEffect, type RefObject } from "react";

/** Anchor in document coordinates: keyboard panning must not also move a fixed shell. */
export function useMobileViewport(root: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    let settled: ReturnType<typeof setTimeout>;
    const update = () => {
      const height = viewport?.height || window.innerHeight;
      // The absolute shell is relative to #root, not the layout viewport.
      const parentTop = (element.offsetParent?.getBoundingClientRect().top || 0) + window.scrollY;
      const pageTop = viewport?.pageTop ?? window.scrollY;
      element.style.setProperty("--mobile-height", `${height}px`);
      element.style.setProperty("--mobile-top", `${pageTop - parentTop}px`);
      // Pinch zoom also shrinks VisualViewport; compare at the layout scale.
      const occluded = document.documentElement.clientHeight - height * (viewport?.scale || 1);
      const editing = element.contains(document.activeElement)
        && document.activeElement?.matches("textarea, input, [contenteditable=true]");
      element.toggleAttribute("data-keyboard-open", Boolean(editing && occluded > 120));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onFocus = () => {
      schedule();
      // WebKit can finish keyboard panning after its last resize notification.
      clearTimeout(settled);
      settled = setTimeout(schedule, 350);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule);
    element.addEventListener("focusin", onFocus);
    element.addEventListener("focusout", onFocus);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      element.removeEventListener("focusin", onFocus);
      element.removeEventListener("focusout", onFocus);
    };
  }, [root]);
}
