import React from "react";
import { Modal } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
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

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
	loadState,
	open,
	onClose,
}) => {
	const { t } = useI18n();
	if (!open) {
		return null;
	}

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
					{renderSystemPromptContent(loadState, t)}
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
