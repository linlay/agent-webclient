import React from "react";
import type { RunTerminalType } from "@/features/timeline/lib/timelineDisplay";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { Divider, Flex } from "antd";

const RUN_CANCEL_NOTICE_CLASS_NAME =
  "timeline-run-cancel-notice tw:text-ink-muted tw:text-[13px]";

export const RunTerminalNotice: React.FC<{
  terminalType?: RunTerminalType;
}> = ({ terminalType }) => {
  const { t } = useI18n();
  if (terminalType !== "run.cancel") return null;

  return (
    <Flex
      className={RUN_CANCEL_NOTICE_CLASS_NAME}
      gap={4}
      align="center"
      data-run-terminal="run.cancel"
    >
      <MaterialIcon
        name="pause_circle"
        className="tw:text-[16px]"
        aria-hidden="true"
      />
      <span>{t("timeline.run.interrupted")}</span>
      <Divider type="vertical" />
    </Flex>
  );
};
