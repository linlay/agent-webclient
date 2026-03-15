import React from "react";
import type { PendingSteer } from "../../context/types";
import { UiButton } from "../ui/UiButton";

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
							<span className="steer-preview-status">
								等待 request.steer
							</span>
						</div>
						<span className="steer-preview-text">
							{steer.message}
						</span>
					</div>
				))}
				{hasSteerDraft && (
					<div className="steer-preview">
						<div className="steer-preview-header">
							<span className="steer-preview-label">
								待提交引导
							</span>
						</div>
						<span className="steer-preview-text">
							{steerDraft}
						</span>
					</div>
				)}
			</div>
			{hasSteerDraft && (
				<div className="steer-preview-actions">
					<UiButton
						className="steer-btn"
						variant="primary"
						size="sm"
						disabled={!steerDraft.trim() || steerSubmitting}
						onClick={onSubmit}
					>
						{steerSubmitting ? "提交中..." : "引导"}
					</UiButton>
					<UiButton
						className="steer-cancel-btn"
						variant="ghost"
						size="sm"
						disabled={steerSubmitting}
						onClick={onCancel}
					>
						取消
					</UiButton>
				</div>
			)}
		</div>
	);
};
