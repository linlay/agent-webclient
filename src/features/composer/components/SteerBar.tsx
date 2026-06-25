import React from "react";
import type { PendingSteer } from "@/app/state/types";
import { Button, Typography } from "antd";
import { SteerIcon } from "@/features/timeline/components/TimelineRow";
import { useI18n } from "@/shared/i18n";

export const SteerBar: React.FC<{
  pendingSteers: PendingSteer[];
  steerSubmitting: boolean;
  onSubmit: (steerId: string) => void;
  onCancel: (steerId: string) => void;
}> = ({ pendingSteers, steerSubmitting, onSubmit, onCancel }) => {
  const { t } = useI18n();

  if (pendingSteers.length === 0) return null;

  return (
    <div className="steer-bar">
      <div className="steer-queue" aria-live="polite">
        {pendingSteers.map((steer) => {
          const isSending = steer.status === "sending";
          return (
            <div
              key={steer.steerId}
              className="steer-preview steer-preview-draft"
              aria-busy="true"
            >
              <div className="node-icon steer-preview-icon">
                <SteerIcon />
              </div>
              <Typography.Text className="steer-preview-text" ellipsis={{tooltip: steer.message}}>{steer.message}</Typography.Text>
              <div className="steer-preview-actions">
                <Button
                  size="small"
                  type="text"
                  className="steer-primary-btn"
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
