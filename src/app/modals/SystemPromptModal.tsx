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

const SYSTEM_PROMPT_MODAL_CLASS_NAME = "event-popover-system-modal tw:z-[80]";

const SYSTEM_PROMPT_CARD_CLASS_NAME =
	"event-popover-system-card tw:flex tw:max-h-[calc(100vh-48px)] tw:w-full tw:flex-col tw:overflow-hidden tw:p-0";

const SYSTEM_PROMPT_BODY_CLASS_NAME =
	"event-popover-system-body tw:flex tw:flex-col tw:gap-3 tw:overflow-auto tw:px-4 tw:pb-4 tw:pt-3";

const SYSTEM_PROMPT_SHELL_CLASS_NAME =
	"event-popover-system-shell tw:grid tw:min-h-0 tw:grid-cols-[minmax(190px,240px)_minmax(0,1fr)] tw:gap-3 tw:max-[760px]:grid-cols-1";

const SYSTEM_PROMPT_CALL_LIST_CLASS_NAME =
	"event-popover-system-call-list tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:max-[760px]:max-h-[150px] tw:max-[760px]:overflow-auto";

const SYSTEM_PROMPT_CALL_CLASS_NAME =
	"event-popover-system-call tw:!min-h-[54px] tw:!justify-start tw:!px-2.5 tw:!py-2 tw:text-left tw:[&_.ui-btn-label]:flex tw:[&_.ui-btn-label]:min-w-0 tw:[&_.ui-btn-label]:flex-col tw:[&_.ui-btn-label]:items-start tw:[&_.ui-btn-label]:gap-[3px]";

const SYSTEM_PROMPT_CALL_TITLE_CLASS_NAME =
	"event-popover-system-call-title tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-extrabold tw:text-ink-1";

const SYSTEM_PROMPT_CALL_META_CLASS_NAME =
	"event-popover-system-call-meta tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-[10px] tw:font-normal tw:leading-[1.35] tw:text-ink-muted";

const SYSTEM_PROMPT_DETAIL_CLASS_NAME =
	"event-popover-system-detail tw:flex tw:min-w-0 tw:flex-col";

const SYSTEM_PROMPT_STATUS_CLASS_NAME =
	"event-popover-system-status tw:flex tw:min-h-[140px] tw:items-center tw:justify-center tw:gap-2 tw:rounded-[var(--radius-md)] tw:border tw:border-dashed tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_88%,var(--bg-input))] tw:p-[18px] tw:text-center tw:text-xs tw:text-ink-muted";

const SYSTEM_PROMPT_STATUS_ERROR_CLASS_NAME =
	"is-error tw:border-[color-mix(in_srgb,var(--accent-danger)_38%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_7%,var(--bg-elev-2))] tw:text-accent-danger";

const SYSTEM_PROMPT_ERROR_STATUS_CLASS_NAME = [
	SYSTEM_PROMPT_STATUS_CLASS_NAME,
	SYSTEM_PROMPT_STATUS_ERROR_CLASS_NAME,
].join(" ");

const SYSTEM_PROMPT_TEXT_CLASS_NAME =
	"event-popover-system-text tw:m-0 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:rounded-[var(--radius-md)] tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_88%,var(--bg-input))] tw:p-3 tw:font-code tw:text-[11px] tw:font-normal tw:leading-[1.5]";

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
			className={SYSTEM_PROMPT_MODAL_CLASS_NAME}
			title={t("eventPopover.systemPromptModal.title")}
		>
			<div className={SYSTEM_PROMPT_CARD_CLASS_NAME}>
				<div className={SYSTEM_PROMPT_BODY_CLASS_NAME}>
					{calls.length > 1 ? (
						<div className={SYSTEM_PROMPT_SHELL_CLASS_NAME}>
							<div
								className={SYSTEM_PROMPT_CALL_LIST_CLASS_NAME}
								aria-label={t("eventPopover.systemPromptModal.calls")}
							>
								{calls.map((call, index) => (
									<UiButton
										key={call.id}
										variant="ghost"
										size="sm"
										active={call.id === selectedCall?.id}
										className={SYSTEM_PROMPT_CALL_CLASS_NAME}
										onClick={() => onSelectCall(call.id)}
									>
										<span className={SYSTEM_PROMPT_CALL_TITLE_CLASS_NAME}>
											{call.title || t("eventPopover.systemPromptModal.callTitle", { index: index + 1 })}
										</span>
										<span className={SYSTEM_PROMPT_CALL_META_CLASS_NAME}>
											{callMetaText(call) || t("eventPopover.systemPromptModal.callMetaFallback")}
										</span>
									</UiButton>
								))}
							</div>
							<div className={SYSTEM_PROMPT_DETAIL_CLASS_NAME}>
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
		return <pre className={SYSTEM_PROMPT_TEXT_CLASS_NAME}>{state.text}</pre>;
	}
	if (state.status === "loading") {
		return (
			<div className={SYSTEM_PROMPT_STATUS_CLASS_NAME}>
				<MaterialIcon name="progress_activity" />
				<span>{t("eventPopover.systemPromptModal.loading")}</span>
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className={SYSTEM_PROMPT_ERROR_STATUS_CLASS_NAME}>
				<MaterialIcon name="error" />
				<span>
					{t("eventPopover.systemPromptModal.error", { message: state.message })}
				</span>
			</div>
		);
	}
	return (
		<div className={SYSTEM_PROMPT_STATUS_CLASS_NAME}>
			<MaterialIcon name="info" />
			<span>{t("eventPopover.systemPromptModal.empty")}</span>
		</div>
	);
}
