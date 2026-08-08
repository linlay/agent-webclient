import React from "react";
import { Modal } from "antd";
import type { Chat } from "@/app/state/navigationTypes";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { buildProjectRoute, type ProjectRouteState } from "@/features/project/lib/projectRoute";

export const ProjectWorkspaceDialog: React.FC<{
  open: boolean;
  agentKey: string;
  agentName?: string;
  chats?: Chat[];
  chatId?: string;
  runId?: string;
  invalidationKey?: string | number;
  invalidationPaths?: string[];
  onClose: () => void;
}> = ({ open, agentKey, agentName, chats, chatId, runId, invalidationKey, invalidationPaths, onClose }) => {
  const [state, setState] = React.useState<ProjectRouteState>({ agentKey, chatId, runId, view: "content" });

  React.useEffect(() => {
    if (open) setState({ agentKey, chatId, runId, view: "content" });
  }, [agentKey, chatId, open, runId]);

  return (
    <Modal
      open={open}
      footer={null}
      width="90vw"
      className="project-workspace-modal"
      destroyOnHidden
      onCancel={onClose}
    >
      <ProjectWorkspace
        agentKey={agentKey}
        agentName={agentName}
        chats={chats}
        chatId={chatId}
        runId={runId}
        invalidationKey={invalidationKey}
        invalidationPaths={invalidationPaths}
        onStateChange={setState}
        onOpenFullPage={(next) => {
          window.open(buildProjectRoute({ ...state, ...next }), "_blank", "noopener,noreferrer");
        }}
      />
    </Modal>
  );
};
