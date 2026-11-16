import React from "react";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { SettingsDrawer } from "@/features/settings/components/SettingsDrawer";
import {
  useSettingsOverlayActions,
  useSettingsOverlayState,
} from "@/features/settings/components/SettingsOverlayProvider";

export const SettingsOverlayHost: React.FC<{
  variant?: "default" | "copilot" | "mobile";
}> = ({ variant = "default" }) => {
  const { activeOverlay } = useSettingsOverlayState();
  const { closeOverlay } = useSettingsOverlayActions();

  if (activeOverlay === "settings") {
    if (variant === "copilot" || variant === "mobile") {
      return (
        <SettingsDrawer
          open
          onClose={() => closeOverlay("settings")}
        />
      );
    }
    return (
      <SettingsModal
        open
        onClose={() => closeOverlay("settings")}
      />
    );
  }

  return null;
};
