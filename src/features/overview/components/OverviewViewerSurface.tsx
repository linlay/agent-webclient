import React from "react";
import type { CurrentChatActiveRun } from "@/features/chats/lib/chatState";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { OverviewContentView } from "@/features/overview/components/OverviewPanel";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";
import { buildOverviewRunInfo } from "@/features/overview/lib/overviewRunInfo";
import { buildLoadedChatUsageSnapshot } from "@/features/conversation/lib/conversationPayload";

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
  const runInfo = React.useMemo(() => projection ? buildOverviewRunInfo({
    ...projection,
    chatId,
    currentChatActiveRun,
    streaming: Boolean(currentChatActiveRun),
    chat: snapshot?.chat,
    usageSnapshot: snapshot ? buildLoadedChatUsageSnapshot(chatId, {
      ...snapshot.chat,
      events: projection.events,
      activeRun: snapshot.activeRun,
    }) : null,
  }) : null, [projection, snapshot, chatId, currentChatActiveRun]);
  return (
    <IndependentSurfaceFrame
      kind="overview"
      loading={Boolean(chatId) && runtime.status === "loading"}
      error={!chatId ? t("platformError.code.invalid_request") : runtime.error}
      onRetry={chatId ? runtime.reload : undefined}
    >
      {projection && runInfo ? (
        <OverviewContentView
          runInfo={runInfo}
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
