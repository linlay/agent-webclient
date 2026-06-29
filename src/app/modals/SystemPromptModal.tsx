import React from "react";
import { Modal } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type {
	SystemPromptCall,
	SystemPromptLoadState,
} from "@/app/modals/lib/systemPromptTrace";

interface SystemPromptModalProps {
	calls: SystemPromptCall[];
	loadStates: Record<string, SystemPromptLoadState>;
	open: boolean;
	selectedCallId: string;
	onClose: () => void;
	onSelectCall: (callId: string) => void;
}

function callMetaText(call: SystemPromptCall): string {
	return [call.modelLabel, call.status, call.traceFile].filter(Boolean).join(" · ");
}

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
	calls,
	loadStates,
	open,
	selectedCallId,
	onClose,
	onSelectCall,
}) => {
	const { t } = useI18n();
	if (!open) {
		return null;
	}

	const selectedCall = calls.find((call) => call.id === selectedCallId) || calls[0];
	const selectedState = selectedCall
		? loadStates[selectedCall.id] || { status: "idle" }
		: { status: "empty" as const };

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			destroyOnHidden
			getContainer={false}
			width="min(78vw, 980px)"
			className="event-popover-system-modal"
			title={t("eventPopover.systemPromptModal.title")}
		>
			<div className="event-popover-system-card">
				<div className="event-popover-system-body">
					{calls.length > 1 ? (
						<div className="event-popover-system-shell">
							<div
								className="event-popover-system-call-list"
								aria-label={t("eventPopover.systemPromptModal.calls")}
							>
								{calls.map((call, index) => (
									<UiButton
										key={call.id}
										variant="ghost"
										size="sm"
										active={call.id === selectedCall?.id}
										className="event-popover-system-call"
										onClick={() => onSelectCall(call.id)}
									>
										<span className="event-popover-system-call-title">
											{call.title || t("eventPopover.systemPromptModal.callTitle", { index: index + 1 })}
										</span>
										<span className="event-popover-system-call-meta">
											{callMetaText(call) || t("eventPopover.systemPromptModal.callMetaFallback")}
										</span>
									</UiButton>
								))}
							</div>
							<div className="event-popover-system-detail">
								{renderSystemPromptContent(selectedState, t)}
							</div>
						</div>
					) : (
						renderSystemPromptContent(selectedState, t)
					)}
				</div>
			</div>
		</Modal>
	);
};

function renderSystemPromptContent(
	state: SystemPromptLoadState,
	t: (key: string, params?: Record<string, unknown>) => string,
): React.ReactNode {
	if (state.status === "ready") {
		return <pre className="event-popover-system-text">{state.text}</pre>;
	}
	if (state.status === "loading") {
		return (
			<div className="event-popover-system-status">
				<MaterialIcon name="progress_activity" />
				<span>{t("eventPopover.systemPromptModal.loading")}</span>
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className="event-popover-system-status is-error">
				<MaterialIcon name="error" />
				<span>
					{t("eventPopover.systemPromptModal.error", { message: state.message })}
				</span>
			</div>
		);
	}
	return (
		<div className="event-popover-system-status">
			<MaterialIcon name="info" />
			<span>{t("eventPopover.systemPromptModal.empty")}</span>
		</div>
	);
}
