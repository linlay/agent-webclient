import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

interface GlobalSearchActions {
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
}

const defaultActions: GlobalSearchActions = {
  openGlobalSearch: () => undefined,
  closeGlobalSearch: () => undefined,
};

const GlobalSearchActionsContext = createContext<GlobalSearchActions>(defaultActions);
const GlobalSearchOpenContext = createContext(false);

export const GlobalSearchOverlayProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [open, setOpen] = useState(false);

  const openGlobalSearch = useCallback(() => setOpen(true), []);
  const closeGlobalSearch = useCallback(() => setOpen(false), []);

  const actionsValue = useMemo(
    () => ({ openGlobalSearch, closeGlobalSearch }),
    [closeGlobalSearch, openGlobalSearch],
  );

  return (
    <GlobalSearchActionsContext.Provider value={actionsValue}>
      <GlobalSearchOpenContext.Provider value={open}>
        {children}
      </GlobalSearchOpenContext.Provider>
    </GlobalSearchActionsContext.Provider>
  );
};

export function useGlobalSearchActions(): GlobalSearchActions {
  return useContext(GlobalSearchActionsContext);
}

export function useGlobalSearchOpen(): boolean {
  return useContext(GlobalSearchOpenContext);
}
