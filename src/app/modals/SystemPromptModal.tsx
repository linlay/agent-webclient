import React, { useEffect, useRef, useState } from "react";
import { message, Modal } from "antd";
import {
	MaterialIcon,
	type MaterialIconName,
} from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { copyText } from "@/shared/utils/copy";
import type { SystemPromptLoadState } from "@/app/modals/lib/systemPromptTrace";

interface SystemPromptModalProps {
	loadState: SystemPromptLoadState;
	open: boolean;
	onClose: () => void;
}

const SYSTEM_PROMPT_MODAL_CLASS_NAME = "event-popover-system-modal tw:z-[80]";

const SYSTEM_PROMPT_CARD_CLASS_NAME =
	"event-popover-system-card tw:flex tw:max-h-[calc(100vh-48px)] tw:w-full tw:flex-col tw:overflow-hidden tw:p-0";

const SYSTEM_PROMPT_BODY_CLASS_NAME =
	"event-popover-system-body tw:flex tw:flex-col tw:gap-3 tw:overflow-auto tw:px-4 tw:pb-4 tw:pt-3";

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

const SYSTEM_PROMPT_TITLE_CLASS_NAME =
	"event-popover-system-title tw:flex tw:items-center tw:gap-1.5";

const SYSTEM_PROMPT_COPY_BUTTON_CLASS_NAME =
	"event-popover-system-copy-action tw:!h-5 tw:!min-h-5 tw:!min-w-5 tw:!w-5 tw:!px-0 tw:!py-0 tw:text-ink-muted tw:hover:bg-bg-hover tw:hover:text-ink-1 tw:hover:shadow-none tw:[&_.material-icon]:!text-base";

type SystemPromptCopyFeedback = "idle" | "copied" | "error";

interface SystemPromptCopyControl {
	disabled: boolean;
	feedbackMessage: string;
	icon: MaterialIconName;
	text: string;
}

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
	loadState,
	open,
	onClose,
}) => {
	const { t } = useI18n();
	const copyTimerRef = useRef<number | null>(null);
	const [copyFeedback, setCopyFeedback] =
		useState<SystemPromptCopyFeedback>("idle");
	const copyControl = resolveSystemPromptCopyControl(loadState, copyFeedback, t);

	const clearCopyFeedbackTimer = () => {
		if (copyTimerRef.current !== null) {
			window.clearTimeout(copyTimerRef.current);
			copyTimerRef.current = null;
		}
	};

	const flashCopyFeedback = (
		feedback: Exclude<SystemPromptCopyFeedback, "idle">,
	) => {
		clearCopyFeedbackTimer();
		setCopyFeedback(feedback);
		copyTimerRef.current = window.setTimeout(() => {
			setCopyFeedback("idle");
			copyTimerRef.current = null;
		}, 1600);
	};

	useEffect(() => {
		setCopyFeedback("idle");
		clearCopyFeedbackTimer();
	}, [open, loadState]);

	useEffect(() => {
		return () => clearCopyFeedbackTimer();
	}, []);

	if (!open) {
		return null;
	}

	const handleCopy = () => {
		if (copyControl.disabled) {
			return;
		}
		void copyText(copyControl.text)
			.then(() => {
				flashCopyFeedback("copied");
				message.success(t("eventPopover.systemPromptModal.copySuccess"));
			})
			.catch(() => {
				flashCopyFeedback("error");
				message.error(t("eventPopover.systemPromptModal.copyFailed"));
			});
	};

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			destroyOnHidden
			getContainer={false}
			width="min(78vw, 980px)"
			className={SYSTEM_PROMPT_MODAL_CLASS_NAME}
			title={
				<div className={SYSTEM_PROMPT_TITLE_CLASS_NAME}>
					<span>{t("eventPopover.systemPromptModal.title")}</span>
					<UiButton
						className={SYSTEM_PROMPT_COPY_BUTTON_CLASS_NAME}
						variant="ghost"
						size="sm"
						iconOnly
						disabled={copyControl.disabled}
						aria-label={t("eventPopover.systemPromptModal.copy")}
						aria-describedby="system-prompt-copy-feedback"
						title={copyControl.feedbackMessage}
						onClick={handleCopy}
					>
						<MaterialIcon name={copyControl.icon} />
					</UiButton>
					<span
						id="system-prompt-copy-feedback"
						className="tw:sr-only"
						role="status"
					>
						{copyFeedback === "idle" ? "" : copyControl.feedbackMessage}
					</span>
				</div>
			}
		>
			<div className={SYSTEM_PROMPT_CARD_CLASS_NAME}>
				<div className={SYSTEM_PROMPT_BODY_CLASS_NAME}>
					{renderSystemPromptContent(loadState, t)}
				</div>
			</div>
		</Modal>
	);
};

function resolveSystemPromptCopyControl(
	loadState: SystemPromptLoadState,
	feedback: SystemPromptCopyFeedback,
	t: (key: string, params?: Record<string, unknown>) => string,
): SystemPromptCopyControl {
	const text = loadState.status === "ready" ? loadState.text : "";
	const disabled = !text.trim();
	if (feedback === "copied") {
		return {
			disabled,
			feedbackMessage: t("eventPopover.systemPromptModal.copySuccess"),
			icon: "check",
			text,
		};
	}
	if (feedback === "error") {
		return {
			disabled,
			feedbackMessage: t("eventPopover.systemPromptModal.copyFailed"),
			icon: "content_copy",
			text,
		};
	}
	return {
		disabled,
		feedbackMessage: t("eventPopover.systemPromptModal.copy"),
		icon: "content_copy",
		text,
	};
}

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

export const __TEST_ONLY__ = {
	resolveSystemPromptCopyControl,
};
