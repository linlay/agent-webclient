import React from "react";
import type { PendingSteer } from "../../context/types";
import { Button } from "antd";
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
        {pendingSteers.map((steer) => (
          <div
            key={steer.steerId}
            className="steer-preview steer-preview-draft"
            aria-busy="true"
          >
            <div className="node-icon steer-preview-icon">
              <SteerIcon />
            </div>
            <span className="steer-preview-text">{steer.message}</span>
            <div className="steer-preview-actions">
              <Button
                size="small"
                type="primary"
                shape="round"
                loading
                disabled
              >
                引导
              </Button>
              <Button size="small" type="text" shape="round" disabled>
                取消
              </Button>
            </div>
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
                loading={steerSubmitting}
                disabled={!steerDraft.trim() || steerSubmitting}
                onClick={onSubmit}
              >
                引导
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
