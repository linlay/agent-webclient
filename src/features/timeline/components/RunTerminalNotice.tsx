import React from "react";
import type { RunTerminalType } from "@/features/timeline/lib/timelineDisplay";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";

const RUN_CANCEL_NOTICE_CLASS_NAME =
  "timeline-run-cancel-notice tw:ml-6 tw:inline-flex tw:w-fit tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--ink-muted)_7%,transparent)] tw:px-2.5 tw:py-1.5 tw:text-xs tw:font-medium tw:leading-5 tw:text-ink-2";

export const RunTerminalNotice: React.FC<{
  terminalType?: RunTerminalType;
}> = ({ terminalType }) => {
  const { t } = useI18n();
  if (terminalType !== "run.cancel") return null;

  return (
    <div
      className={RUN_CANCEL_NOTICE_CLASS_NAME}
      data-run-terminal="run.cancel"
    >
      <MaterialIcon
        name="stop_circle"
        className="tw:text-base tw:text-ink-muted"
        aria-hidden="true"
      />
      <span>{t("timeline.run.interrupted")}</span>
    </div>
  );
};
