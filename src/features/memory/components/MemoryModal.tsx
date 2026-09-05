import React from "react";
import { MemoryInfoConsole } from "@/features/memory/components/MemoryConsole";

/** Settings-embedded shell for the Memory domain console. */
export const MemoryModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
}> = ({ open = true, onClose }) => (
  <MemoryInfoConsole open={open} surface="modal" onClose={onClose} />
);
