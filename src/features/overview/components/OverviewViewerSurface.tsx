import React from "react";
import type { CurrentChatActiveRun } from "@/features/chats/lib/chatState";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { OverviewContentView } from "@/features/overview/components/OverviewPanel";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";

export const OverviewViewerSurface: React.FC<{ chatId: string }> = ({ chatId }) => {
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId, liveRole: "overview" });
  const snapshot = runtime.snapshot;
  const projection = snapshot?.projection;
  const activeRunId = String(snapshot?.activeRun?.runId || "").trim();
  const currentChatActiveRun: CurrentChatActiveRun | null = snapshot?.activeRun && activeRunId
    ? { ...snapshot.activeRun, chatId, runId: activeRunId, ...(snapshot.owner ? { owner: snapshot.owner } : {}) } as CurrentChatActiveRun
    : null;
  const agentKey = snapshot?.owner?.kind === "agent"
    ? snapshot.owner.agentKey
    : String(snapshot?.chat.agentKey || snapshot?.chat.firstAgentKey || "").trim();
  return (
    <IndependentSurfaceFrame
      kind="overview"
      loading={Boolean(chatId) && runtime.status === "loading"}
      error={!chatId ? t("platformError.code.invalid_request") : runtime.error}
      onRetry={chatId ? runtime.reload : undefined}
    >
      {projection ? (
        <OverviewContentView
          state={{
            artifacts: projection.artifacts,
            chatId,
            currentChatActiveRun,
            fileChanges: projection.fileChanges,
            plan: projection.plan,
            planRuntimeByTaskId: projection.planRuntimeByTaskId,
            rightSidebarOpen: true,
            streaming: Boolean(currentChatActiveRun),
            taskItemsById: projection.taskItemsById,
            timelineNodes: projection.timelineNodes,
          }}
          agentKey={agentKey}
          teamChat={snapshot?.owner?.kind === "orchestrated-team"}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
