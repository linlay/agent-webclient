import React from "react";
import { MemoryInfoConsole } from "@/features/memory/components/MemoryConsole";
import { MobilePageHeaderActionProvider } from "@/shared/ui/MobilePageHeaderAction";

/** Global overlay shell for the Memory domain console. */
export const MemoryModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
}> = ({ open = true, onClose, mobile = false }) =>
  mobile ? (
    <MobilePageHeaderActionProvider>
      <MemoryInfoConsole
        open={open}
        mobile
        surface="drawer"
        onClose={onClose}
      />
    </MobilePageHeaderActionProvider>
  ) : (
    <MemoryInfoConsole
      open={open}
      surface="modal"
      onClose={onClose}
    />
  );
