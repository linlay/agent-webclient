import React from "react";
import type { PendingSteer } from "../../context/types";
import { UiButton } from "../ui/UiButton";
import { Button, Flex } from "antd";
import { SteerIcon } from "../timeline/TimelineRow";

export const SteerBar: React.FC<{
  pendingSteers: PendingSteer[];
  steerDraft: string;
  steerSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ pendingSteers, steerDraft, steerSubmitting, onSubmit, onCancel }) => {
  const hasSteerDraft = Boolean(String(steerDraft || "").trim());

  return (
    <div className="steer-bar">
      <div className="steer-queue" aria-live="polite">
        {pendingSteers.map((steer, index) => (
          <div key={steer.steerId} className="steer-preview is-pending">
            <div className="steer-preview-header">
              <span className="steer-preview-label">
                待生效引导 {index + 1}
              </span>
              <span className="steer-preview-status">等待 request.steer</span>
            </div>
            <span className="steer-preview-text">{steer.message}</span>
          </div>
        ))}
        {hasSteerDraft && (
          <div className="steer-preview steer-preview-draft">
            <div className="node-icon steer-preview-icon">
              <SteerIcon />
            </div>
            <span className="steer-preview-text">{steerDraft}</span>
            <div className="steer-preview-actions">
              <Button
                size="small"
								type="primary"
								shape="round"
                disabled={!steerDraft.trim() || steerSubmitting}
                onClick={onSubmit}
              >
                {steerSubmitting ? "提交中..." : "引导"}
              </Button>
              <Button
                size="small"
                type="text"
								shape="round"
                disabled={steerSubmitting}
                onClick={onCancel}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
