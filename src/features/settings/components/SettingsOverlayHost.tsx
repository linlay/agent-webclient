import React from "react";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import {
  useSettingsOverlayActions,
  useSettingsOverlayState,
} from "@/features/settings/components/SettingsOverlayProvider";

export const SettingsOverlayHost: React.FC = () => {
  const { activeOverlay } = useSettingsOverlayState();
  const { closeOverlay } = useSettingsOverlayActions();

  if (activeOverlay === "settings") {
    return (
      <SettingsModal
        open
        onClose={() => closeOverlay("settings")}
      />
    );
  }

  if (activeOverlay === "memoryInfo") {
    return (
      <MemoryInfoModal
        open
        onClose={() => closeOverlay("memoryInfo")}
      />
    );
  }

  return null;
};
