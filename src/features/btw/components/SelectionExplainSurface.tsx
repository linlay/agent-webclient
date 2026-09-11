import React, { useMemo } from "react";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
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
  const latestAnswer = useMemo(() => {
    for (let index = runtime.session.projection.timelineOrder.length - 1; index >= 0; index -= 1) {
      const node = runtime.session.projection.timelineNodes.get(
        runtime.session.projection.timelineOrder[index],
      );
      if (node?.kind === "content" && String(node.text || "").trim()) {
        return String(node.text || "");
      }
    }
    return "";
  }, [runtime.session.projection]);
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
        <header className={`selection-explain-header ${styles["selection-explain-header"]}`}>
          <strong>{t("selection.explain.title")}</strong>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!latestAnswer}
            aria-label={t("selection.explain.copy")}
            title={t("selection.explain.copy")}
            onClick={() => void copyText(latestAnswer)}
          >
            <MaterialIcon name="content_copy" />
          </UiButton>
        </header>
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
