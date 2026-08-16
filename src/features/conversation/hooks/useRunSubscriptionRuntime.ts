import { useEffect } from "react";

export function useRunSubscriptionRuntime(options: {
  registerAttach: () => void | (() => void);
  registerDetach: () => void | (() => void);
  detachOnPageHide: () => void;
  cleanup: () => void;
}): void {
  useEffect(() => options.registerAttach(), [options.registerAttach]);
  useEffect(() => options.registerDetach(), [options.registerDetach]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    const handler = () => options.detachOnPageHide();
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [options.detachOnPageHide]);

  useEffect(() => () => options.cleanup(), [options.cleanup]);
}
