import type { AgentEvent } from "@/app/state/types";
import {
	readObjectValue,
	readStringValue,
} from "@/app/modals/lib/eventPopoverFormatters";

const COLLECTIBLE_EVENT_TYPES = new Set([
	"reasoning.start",
	"reasoning.delta",
	"reasoning.end",
	"content.start",
	"content.delta",
	"content.end",
	"tool.start",
	"tool.args",
	"tool.end",
	"action.start",
	"action.args",
	"action.end",
] as const);

const COLLECTIBLE_GROUP_EVENT_TYPES: Record<
	"reasoning" | "content" | "tool" | "action",
	Set<string>
> = {
	reasoning: new Set(["reasoning.start", "reasoning.delta", "reasoning.end"]),
	content: new Set(["content.start", "content.delta", "content.end"]),
	tool: new Set(["tool.start", "tool.args", "tool.end"]),
	action: new Set(["action.start", "action.args", "action.end"]),
};

const EVENT_GROUP_CONFIG = [
	{ prefix: "chat.", idKey: "chatId", family: "chat" },
	{ prefix: "request.", idKey: "requestId", family: "request" },
	{ prefix: "run.", idKey: "runId", family: "run" },
	{ prefix: "content.", idKey: "contentId", family: "content" },
	{ prefix: "reasoning.", idKey: "reasoningId", family: "reasoning" },
	{ prefix: "plan.", idKey: "planId", family: "plan" },
	{ prefix: "task.", idKey: "taskId", family: "task" },
	{ prefix: "tool.", idKey: "toolId", family: "tool" },
	{ prefix: "action.", idKey: "actionId", family: "action" },
	{ prefix: "artifact.", idKey: "runId", family: "artifact" },
	{ prefix: "awaiting.", idKey: "awaitingId", family: "awaiting" },
] as const;

export type EventGroupIdKey = (typeof EVENT_GROUP_CONFIG)[number]["idKey"];

export interface EventGroupMeta {
	family: (typeof EVENT_GROUP_CONFIG)[number]["family"];
	idKey: EventGroupIdKey;
	idValue: string;
}

export interface RelatedEventEntry {
	event: AgentEvent;
	index: number;
}

type CollectibleFamily = keyof typeof COLLECTIBLE_GROUP_EVENT_TYPES;

export function readEventIdValue(
	event: Partial<Record<EventGroupIdKey, unknown>> | null | undefined,
	idKey: EventGroupIdKey,
): string {
	const value = event?.[idKey];
	if (typeof value === "string") {
		return value.trim();
	}
	if (typeof value === "number") {
		return String(value);
	}
	return "";
}

export function resolveEventGroupMeta(
	event: AgentEvent | null,
): EventGroupMeta | null {
	if (!event) return null;

	const type = String(event.type || "").toLowerCase();
	const config = EVENT_GROUP_CONFIG.find((item) =>
		type.startsWith(item.prefix),
	);
	if (!config) return null;

	const idValue = readEventIdValue(event, config.idKey);
	if (!idValue) return null;

	return {
		family: config.family,
		idKey: config.idKey,
		idValue,
	};
}

export function canCollectEvent(type: string): boolean {
	return COLLECTIBLE_EVENT_TYPES.has(String(type || "").toLowerCase() as never);
}

export function getCollectibleRelatedEvents(
	event: AgentEvent | null,
	groupMeta: EventGroupMeta | null,
	relatedEvents: RelatedEventEntry[],
): RelatedEventEntry[] {
	if (!event || !groupMeta || !isCollectibleFamily(groupMeta.family)) {
		return [];
	}
	if (!canCollectEvent(String(event.type || ""))) {
		return [];
	}

	const allowedTypes = COLLECTIBLE_GROUP_EVENT_TYPES[groupMeta.family];
	return relatedEvents.filter((entry) =>
		allowedTypes.has(String(entry.event.type || "").toLowerCase()),
	);
}

export function mapCollectedSnapshotType(type: string): string {
	const normalized = String(type || "").toLowerCase();
	if (normalized.startsWith("reasoning.")) return "reasoning.snapshot";
	if (normalized.startsWith("content.")) return "content.snapshot";
	if (normalized.startsWith("tool.")) return "tool.snapshot";
	if (normalized.startsWith("action.")) return "action.snapshot";
	return normalized;
}

export function buildCollectedSnapshot(
	event: AgentEvent,
	relatedEvents: RelatedEventEntry[],
): Record<string, unknown> {
	const mergedEvent = relatedEvents.reduce<Record<string, unknown>>(
		(acc, entry) => ({
			...acc,
			...entry.event,
		}),
		{ ...event },
	);
	const lastEvent = relatedEvents[relatedEvents.length - 1]?.event || event;
	const snapshotType = mapCollectedSnapshotType(String(event.type || ""));
	const textFromDelta = relatedEvents
		.map((entry) => readStringValue(entry.event.delta))
		.join("");
	const fallbackText = [...relatedEvents]
		.reverse()
		.map((entry) => readStringValue(entry.event.text))
		.find(Boolean);
	const collectedArguments = (
		snapshotType === "tool.snapshot" || snapshotType === "action.snapshot"
	)
		? relatedEvents
				.map((entry) => readStringValue(entry.event.delta))
				.join("")
		: "";
	const rawArgumentsFallback =
		snapshotType === "action.snapshot"
			? readStringValue(mergedEvent.arguments) ||
				(() => {
					const actionParams = readObjectValue(mergedEvent.actionParams);
					return actionParams ? JSON.stringify(actionParams, null, 2) : "";
				})()
			: "";
	const textValue =
		snapshotType === "action.snapshot"
			? readStringValue(lastEvent.text) || fallbackText
			: textFromDelta || fallbackText || readStringValue(lastEvent.text);

	const nextSnapshot: Record<string, unknown> = {
		...mergedEvent,
		type: snapshotType,
		seq: lastEvent.seq ?? mergedEvent.seq,
		timestamp: lastEvent.timestamp ?? mergedEvent.timestamp,
	};

	if (textValue) {
		nextSnapshot.text = textValue;
	} else {
		delete nextSnapshot.text;
	}

	if (
		(snapshotType === "tool.snapshot" || snapshotType === "action.snapshot") &&
		(collectedArguments || rawArgumentsFallback)
	) {
		nextSnapshot.arguments = collectedArguments || rawArgumentsFallback;
	}

	if (snapshotType === "action.snapshot") {
		delete nextSnapshot.result;
	}

	return nextSnapshot;
}

function isCollectibleFamily(
	family: EventGroupMeta["family"],
): family is CollectibleFamily {
	return (
		family === "reasoning" ||
		family === "content" ||
		family === "tool" ||
		family === "action"
	);
}
