import type { AgentEvent } from "@/app/state/types";
import {
	buildCollectedSnapshot,
	getCollectibleRelatedEvents,
	readEventIdValue,
	resolveEventGroupMeta,
	type RelatedEventEntry,
} from "@/app/modals/lib/eventPopoverGrouping";
import {
	readNonEmptyStringValue,
	readObjectValue,
	readStringValue,
	resolveDebugPreCallCopyPayloads,
	stringifyCopyValue,
	stringifyPopoverPayload,
} from "@/app/modals/lib/eventPopoverFormatters";

export type CopyFeedbackState = "idle" | "copied" | "error";

export interface EventCopyMenuItem {
	key: string;
	label: string;
	text: string;
}

export interface CopyMenuItemState {
	key: string;
	label: string;
}

export type EventPopoverT = (
	key: string,
	params?: Record<string, unknown>,
) => string;

export const defaultEventPopoverT: EventPopoverT = (key, params = {}) => {
	const fallbacks: Record<string, string> = {
		"eventPopover.copy.allShort": "All",
		"eventPopover.copy.all": "Copy all",
		"eventPopover.copy.requestBody": "Copy requestBody",
		"eventPopover.copy.systemPrompt": "Copy systemPrompt",
		"eventPopover.copy.tools": "Copy tools",
		"eventPopover.copy.model": "Copy model",
		"eventPopover.copy.message": "Copy message",
		"eventPopover.copy.error": "Copy error message",
		"eventPopover.copy.currentText": "Copy current text",
		"eventPopover.copy.collectedText": "Copy collected text",
		"eventPopover.copy.collectedSnapshot": "Copy collected snapshot JSON",
		"eventPopover.copy.arguments": "Copy arguments",
		"eventPopover.copy.result": "Copy result",
		"eventPopover.copy.awaitingItems": "Copy question/approval/form JSON",
		"eventPopover.copy.field": "Copy {field}",
		"eventPopover.feedback.copied": "Copied {label}",
		"eventPopover.feedback.copyFailed": "{label} copy failed",
		"eventPopover.copy.openMenu": "Open copy menu",
		"eventPopover.group.unknown": "Unknown group",
		"eventPopover.meta.time": "Time: {time}",
		"eventPopover.action.collectSnapshot": "Collect event snapshot",
		"eventPopover.copy.menuAria": "Copy menu",
		"eventPopover.title.doubleClickCopy": "Double-click to copy all",
		"eventPopover.close": "Close event details",
	};
	const template = fallbacks[key] || key;
	return template.replace(/\{([^}]+)\}/g, (_, rawKey: string) => {
		const value = params[String(rawKey || "").trim()];
		return value == null ? "" : String(value);
	});
};

export function buildDefaultCopyMenuItem(t: EventPopoverT): CopyMenuItemState {
	return {
		key: "eventJson",
		label: t("eventPopover.copy.allShort"),
	};
}

export async function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "absolute";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	const copied = document.execCommand("copy");
	document.body.removeChild(textarea);
	if (!copied) {
		throw new Error("copy failed");
	}
}

export function buildCopyMenuTitle(
	lastCopyItem: CopyMenuItemState,
	copyStatus: Record<string, CopyFeedbackState>,
	t: EventPopoverT = defaultEventPopoverT,
): string {
	const status = copyStatus[lastCopyItem.key] || "idle";
	if (status === "copied") {
		return t("eventPopover.feedback.copied", { label: lastCopyItem.label });
	}
	if (status === "error") {
		return t("eventPopover.feedback.copyFailed", {
			label: lastCopyItem.label,
		});
	}
	return t("eventPopover.copy.openMenu");
}

export function stripCopyPrefix(label: string): string {
	return label.replace(/^Copy\s*/i, "").replace(/^\u590d\u5236\s*/, "");
}

export function getPrimaryCopyMenuItem(
	items: EventCopyMenuItem[],
): EventCopyMenuItem | null {
	return items[0] || null;
}

