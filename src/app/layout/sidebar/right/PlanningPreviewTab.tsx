import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { TimelineNode } from "@/app/state/types";
import { MarkdownContent } from "@/shared/ui/MarkdownContent";
import { t } from "@/shared/i18n";

interface PlanningPreviewTabProps {
  planningId?: string;
  nodeId?: string;
}

const PLANNING_PREVIEW_CLASS_NAME =
  "right-sidebar-planning-preview tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:overflow-hidden";

const PLANNING_PREVIEW_BODY_CLASS_NAME =
  "right-sidebar-planning-preview-body tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-3";

const PLANNING_PREVIEW_EMPTY_CLASS_NAME =
  "right-sidebar-empty tw:rounded-lg tw:border tw:border-dashed tw:border-line-soft tw:px-3 tw:py-3.5 tw:text-center tw:text-xs tw:text-ink-muted";

export const PlanningPreviewContent: React.FC<{
  node?: TimelineNode | null;
  chatId: string;
  teamChat?: boolean;
}> = ({ node, chatId, teamChat = false }) => {
  if (!node) {
    return (
      <div className={PLANNING_PREVIEW_CLASS_NAME}>
        <div className={PLANNING_PREVIEW_EMPTY_CLASS_NAME}>
          {t("rightSidebar.planningPreview.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className={PLANNING_PREVIEW_CLASS_NAME}>
      <div className={PLANNING_PREVIEW_BODY_CLASS_NAME}>
        <MarkdownContent
          content={node.text || ""}
          chatId={chatId}
          teamChat={teamChat}
        />
      </div>
    </div>
  );
};

export const PlanningPreviewTab: React.FC<PlanningPreviewTabProps> = ({
  planningId,
  nodeId,
}) => {
  const state = useAppState();
  const node = React.useMemo(() => {
    if (planningId) {
      return Array.from(state.timelineNodes.values()).find(
        (candidate) => candidate.kind === "planning" && candidate.planningId === planningId,
      );
    }
    return nodeId ? state.timelineNodes.get(nodeId) : undefined;
  }, [nodeId, planningId, state.timelineNodes]);
  const currentChat = state.chats.find((chat) => chat.chatId === state.chatId);
  const teamChat = Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  return (
    <PlanningPreviewContent
      node={node}
      chatId={state.chatId}
      teamChat={teamChat}
    />
  );
};
