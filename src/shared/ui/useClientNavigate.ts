import { useCallback } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import { useClientPageNavigation } from "./ClientNavigationContext";

/** Keep in-app pages and conversation handoffs inside the mobile shell. */
export function useClientNavigate() {
  const navigate = useNavigate();
  const navigatePage = useClientPageNavigation();
  return useCallback((target: To | number, options?: NavigateOptions) => {
    if (typeof target === "number") return navigate(target);
    if (navigatePage && typeof target === "string") return navigatePage(target, options);
    if (navigatePage && typeof target !== "string" && target.pathname?.startsWith("/")) {
      return navigatePage(`${target.pathname}${target.search || ""}${target.hash || ""}`, options);
    }
    return options ? navigate(target, options) : navigate(target);
  }, [navigate, navigatePage]);
}
