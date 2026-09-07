import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppDispatch } from "@/app/state/AppContext";

interface MemoryOverlayActions {
  openMemory: () => void;
  closeMemory: () => void;
}

interface MemoryOverlayState {
  isMemoryOpen: boolean;
}

const MemoryOverlayActionsContext = createContext<MemoryOverlayActions>({
  openMemory: () => undefined,
  closeMemory: () => undefined,
});
const MemoryOverlayStateContext = createContext<MemoryOverlayState>({
  isMemoryOpen: false,
});

export const MemoryOverlayProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const dispatch = useAppDispatch();
  const [isMemoryOpen, setMemoryOpen] = useState(false);
  const openMemory = useCallback(() => setMemoryOpen(true), []);
  const closeMemory = useCallback(() => setMemoryOpen(false), []);

  useEffect(() => {
    if (!isMemoryOpen) return undefined;
    dispatch({ type: "SET_MEMORY_CONSOLE_TAB", tab: "records" });
    return () => dispatch({ type: "RESET_MEMORY_INFO_SESSION" });
  }, [dispatch, isMemoryOpen]);

  const actions = useMemo(() => ({ openMemory, closeMemory }), [closeMemory, openMemory]);
  const state = useMemo(() => ({ isMemoryOpen }), [isMemoryOpen]);
  return (
    <MemoryOverlayActionsContext.Provider value={actions}>
      <MemoryOverlayStateContext.Provider value={state}>
        {children}
      </MemoryOverlayStateContext.Provider>
    </MemoryOverlayActionsContext.Provider>
  );
};

export function useMemoryOverlayActions(): MemoryOverlayActions {
  return useContext(MemoryOverlayActionsContext);
}

export function useMemoryOverlayState(): MemoryOverlayState {
  return useContext(MemoryOverlayStateContext);
}
