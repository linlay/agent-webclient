import React from "react";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type {
	PromptAnalysisCall,
	PromptAnalysisLoadState,
} from "@/app/modals/lib/promptAnalysis";
import type { InjectedPromptPayloads } from "@/app/modals/lib/eventPopoverFormatters";

interface PromptAnalysisModalProps {
	calls: PromptAnalysisCall[];
	loadStates: Record<string, PromptAnalysisLoadState>;
	open: boolean;
	selectedCallId: string;
	onClose: () => void;
	onSelectCall: (callId: string) => void;
}

function promptSectionTitle(
	label: string,
	tokens: number,
	tokenLabel: string,
): string {
	return tokens > 0 ? `${label} (${tokens} ${tokenLabel})` : label;
}

function promptRoundLabel(roundNumber?: number): string {
	return roundNumber && roundNumber > 0 ? `Round ${roundNumber}` : "";
}

function callMetaText(call: PromptAnalysisCall): string {
	return [call.modelLabel, call.status, call.traceFile].filter(Boolean).join(" · ");
}

export const PromptAnalysisModal: React.FC<PromptAnalysisModalProps> = ({
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
	const selectedPayload =
		selectedCall?.inlinePayload ||
		(selectedState.status === "ready" ? selectedState.payload : null);
	const subtitle =
		calls.length > 1
			? t("eventPopover.promptModal.subtitleRun", { count: calls.length })
			: t("eventPopover.promptModal.subtitleCall");

	return (
		<div
			className="modal event-popover-prompt-modal"
			id="event-popover-prompt-modal"
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				className="modal-card event-popover-prompt-card"
				role="dialog"
				aria-modal="true"
				aria-labelledby="event-popover-prompt-title"
			>
				<div className="event-popover-prompt-head">
					<div>
						<h3 id="event-popover-prompt-title">
							{t("eventPopover.promptModal.title")}
						</h3>
						<p>{subtitle}</p>
					</div>
					<UiButton
						variant="ghost"
						size="sm"
						iconOnly
						aria-label={t("eventPopover.promptModal.close")}
						title={t("eventPopover.promptModal.close")}
						onClick={onClose}
					>
						<MaterialIcon name="close" />
					</UiButton>
				</div>
				<div className="event-popover-prompt-body">
					{calls.length > 1 ? (
						<div className="event-popover-prompt-shell">
							<div
								className="event-popover-prompt-call-list"
								aria-label={t("eventPopover.promptModal.calls")}
							>
								{calls.map((call, index) => (
									<UiButton
										key={call.id}
										variant="ghost"
										size="sm"
										active={call.id === selectedCall?.id}
										className="event-popover-prompt-call"
										onClick={() => onSelectCall(call.id)}
									>
										<span className="event-popover-prompt-call-title">
											{call.title || t("eventPopover.promptModal.callTitle", { index: index + 1 })}
										</span>
										<span className="event-popover-prompt-call-meta">
											{callMetaText(call) || t("eventPopover.promptModal.callMetaFallback")}
										</span>
									</UiButton>
								))}
							</div>
							<div className="event-popover-prompt-detail">
								{renderPromptAnalysisContent(selectedPayload, selectedState, t)}
							</div>
						</div>
					) : (
						renderPromptAnalysisContent(selectedPayload, selectedState, t)
					)}
				</div>
			</div>
		</div>
	);
};

function renderPromptAnalysisContent(
	payload: InjectedPromptPayloads | null,
	state: PromptAnalysisLoadState,
	t: (key: string, params?: Record<string, unknown>) => string,
): React.ReactNode {
	if (payload) {
		return renderPromptPayload(payload, t);
	}
	if (state.status === "loading") {
		return (
			<div className="event-popover-prompt-status">
				<MaterialIcon name="progress_activity" />
				<span>{t("eventPopover.promptModal.loading")}</span>
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className="event-popover-prompt-status is-error">
				<MaterialIcon name="error" />
				<span>
					{t("eventPopover.promptModal.error", { message: state.message })}
				</span>
			</div>
		);
	}
	return (
		<div className="event-popover-prompt-status">
			<MaterialIcon name="info" />
			<span>{t("eventPopover.promptModal.empty")}</span>
		</div>
	);
}

function renderPromptPayload(
	payload: InjectedPromptPayloads,
	t: (key: string, params?: Record<string, unknown>) => string,
): React.ReactNode {
	return (
		<>
			<section className="event-popover-prompt-section">
				<strong>{t("eventPopover.promptModal.summary")}</strong>
				<div className="event-popover-prompt-summary">
					<span className="event-popover-prompt-chip">
						{promptSectionTitle(
							t("eventPopover.promptModal.systemPrompt"),
							payload.systemPromptTokens,
							t("eventPopover.promptModal.tokens"),
						)}
					</span>
					<span className="event-popover-prompt-chip">
						{promptSectionTitle(
							t("eventPopover.promptModal.historyMessages"),
							payload.historyMessagesTokens,
							t("eventPopover.promptModal.tokens"),
						)}
					</span>
					<span className="event-popover-prompt-chip">
						{promptSectionTitle(
							t("eventPopover.promptModal.currentUserMessage"),
							payload.currentUserMessageTokens,
							t("eventPopover.promptModal.tokens"),
						)}
					</span>
					<span className="event-popover-prompt-chip">
						{promptSectionTitle(
							t("eventPopover.promptModal.providerMessages"),
							payload.providerMessagesTokens,
							t("eventPopover.promptModal.tokens"),
						)}
					</span>
				</div>
			</section>
			<section className="event-popover-prompt-section">
				<strong>
					{t("eventPopover.promptModal.entries", {
						count: payload.entries.length,
					})}
				</strong>
				<div className="event-popover-prompt-entries">
					{payload.entries.map((entry) => (
						<details key={entry.id} className="event-popover-prompt-entry">
							<summary>
								<span className="event-popover-prompt-entry-heading">
									<span className="event-popover-prompt-entry-title">
										{entry.title}
									</span>
									<span className="event-popover-prompt-entry-tags">
										{entry.roundNumber ? (
											<span className="event-popover-prompt-tag event-popover-prompt-tag-round">
												{promptRoundLabel(entry.roundNumber)}
											</span>
										) : null}
										<span
											className={`event-popover-prompt-tag event-popover-prompt-tag-role event-popover-prompt-tag-role-${entry.role || "unknown"}`}
										>
											{entry.role || "unknown"}
										</span>
										<span className="event-popover-prompt-tag event-popover-prompt-tag-token">
											{entry.tokens > 0
												? `${entry.tokens} ${t("eventPopover.promptModal.tokens")}`
												: t("eventPopover.promptModal.tokens")}
										</span>
									</span>
								</span>
							</summary>
							<pre>{entry.contentText}</pre>
							<details className="event-popover-prompt-raw">
								<summary>{t("eventPopover.promptModal.rawJson")}</summary>
								<pre>{entry.rawJsonText}</pre>
							</details>
						</details>
					))}
				</div>
			</section>
			<details className="event-popover-prompt-entry">
				<summary>
					<span className="event-popover-prompt-entry-title">
						{t("eventPopover.promptModal.rawPayload")}
					</span>
				</summary>
				<pre>{payload.rawJsonText}</pre>
			</details>
		</>
	);
}
