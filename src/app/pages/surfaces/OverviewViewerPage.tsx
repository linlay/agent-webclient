import React from "react";
import { useParams } from "react-router-dom";
import type { CurrentChatActiveRun } from "@/app/state/types";
import { OverviewContentView } from "@/app/layout/sidebar/right/OverviewTab";
import { useChatSurfaceReplay } from "@/features/surfaces/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export const OverviewViewerPage: React.FC = () => {
  const { chatId: routeChatId } = useParams<{ chatId: string }>();
  const chatId = String(routeChatId || "").trim();
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId, liveRole: "overview" });
  const snapshot = runtime.snapshot;
  const projection = snapshot?.projection;
  const activeRunId = String(snapshot?.activeRun?.runId || "").trim();
  const currentChatActiveRun: CurrentChatActiveRun | null =
    snapshot?.activeRun && activeRunId
      ? {
          ...snapshot.activeRun,
          chatId,
          runId: activeRunId,
          ...(snapshot.owner ? { owner: snapshot.owner } : {}),
        } as CurrentChatActiveRun
      : null;
  const agentKey = snapshot?.owner?.kind === "agent"
    ? snapshot.owner.agentKey
    : String(snapshot?.chat.agentKey || snapshot?.chat.firstAgentKey || "").trim();
  const teamChat = snapshot?.owner?.kind === "orchestrated-team";

  return (
    <IndependentSurfaceFrame
      kind="overview"
      title={t("copilot.panel.overview")}
      identity={chatId}
      loading={Boolean(chatId) && runtime.status === "loading"}
      error={!chatId ? t("platformError.code.invalid_request") : runtime.error}
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
          teamChat={teamChat}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
