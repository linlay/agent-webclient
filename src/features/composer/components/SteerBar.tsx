import React from "react";
import type { PendingSteer } from "@/app/state/types";
import { Button, Typography } from "antd";
import { SteerIcon } from "@/features/timeline/components/TimelineRow";
import { useI18n } from "@/shared/i18n";

const STEER_BAR_CLASS =
  "steer-bar tw:mx-5 tw:flex tw:flex-col tw:items-stretch tw:gap-2";
const STEER_QUEUE_CLASS =
  "steer-queue tw:flex tw:flex-col tw:rounded-t-xl tw:border tw:border-b-0 tw:border-[color-mix(in_srgb,var(--line-soft)_96%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_98%,transparent)]";
const STEER_PREVIEW_CLASS =
  "steer-preview steer-preview-draft tw:flex tw:gap-2 tw:px-3 tw:pb-[9px] tw:pt-2 tw:text-xs tw:text-ink-1";
const STEER_PREVIEW_ICON_CLASS = "node-icon steer-preview-icon tw:mt-1.5";
const STEER_PREVIEW_TEXT_CLASS =
  "steer-preview-text tw:mt-1.5 tw:flex-1";
const STEER_PREVIEW_ACTIONS_CLASS =
  "steer-preview-actions tw:flex tw:gap-1 tw:[&_button]:text-xs";
const STEER_PRIMARY_BUTTON_CLASS = "steer-primary-btn tw:!bg-bg-base";

export const SteerBar: React.FC<{
  pendingSteers: PendingSteer[];
  steerSubmitting: boolean;
  onSubmit: (steerId: string) => void;
  onCancel: (steerId: string) => void;
}> = ({ pendingSteers, steerSubmitting, onSubmit, onCancel }) => {
  const { t } = useI18n();

  if (pendingSteers.length === 0) return null;

  return (
    <div className={STEER_BAR_CLASS}>
      <div className={STEER_QUEUE_CLASS} aria-live="polite">
        {pendingSteers.map((steer) => {
          const isSending = steer.status === "sending";
          return (
            <div
              key={steer.steerId}
              className={STEER_PREVIEW_CLASS}
              aria-busy="true"
            >
              <div className={STEER_PREVIEW_ICON_CLASS}>
                <SteerIcon />
              </div>
              <Typography.Text className={STEER_PREVIEW_TEXT_CLASS} ellipsis={{tooltip: steer.message}}>{steer.message}</Typography.Text>
              <div className={STEER_PREVIEW_ACTIONS_CLASS}>
                <Button
                  size="small"
                  type="text"
                  className={STEER_PRIMARY_BUTTON_CLASS}
                  shape="round"
                  loading={isSending && steerSubmitting}
                  disabled={isSending}
                  onClick={() => onSubmit(steer.steerId)}
                >
                  {t("composer.steer.submit")}
                </Button>
                <Button
                  size="small"
                  type="text"
                  shape="round"
                  disabled={isSending}
                  onClick={() => onCancel(steer.steerId)}
                >
                  {t("composer.steer.cancel")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
