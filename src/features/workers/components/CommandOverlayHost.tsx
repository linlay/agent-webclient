import React from "react";
import { CommandModal } from "@/features/workers/components/CommandModal";
import { CommandDrawer } from "@/features/workers/components/CommandDrawer";
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

  if (variant === "copilot") {
    return (
      <CommandDrawer
        modal={commandOverlay}
        onPatch={patchCommandOverlay}
        onClose={closeCommandOverlay}
      />
    );
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