export function buildEventCopyMenuItems(
	event: AgentEvent | null,
	relatedEvents: RelatedEventEntry[],
	rawJsonStr: string,
	t: EventPopoverT = defaultEventPopoverT,
): EventCopyMenuItem[] {
	const items: EventCopyMenuItem[] = [];
	pushDefaultCopyMenuItem(items, rawJsonStr, t);
	const type = String(event?.type || "").toLowerCase();
	const collectibleRelatedEvents = getCollectibleRelatedEvents(
		event,
		resolveEventGroupMeta(event),
		relatedEvents,
	);
	const collectedSnapshotJson = buildCollectedSnapshotJson(
		event,
		collectibleRelatedEvents,
	);
	const collectedText = readCollectedSnapshotText(event, collectibleRelatedEvents);

	if (type === "debug.precall") {
		const debugPreCallPayloads = resolveDebugPreCallCopyPayloads(event);
		if (debugPreCallPayloads) {
			pushCopyMenuItem(items, "requestBody", t("eventPopover.copy.requestBody"), debugPreCallPayloads.requestBodyText);
			pushCopyMenuItem(items, "systemPrompt", t("eventPopover.copy.systemPrompt"), debugPreCallPayloads.systemPromptText);
			pushCopyMenuItem(items, "tools", t("eventPopover.copy.tools"), debugPreCallPayloads.toolsText);
			pushCopyMenuItem(items, "model", t("eventPopover.copy.model"), debugPreCallPayloads.modelText);
		}
		return items;
	}

	if (type.startsWith("chat.")) {
		pushCopyMenuItem(items, "chatId", copyFieldLabel(t, "chatId"), readEventIdValue(event || {}, "chatId"));
		pushCopyMenuItem(items, "chatName", copyFieldLabel(t, "chatName"), readNonEmptyStringValue(event?.chatName));
		return items;
	}

	if (type === "request.query" || type === "request.steer") {
		pushCopyMenuItem(items, "requestId", copyFieldLabel(t, "requestId"), readEventIdValue(event || {}, "requestId"));
		pushCopyMenuItem(items, "message", t("eventPopover.copy.message"), readNonEmptyStringValue(event?.message));
		pushCopyMenuItem(items, "references", copyFieldLabel(t, "references"), stringifyCopyValue(event?.references));
		return items;
	}

	if (type.startsWith("run.")) {
		pushCopyMenuItem(items, "runId", copyFieldLabel(t, "runId"), readEventIdValue(event || {}, "runId"));
		pushCopyMenuItem(items, "chatId", copyFieldLabel(t, "chatId"), readEventIdValue(event || {}, "chatId"));
		pushCopyMenuItem(items, "requestId", copyFieldLabel(t, "requestId"), readEventIdValue(event || {}, "requestId"));
		if (type === "run.error") {
			pushCopyMenuItem(items, "error", t("eventPopover.copy.error"), stringifyCopyValue(event?.error));
		}
		return items;
	}

	if (type.startsWith("content.")) {
		pushCopyMenuItem(items, "contentId", copyFieldLabel(t, "contentId"), readEventIdValue(event || {}, "contentId"));
		pushCopyMenuItem(items, "currentText", t("eventPopover.copy.currentText"), readCurrentTextForCopy(event));
		pushCopyMenuItem(items, "collectedText", t("eventPopover.copy.collectedText"), collectedText);
		pushCopyMenuItem(items, "collectedSnapshot", t("eventPopover.copy.collectedSnapshot"), collectedSnapshotJson);
		return items;
	}

	if (type.startsWith("reasoning.")) {
		pushCopyMenuItem(items, "reasoningId", copyFieldLabel(t, "reasoningId"), readEventIdValue(event || {}, "reasoningId"));
		pushCopyMenuItem(items, "currentText", t("eventPopover.copy.currentText"), readCurrentTextForCopy(event));
		pushCopyMenuItem(items, "collectedText", t("eventPopover.copy.collectedText"), collectedText);
		pushCopyMenuItem(items, "collectedSnapshot", t("eventPopover.copy.collectedSnapshot"), collectedSnapshotJson);
		return items;
	}

	if (type.startsWith("tool.")) {
		pushCopyMenuItem(items, "toolId", copyFieldLabel(t, "toolId"), readEventIdValue(event || {}, "toolId"));
		pushCopyMenuItem(
			items,
			"toolName",
			copyFieldLabel(t, "toolName"),
			readNonEmptyStringValue(event?.toolLabel) || readNonEmptyStringValue(event?.toolName),
		);
		pushCopyMenuItem(items, "arguments", t("eventPopover.copy.arguments"), readToolArgumentsForCopy(event, relatedEvents));
		pushCopyMenuItem(items, "result", t("eventPopover.copy.result"), readResultForCopy(relatedEvents));
		pushCopyMenuItem(items, "collectedSnapshot", t("eventPopover.copy.collectedSnapshot"), collectedSnapshotJson);
		return items;
	}

	if (type.startsWith("action.")) {
		pushCopyMenuItem(items, "actionId", copyFieldLabel(t, "actionId"), readEventIdValue(event || {}, "actionId"));
		pushCopyMenuItem(items, "actionName", copyFieldLabel(t, "actionName"), readNonEmptyStringValue(event?.actionName));
		pushCopyMenuItem(items, "arguments", t("eventPopover.copy.arguments"), readActionArgumentsForCopy(event, relatedEvents));
		pushCopyMenuItem(items, "result", t("eventPopover.copy.result"), readResultForCopy(relatedEvents));
		pushCopyMenuItem(items, "collectedSnapshot", t("eventPopover.copy.collectedSnapshot"), collectedSnapshotJson);
		return items;
	}

	if (type.startsWith("plan.")) {
		pushCopyMenuItem(items, "planId", copyFieldLabel(t, "planId"), readEventIdValue(event || {}, "planId"));
		pushCopyMenuItem(items, "planJson", copyFieldLabel(t, "plan JSON"), stringifyCopyValue(event?.plan));
		return items;
	}

	if (type.startsWith("task.")) {
		const groupId =
			readNonEmptyStringValue((event as Record<string, unknown> | null)?.taskGroupId) ||
			readNonEmptyStringValue((event as Record<string, unknown> | null)?.groupId);
		pushCopyMenuItem(items, "taskId", copyFieldLabel(t, "taskId"), readEventIdValue(event || {}, "taskId"));
		pushCopyMenuItem(items, "taskName", copyFieldLabel(t, "taskName"), readNonEmptyStringValue(event?.taskName));
		pushCopyMenuItem(items, "taskGroupId", copyFieldLabel(t, "taskGroupId"), groupId);
		if (type === "task.fail") {
			pushCopyMenuItem(items, "error", t("eventPopover.copy.error"), stringifyCopyValue(event?.error));
		}
		return items;
	}

	if (type === "artifact.publish") {
		pushCopyMenuItem(items, "runId", copyFieldLabel(t, "runId"), readEventIdValue(event || {}, "runId"));
		pushCopyMenuItem(items, "artifacts", copyFieldLabel(t, "artifacts JSON"), stringifyCopyValue(event?.artifacts));
		pushCopyMenuItem(items, "artifactUrls", copyFieldLabel(t, "artifact URLs"), readArtifactUrlsForCopy(event));
		return items;
	}

	if (type.startsWith("awaiting.")) {
		pushCopyMenuItem(items, "awaitingId", copyFieldLabel(t, "awaitingId"), readEventIdValue(event || {}, "awaitingId"));
		pushCopyMenuItem(items, "awaitingItems", t("eventPopover.copy.awaitingItems"), readAwaitingItemsForCopy(event));
		return items;
	}

	return items;
}

