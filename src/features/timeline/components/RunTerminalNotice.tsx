import React from "react";
import type { RunTerminalType } from "@/features/timeline/lib/timelineDisplay";
import { useI18n } from "@/shared/i18n";

const RUN_CANCEL_NOTICE_CLASS_NAME =
  "timeline-run-cancel-notice tw:text-ink-muted";

export const RunTerminalNotice: React.FC<{
  terminalType?: RunTerminalType;
  duration?: string;
}> = ({ terminalType, duration }) => {
  const { t } = useI18n();
  if (terminalType !== "run.cancel") return null;

  return (
    <div
      className={RUN_CANCEL_NOTICE_CLASS_NAME}
      data-run-terminal="run.cancel"
    >
      {duration
        ? t("timeline.run.interrupted", { duration })
        : t("timeline.run.interruptedNeutral")}
    </div>
  );
};
