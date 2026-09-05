import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";

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
