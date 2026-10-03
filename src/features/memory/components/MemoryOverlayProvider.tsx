import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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
  const [isMemoryOpen, setMemoryOpen] = useState(false);
  const openMemory = useCallback(() => setMemoryOpen(true), []);
  const closeMemory = useCallback(() => setMemoryOpen(false), []);


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