function buildCollectedSnapshotJson(
	event: AgentEvent | null,
	collectibleRelatedEvents: RelatedEventEntry[],
): string {
	if (!event || collectibleRelatedEvents.length === 0) {
		return "";
	}
	return stringifyPopoverPayload(
		buildCollectedSnapshot(event, collectibleRelatedEvents),
	);
}

function readCollectedSnapshotText(
	event: AgentEvent | null,
	collectibleRelatedEvents: RelatedEventEntry[],
): string {
	if (!event || collectibleRelatedEvents.length === 0) {
		return "";
	}
	const snapshot = buildCollectedSnapshot(event, collectibleRelatedEvents);
	return readStringValue(snapshot.text);
}

function readCurrentTextForCopy(event: AgentEvent | null): string {
	if (!event) {
		return "";
	}
	return readStringValue(event.text) || readStringValue(event.delta);
}

function readObjectLikeCopyValue(value: unknown): string {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return "";
	}
	return JSON.stringify(value, null, 2);
}

function readBufferedDeltaText(
	relatedEvents: RelatedEventEntry[],
	eventTypePrefix: string,
	deltaEventType: string,
): string {
	return relatedEvents
		.filter((entry) => {
			const type = String(entry.event.type || "").toLowerCase();
			return type.startsWith(eventTypePrefix) && type === deltaEventType;
		})
		.map((entry) => readStringValue(entry.event.delta))
		.join("");
}

