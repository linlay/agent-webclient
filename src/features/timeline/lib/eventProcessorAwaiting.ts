import type { AgentEvent } from "@/app/state/types";
import {
	getAwaitingItemMeta,
	getAwaitingQuestionMetaByQuestion,
	maskAwaitingAnswerParams,
} from "@/features/tools/lib/awaitingQuestionMeta";
import { t } from "@/shared/i18n";
import { safeText, toText } from "@/shared/utils/eventUtils";

export function maskStructuredAwaitingAnswers(event: AgentEvent): unknown {
	const runId = toText(event.runId);
	const awaitingId = toText(event.awaitingId);
	const rawRecord = event as Record<string, unknown>;
	const answers = rawRecord.answers;
	const approvals = rawRecord.approvals;
	const forms = rawRecord.forms;
	const legacyQuestions = rawRecord.questions;

	if (Array.isArray(answers)) {
		const normalizedAnswers =
			!runId || !awaitingId
				? answers
				: maskAwaitingAnswerParams(
						runId,
						awaitingId,
						answers.filter(
							(item): item is any => Boolean(item) && typeof item === "object",
						),
				  ).map((item) => {
						const meta = getAwaitingItemMeta(runId, awaitingId, item.id);
						return meta?.kind === "question"
							? {
									...item,
									header: meta.header,
									question: meta.question,
							  }
							: item;
					});
		return normalizedAnswers;
	}

	if (Array.isArray(approvals) && runId && awaitingId) {
		return approvals.map((item) => {
			if (!item || typeof item !== "object") {
				return item;
			}
			const id = toText((item as Record<string, unknown>).id);
			const meta = id ? getAwaitingItemMeta(runId, awaitingId, id) : null;
			return meta?.kind === "approval"
				? {
						...item,
						command: meta.command,
						ruleKey: meta.ruleKey,
				  }
				: item;
		});
	}

	if (Array.isArray(forms) && runId && awaitingId) {
		return forms.map((item) => {
			if (!item || typeof item !== "object") {
				return item;
			}
			const id = toText((item as Record<string, unknown>).id);
			const meta = id ? getAwaitingItemMeta(runId, awaitingId, id) : null;
			return meta?.kind === "form"
				? {
						...item,
						action: meta.action,
						title: meta.title,
				  }
				: item;
		});
	}

	if (Array.isArray(legacyQuestions) && runId && awaitingId) {
		return legacyQuestions.map((item) => {
			if (!item || typeof item !== "object") {
				return item;
			}
			const legacyQuestion = toText((item as Record<string, unknown>).question);
			const meta = legacyQuestion
				? getAwaitingQuestionMetaByQuestion(runId, awaitingId, legacyQuestion)
				: null;
			if (meta?.type !== "password") {
				return item;
			}
			return {
				...item,
				answer: "••••••",
				answers: Array.isArray((item as Record<string, unknown>).answers)
					? ((item as Record<string, unknown>).answers as unknown[]).map(
							() => "••••••",
					  )
					: undefined,
			};
		});
	}

	return legacyQuestions ?? answers ?? approvals ?? forms;
}

export function buildAwaitingAnswerEnvelope(event: AgentEvent): unknown {
	const rawRecord = event as Record<string, unknown>;
	const status = toText(rawRecord.status);
	if (status === "error") {
		const rawError = rawRecord.error;
		const error =
			rawError && typeof rawError === "object" && !Array.isArray(rawError)
				? {
						code: toText((rawError as Record<string, unknown>).code),
						message: toText((rawError as Record<string, unknown>).message),
				  }
				: undefined;
		return {
			status: "error",
			error,
		};
	}
	if (status === "answered") {
		return {
			status: "answered",
			items: maskStructuredAwaitingAnswers(event),
		};
	}
	return maskStructuredAwaitingAnswers(event);
}

export function readAwaitingAnswerText(event: AgentEvent): string {
	const rawRecord = event as Record<string, unknown>;
	return pickEventText(
		formatStructuredEventText(buildAwaitingAnswerEnvelope(event)),
		event.text,
		rawRecord.answers,
		rawRecord.approvals,
		rawRecord.forms,
		rawRecord.questions,
		event.message,
	);
}

export function awaitingAnswerTitle(event: AgentEvent): string {
	if (event.type !== "awaiting.answer") {
		return t("timeline.awaitingAnswer.submitted");
	}
	if (event.status === "answered") {
		return t("timeline.awaitingAnswer.submitted");
	}
	if (event.status !== "error") {
		return t("timeline.awaitingAnswer.submitted");
	}
	switch (event.error?.code) {
		case "user_dismissed":
			return t("timeline.awaitingAnswer.canceled");
		case "timeout":
			return t("timeline.awaitingAnswer.timeout");
		case "invalid_submit":
			return t("timeline.awaitingAnswer.submitFailed");
		default:
			return t("timeline.awaitingAnswer.error");
	}
}

function pickEventText(...candidates: Array<unknown>): string {
	for (const candidate of candidates) {
		const text = safeText(candidate);
		if (text.trim()) {
			return text;
		}
	}
	return "";
}

function formatStructuredEventText(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return "";
		}
		try {
			const parsed = JSON.parse(trimmed);
			return typeof parsed === "string"
				? parsed
				: JSON.stringify(parsed, null, 2);
		} catch {
			return value;
		}
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return safeText(value);
	}
}
