import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  createCommandOverlayState,
  type CommandOverlayOpenOptions,
  type CommandOverlayState,
} from "@/features/workers/lib/commandOverlay";

interface CommandOverlayActions {
  openCommandOverlay: (options: CommandOverlayOpenOptions) => void;
  patchCommandOverlay: (patch: Partial<CommandOverlayState>) => void;
  closeCommandOverlay: (restoreComposerFocus?: boolean) => void;
}

const closedOverlay = createCommandOverlayState();

const defaultActions: CommandOverlayActions = {
  openCommandOverlay: () => undefined,
  patchCommandOverlay: () => undefined,
  closeCommandOverlay: () => undefined,
};

const CommandOverlayActionsContext =
  createContext<CommandOverlayActions>(defaultActions);
const CommandOverlayStateContext =
  createContext<CommandOverlayState>(closedOverlay);
const CommandOverlayOpenContext = createContext(false);

export const CommandOverlayProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [commandOverlay, setCommandOverlay] =
    useState<CommandOverlayState>(closedOverlay);

  const openCommandOverlay = useCallback(
    (options: CommandOverlayOpenOptions) => {
      setCommandOverlay(createCommandOverlayState(options));
    },
    [],
  );

  const patchCommandOverlay = useCallback(
    (patch: Partial<CommandOverlayState>) => {
      setCommandOverlay((current) =>
        current.open
          ? {
              ...current,
              ...patch,
              open: true,
            }
          : current,
      );
    },
    [],
  );

  const closeCommandOverlay = useCallback(
    (restoreComposerFocus = true) => {
      setCommandOverlay((current) => {
        if (!current.open && !current.type) return current;
        return createCommandOverlayState();
      });
      if (restoreComposerFocus && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("agent:focus-composer"));
      }
    },
    [],
  );

  const actionsValue = useMemo(
    () => ({
      openCommandOverlay,
      patchCommandOverlay,
      closeCommandOverlay,
    }),
    [closeCommandOverlay, openCommandOverlay, patchCommandOverlay],
  );

  return (
    <CommandOverlayActionsContext.Provider value={actionsValue}>
      <CommandOverlayOpenContext.Provider value={commandOverlay.open}>
        <CommandOverlayStateContext.Provider value={commandOverlay}>
          {children}
        </CommandOverlayStateContext.Provider>
      </CommandOverlayOpenContext.Provider>
    </CommandOverlayActionsContext.Provider>
  );
};

export function useCommandOverlayActions(): CommandOverlayActions {
  return useContext(CommandOverlayActionsContext);
}

export function useCommandOverlayHostState(): CommandOverlayState {
  return useContext(CommandOverlayStateContext);
}

export function useCommandOverlayOpen(): boolean {
  return useContext(CommandOverlayOpenContext);
}
