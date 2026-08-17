import React from "react";
import { useParams } from "react-router-dom";
import { DebugPanelContent } from "@/app/layout/sidebar/right/DebugTab";
import { useChatSurfaceReplay } from "@/features/surfaces/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export const DebugViewPage: React.FC = () => {
  const { chatId: routeChatId } = useParams<{ chatId: string }>();
  const chatId = String(routeChatId || "").trim();
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId, liveRole: "debug" });
  const agentKey = runtime.snapshot?.owner?.kind === "agent"
    ? runtime.snapshot.owner.agentKey
    : String(
        runtime.snapshot?.chat.agentKey ||
        runtime.snapshot?.chat.firstAgentKey ||
        "",
      ).trim();
  const chatAgentKeyById = React.useMemo(
    () => new Map(chatId && agentKey ? [[chatId, agentKey]] : []),
    [agentKey, chatId],
  );
  const shareId = String(
    (runtime.snapshot?.chat as Record<string, unknown> | undefined)?.shareId || "",
  ).trim();
  const chatShareIdById = React.useMemo(
    () => new Map(chatId && shareId ? [[chatId, shareId]] : []),
    [chatId, shareId],
  );
  return (
    <IndependentSurfaceFrame
      kind="debug"
      title={t("copilot.panel.debug")}
      identity={chatId}
      loading={Boolean(chatId) && runtime.status === "loading"}
      error={!chatId ? t("platformError.code.invalid_request") : runtime.error}
    >
      {runtime.snapshot ? (
        <DebugPanelContent
          independentDetails
          events={runtime.snapshot.projection.debugEvents}
          fallbackAgentKey={agentKey}
          chatAgentKeyById={chatAgentKeyById}
          chatShareIdById={chatShareIdById}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
