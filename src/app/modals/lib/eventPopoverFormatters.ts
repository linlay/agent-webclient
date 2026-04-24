import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";

export interface DebugPreCallCopyPayloads {
	requestBodyText: string;
	systemPromptText: string;
	toolsText: string;
	modelText: string;
}

export function formatReadableTimestamp(timestamp?: number): string {
	return formatDebugTimestamp(timestamp);
}

export function stringifyPopoverPayload(payload: unknown): string {
	return payload ? JSON.stringify(payload, null, 2) : "";
}

export function readObjectValue(
	value: unknown,
): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

export function readStringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function readNonEmptyStringValue(value: unknown): string {
	const text = readStringValue(value);
	return text.trim() ? text : "";
}

export function stringifyCopyValue(value: unknown): string {
	if (typeof value === "string") {
		return value.trim() ? value : "";
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	if (value === null || value === undefined) {
		return "";
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "";
	}
}

export function resolveDebugPreCallCopyPayloads(
	event: AgentEvent | null,
): DebugPreCallCopyPayloads | null {
	if (!event || String(event.type || "").toLowerCase() !== "debug.precall") {
		return null;
	}
	const payload = readObjectValue(event.data);
	if (!payload) {
		return null;
	}
	const requestBody = readObjectValue(payload.requestBody);
	if (!requestBody) {
		return null;
	}

	const systemPromptText = extractSystemPromptFromRequestBody(requestBody);
	const toolsText = Array.isArray(requestBody.tools)
		? JSON.stringify(requestBody.tools, null, 2)
		: "";

	return {
		requestBodyText: JSON.stringify(requestBody, null, 2),
		systemPromptText,
		toolsText,
		modelText: stringifyCopyValue(requestBody.model),
	};
}

export function resolveDisplayPayloadTimestamp(
	payload: unknown,
): number | undefined {
	const record = readObjectValue(payload);
	return typeof record?.timestamp === "number" ? record.timestamp : undefined;
}

export function resolveInitialPopoverState(event: AgentEvent | null): {
	payload: Record<string, unknown> | AgentEvent | null;
	rawJsonStr: string;
	displayJsonStr: string;
} {
	const payload = event || null;
	const rawJsonStr = stringifyPopoverPayload(payload);
	return {
		payload,
		rawJsonStr,
		displayJsonStr: rawJsonStr,
	};
}

function extractTextParts(value: unknown): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : [];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => extractTextParts(item));
	}
	const record = readObjectValue(value);
	if (!record) {
		return [];
	}
	if (typeof record.text === "string") {
		return extractTextParts(record.text);
	}
	if (
		typeof record.value === "string" &&
		readStringValue(record.type).toLowerCase() === "text"
	) {
		return extractTextParts(record.value);
	}
	return [];
}

function extractSystemPromptFromRequestBody(
	requestBody: Record<string, unknown>,
): string {
	const directPrompt = extractTextParts(requestBody.system).join("\n\n");
	if (directPrompt) {
		return directPrompt;
	}

	const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
	return messages
		.flatMap((message) => {
			const entry = readObjectValue(message);
			if (!entry || readStringValue(entry.role).toLowerCase() !== "system") {
				return [];
			}
			return extractTextParts(entry.content);
		})
		.join("\n\n");
}
