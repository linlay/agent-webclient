import React from "react";
import { CommandModal } from "@/features/command-center/components/CommandModal";
import { CommandDrawer } from "@/features/command-center/components/CommandDrawer";
import {
  useCommandOverlayActions,
  useCommandOverlayHostState,
} from "@/features/command-center/components/CommandOverlayProvider";

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
