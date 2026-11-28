import React from "react";
import { MemoryModal } from "@/features/memory/components/MemoryModal";
import {
  useMemoryOverlayActions,
  useMemoryOverlayState,
} from "@/features/memory/components/MemoryOverlayProvider";

export const MemoryOverlayHost: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => {
  const { isMemoryOpen } = useMemoryOverlayState();
  const { closeMemory } = useMemoryOverlayActions();
  return isMemoryOpen ? <MemoryModal open mobile={mobile} onClose={closeMemory} /> : null;
};
