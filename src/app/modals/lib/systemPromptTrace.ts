import type { AgentEvent } from "@/app/state/types";
import {
	readObjectValue,
	readStringValue,
} from "@/app/modals/lib/eventPopoverFormatters";

export interface SystemPromptCall {
	chatId: string;
	runId: string;
	agentKey: string;
}

export type SystemPromptLoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; text: string }
	| { status: "empty" }
	| { status: "error"; message: string };

export const SYSTEM_PROMPT_LOAD_TIMEOUT_MS = 15_000;

export function buildSystemPromptTimeoutLoadState(
	message: string,
): SystemPromptLoadState {
	return { status: "error", message };
}

export function isValidRawLLMTraceFile(file: string): boolean {
	const normalized = String(file || "").trim();
	if (
		!normalized ||
		normalized.includes("\\") ||
		normalized.includes("\0") ||
		normalized.startsWith("/") ||
		normalized.startsWith("../") ||
		normalized.includes("/../") ||
		normalized.includes("//")
	) {
		return false;
	}
	const parts = normalized.split("/");
	if (parts.length !== 3 || parts[1] !== ".llm-records") {
		return false;
	}
	const [chatId, , filename] = parts;
	if (!isSafePathSegment(chatId) || !filename.endsWith(".json")) {
		return false;
	}
	const stem = filename.slice(0, -".json".length);
	if (stem.length < 5 || stem[stem.length - 4] !== "_") {
		return false;
	}
	const name = stem.slice(0, -4);
	const seq = stem.slice(-3);
	return isSafePathSegment(name) && /^\d{3}$/.test(seq);
}

export function resolveRawLLMTraceFile(event: AgentEvent | null): string {
	if (!event || String(event.type || "").toLowerCase() !== "debug.llmchat") {
		return "";
	}
	const data = readObjectValue(event.data);
	const trace = readObjectValue(data?.trace);
	const file = readStringValue(trace?.file).trim();
	return isValidRawLLMTraceFile(file) ? file : "";
}

export function resolveSystemPromptCalls(
	event: AgentEvent | null,
	debugEvents: AgentEvent[],
): SystemPromptCall[] {
	const type = String(event?.type || "").toLowerCase();
	if (!event) {
		return [];
	}
	if (type === "debug.llmchat") {
		const call = buildSystemPromptCall(
			event,
			findRunStartEvent(event, debugEvents),
		);
		return call ? [call] : [];
	}
	if (type !== "run.start") {
		return [];
	}
	const call = buildSystemPromptCall(event);
	return call ? [call] : [];
}

export function resolveSystemPromptText(systemMessage: unknown): string {
	const message = readObjectValue(systemMessage);
	if (!message) {
		return "";
	}
	return joinTextParts(extractTextParts(message.content));
}

function buildSystemPromptCall(
	event: AgentEvent,
	fallback?: AgentEvent | null,
): SystemPromptCall | null {
	const data = readObjectValue(event.data);
	const systemRef = readObjectValue(data?.systemRef);
	const chatId = readStringValue(event.chatId) || readStringValue(fallback?.chatId);
	const runId = readEventRunId(event) || readEventRunId(fallback);
	const agentKey =
		readStringValue(event.agentKey) ||
		readStringValue(systemRef?.agentKey) ||
		readStringValue(fallback?.agentKey);
	if (!chatId || !runId || !agentKey) {
		return null;
	}

	return {
		chatId,
		runId,
		agentKey,
	};
}

function findRunStartEvent(
	event: AgentEvent,
	debugEvents: AgentEvent[],
): AgentEvent | null {
	const runId = readEventRunId(event);
	if (!runId) {
		return null;
	}
	return (
		debugEvents.find(
			(candidate) =>
				String(candidate.type || "").toLowerCase() === "run.start" &&
				readEventRunId(candidate) === runId,
		) || null
	);
}

function readEventRunId(event: AgentEvent | null | undefined): string {
	if (!event) {
		return "";
	}
	const value = event.runId;
	if (typeof value === "string") {
		return value.trim();
	}
	if (typeof value === "number") {
		return String(value);
	}
	return "";
}

function extractTextParts(value: unknown): string[] {
	if (typeof value === "string") {
		const text = value.trim();
		return text ? [text] : [];
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
		readStringValue(record.type).toLowerCase() === "text" &&
		typeof record.value === "string"
	) {
		return extractTextParts(record.value);
	}
	return [];
}

function joinTextParts(parts: string[]): string {
	return parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function isSafePathSegment(value: string): boolean {
	if (
		!value ||
		value === "." ||
		value === ".." ||
		value.includes("..")
	) {
		return false;
	}
	return /^[A-Za-z0-9._-]+$/.test(value);
}