function readToolArgumentsForCopy(
	event: AgentEvent | null,
	relatedEvents: RelatedEventEntry[],
): string {
	if (!event) {
		return "";
	}
	return (
		readObjectLikeCopyValue(event.toolParams) ||
		readObjectLikeCopyValue(event.arguments) ||
		readNonEmptyStringValue(event.arguments) ||
		readBufferedDeltaText(relatedEvents, "tool.", "tool.args")
	);
}

function readActionArgumentsForCopy(
	event: AgentEvent | null,
	relatedEvents: RelatedEventEntry[],
): string {
	if (!event) {
		return "";
	}
	return (
		readObjectLikeCopyValue(event.arguments) ||
		readNonEmptyStringValue(event.arguments) ||
		readObjectLikeCopyValue(event.actionParams) ||
		readBufferedDeltaText(relatedEvents, "action.", "action.args")
	);
}

function readResultForCopy(relatedEvents: RelatedEventEntry[]): string {
	for (let index = relatedEvents.length - 1; index >= 0; index -= 1) {
		const candidate = relatedEvents[index]?.event;
		if (!candidate) {
			continue;
		}
		const text =
			stringifyCopyValue(candidate.result) ||
			stringifyCopyValue(candidate.output) ||
			readNonEmptyStringValue(candidate.text);
		if (text) {
			return text;
		}
	}
	return "";
}

function readArtifactUrlsForCopy(event: AgentEvent | null): string {
	if (!event || !Array.isArray(event.artifacts)) {
		return "";
	}
	return event.artifacts
		.map((artifact) => {
			const record = readObjectValue(artifact);
			return record ? readNonEmptyStringValue(record.url) : "";
		})
		.filter(Boolean)
		.join("\n");
}

function readAwaitingItemsForCopy(event: AgentEvent | null): string {
	if (!event) {
		return "";
	}
	const record = event as Record<string, unknown>;
	return (
		stringifyCopyValue(record.questions) ||
		stringifyCopyValue(record.approvals) ||
		stringifyCopyValue(record.forms) ||
		stringifyCopyValue(record.answers)
	);
}

function copyFieldLabel(t: EventPopoverT, field: string): string {
	return t("eventPopover.copy.field", { field });
}

function pushCopyMenuItem(
	items: EventCopyMenuItem[],
	key: string,
	label: string,
	text: string,
): void {
	if (!text) {
		return;
	}
	items.push({ key, label, text });
}

function pushDefaultCopyMenuItem(
	items: EventCopyMenuItem[],
	rawJsonStr: string,
	t: EventPopoverT,
): void {
	pushCopyMenuItem(items, "eventJson", t("eventPopover.copy.all"), rawJsonStr);
}
