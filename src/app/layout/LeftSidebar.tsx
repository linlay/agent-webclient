import React from "react";
import { useCommandOverlayActions } from "@/features/command-center/components/CommandOverlayProvider";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import { WorkerNavigator } from "@/features/workers/components/WorkerNavigator";

export {
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
} from "@/features/workers/lib/agentCreate";
export { handleCreateAgentSuccess } from "@/features/workers/hooks/useAgentProjectCreate";

export const LeftSidebar: React.FC = () => {
  const { openCommandOverlay } = useCommandOverlayActions();
  const { openOverlay } = useSettingsOverlayActions();
  return (
    <WorkerNavigator
      onOpenCommand={(type) => openCommandOverlay({ type })}
      onOpenSettings={openOverlay}
    />
  );
};
