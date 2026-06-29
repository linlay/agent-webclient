import React from "react";
import { CommandModal } from "@/features/workers/components/CommandModal";
import {
  useCommandOverlayActions,
  useCommandOverlayHostState,
} from "@/features/workers/components/CommandOverlayProvider";

export const CommandOverlayHost: React.FC<{
  variant?: "default" | "copilot";
}> = ({ variant = "default" }) => {
  const commandOverlay = useCommandOverlayHostState();
  const { patchCommandOverlay, closeCommandOverlay } =
    useCommandOverlayActions();

  if (!commandOverlay.open || !commandOverlay.type) {
    return null;
  }

  return (
    <CommandModal
      modal={commandOverlay}
      onPatch={patchCommandOverlay}
      onClose={closeCommandOverlay}
      variant={variant}
    />
  );
};
