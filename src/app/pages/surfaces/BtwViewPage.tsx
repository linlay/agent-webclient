import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import { useChatSurfaceReplay } from "@/features/surfaces/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export const BtwViewPage: React.FC = () => {
  const { chatId: routeChatId } = useParams<{ chatId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const chatId = String(routeChatId || "").trim();
  const initialBtwId = String(searchParams.get("btwId") || "").trim();
  const { t } = useI18n();
  const chatRuntime = useChatSurfaceReplay({ chatId });
  const updateBtwId = React.useCallback((btwId: string) => {
    const normalized = String(btwId || "").trim();
    if (!normalized || normalized === searchParams.get("btwId")) return;
    const next = new URLSearchParams(searchParams);
    next.set("btwId", normalized);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const runtime = useStandaloneBtwRuntime({
    chatId,
    initialBtwId,
    owner: chatRuntime.snapshot?.owner || null,
    onBtwId: updateBtwId,
  });
  const invalid = !chatId;
  const missingOwner = chatRuntime.status === "ready" && !chatRuntime.snapshot?.owner;
  return (
    <IndependentSurfaceFrame
      kind="btw"
      title={t("btw.title")}
      identity={runtime.session.btwId || chatId}
      loading={!invalid && chatRuntime.status === "loading"}
      error={invalid || missingOwner
        ? t("platformError.code.invalid_request")
        : chatRuntime.error}
    >
      <BtwTabView
        parentChatId={chatId}
        session={runtime.session}
        onSend={runtime.send}
        onDraftChange={runtime.setDraft}
        onInterrupt={runtime.interrupt}
        onNewBranch={() => {
          const created = runtime.newBranch();
          if (created) {
            const next = new URLSearchParams(searchParams);
            next.delete("btwId");
            setSearchParams(next, { replace: true });
          }
          return created;
        }}
        onPatchTimelineNode={runtime.patchTimelineNode}
      />
    </IndependentSurfaceFrame>
  );
};
