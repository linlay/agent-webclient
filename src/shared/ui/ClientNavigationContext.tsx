import { createContext, useContext } from "react";
import type { NavigateOptions } from "react-router-dom";

/** Optional shell-owned page navigation; standalone surfaces retain their own routing. */
export const ClientNavigationContext = createContext<((target: string, options?: NavigateOptions) => void | Promise<void>) | null>(null);
export const useClientPageNavigation = () => useContext(ClientNavigationContext);
