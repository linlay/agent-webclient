import React from "react";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import styles from "./SelectionExplainSurface.module.css";

type SelectionExplainSurfaceProps = { chatId: string; runId: string; embedded?: boolean };

const DesktopSelectionExplainSurface: React.FC<SelectionExplainSurfaceProps> = ({
  chatId,
  runId,
  embedded = false,
}) => {
  const { t } = useI18n();
  const chatRuntime = useChatSurfaceReplay({ chatId });
  const runtime = useStandaloneBtwRuntime({
    chatId,
    initialRunId: runId,
    transportPurpose: "selection-explain",
    owner: chatRuntime.snapshot?.owner || null,
  });
  const invalid = !chatId || !runId;
  const missingOwner = chatRuntime.status === "ready" && !chatRuntime.snapshot?.owner;

  return (
    <IndependentSurfaceFrame
      kind="selection-explain"
      embedded={embedded}
      flushContent
      loading={!invalid && chatRuntime.status === "loading"}
      error={invalid || missingOwner
        ? t("platformError.code.invalid_request")
        : chatRuntime.error}
    >
      <section className={`selection-explain-page ${styles["selection-explain-page"]}`}>
        <BtwTabView
          parentChatId={chatId}
          session={runtime.session}
          onSend={runtime.send}
          onDraftChange={runtime.setDraft}
          onRemoveDraftSelection={() => undefined}
          onInterrupt={runtime.interrupt}
          onNewBranch={runtime.newBranch}
          onPatchTimelineNode={runtime.patchTimelineNode}
        />
      </section>
    </IndependentSurfaceFrame>
  );
};

export const SelectionExplainSurface: React.FC<SelectionExplainSurfaceProps> = (props) => {
  const { t } = useI18n();
  if (!isDesktopAppMode()) {
    return <IndependentSurfaceFrame kind="selection-explain" embedded={props.embedded} error={t("selection.explain.desktopOnly")} />;
  }
  return <DesktopSelectionExplainSurface {...props} />;
};
