import React from "react";
import type { PendingSteer } from "@/app/state/types";
import { Button, Typography } from "antd";
import { SteerIcon } from "@/features/timeline/components/TimelineRow";
import { useI18n } from "@/shared/i18n";

export const SteerBar: React.FC<{
  pendingSteers: PendingSteer[];
  steerDraft: string;
  steerSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ pendingSteers, steerDraft, steerSubmitting, onSubmit, onCancel }) => {
  const { t } = useI18n();
  const hasSteerDraft = Boolean(String(steerDraft || "").trim());

  return (
    <div className="steer-bar">
      <div className="steer-queue" aria-live="polite">
        {pendingSteers.map((steer) => (
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
                loading
              >
                {t("composer.steer.submit")}
              </Button>
              <Button size="small" type="text" shape="round" disabled>
                {t("composer.steer.cancel")}
              </Button>
            </div>
          </div>
        ))}
        {hasSteerDraft && (
          <div className="steer-preview steer-preview-draft">
            <div className="node-icon steer-preview-icon">
              <SteerIcon />
            </div>
            <Typography.Text className="steer-preview-text" ellipsis={{tooltip: steerDraft}}>{steerDraft}</Typography.Text>
            <div className="steer-preview-actions">
              <Button
                size="small"
                type="text"
                shape="round"
                className="steer-primary-btn"
                loading={steerSubmitting}
                disabled={!steerDraft.trim()}
                onClick={onSubmit}
              >
                {t("composer.steer.submit")}
              </Button>
              <Button
                size="small"
                type="text"
                shape="round"
                disabled={steerSubmitting}
                onClick={onCancel}
              >
                {t("composer.steer.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
