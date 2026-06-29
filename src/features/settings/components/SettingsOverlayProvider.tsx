import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppDispatch } from "@/app/state/AppContext";

export type SettingsOverlayKey = "settings" | "memoryInfo";

interface SettingsOverlayActions {
  openOverlay: (overlay: SettingsOverlayKey) => void;
  closeOverlay: (overlay?: SettingsOverlayKey) => void;
}

interface SettingsOverlayState {
  activeOverlay: SettingsOverlayKey | null;
  isAnyOverlayOpen: boolean;
}

const defaultActions: SettingsOverlayActions = {
  openOverlay: () => undefined,
  closeOverlay: () => undefined,
};

const SettingsOverlayActionsContext =
  createContext<SettingsOverlayActions>(defaultActions);
const SettingsOverlayStateContext = createContext<SettingsOverlayState>({
  activeOverlay: null,
  isAnyOverlayOpen: false,
});

export const SettingsOverlayProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const dispatch = useAppDispatch();
  const [activeOverlay, setActiveOverlay] = useState<SettingsOverlayKey | null>(
    null,
  );

  const resetMemorySession = useCallback(() => {
    dispatch({ type: "RESET_MEMORY_INFO_SESSION" });
  }, [dispatch]);

  const openOverlay = useCallback(
    (overlay: SettingsOverlayKey) => {
      setActiveOverlay(overlay);
    },
    [],
  );

  const closeOverlay = useCallback(
    (overlay?: SettingsOverlayKey) => {
      setActiveOverlay((currentOverlay) =>
        !currentOverlay || (overlay && currentOverlay !== overlay)
          ? currentOverlay
          : null,
      );
    },
    [],
  );

  useEffect(() => {
    if (activeOverlay !== "memoryInfo") return undefined;
    dispatch({ type: "SET_MEMORY_CONSOLE_TAB", tab: "records" });
    return resetMemorySession;
  }, [activeOverlay, dispatch, resetMemorySession]);

  const actionsValue = useMemo(
    () => ({ openOverlay, closeOverlay }),
    [closeOverlay, openOverlay],
  );
  const stateValue = useMemo(
    () => ({
      activeOverlay,
      isAnyOverlayOpen: activeOverlay !== null,
    }),
    [activeOverlay],
  );

  return (
    <SettingsOverlayActionsContext.Provider value={actionsValue}>
      <SettingsOverlayStateContext.Provider value={stateValue}>
        {children}
      </SettingsOverlayStateContext.Provider>
    </SettingsOverlayActionsContext.Provider>
  );
};

export function useSettingsOverlayActions(): SettingsOverlayActions {
  return useContext(SettingsOverlayActionsContext);
}

export function useSettingsOverlayState(): SettingsOverlayState {
  return useContext(SettingsOverlayStateContext);
}
