import type { AgentEvent } from "@/app/state/types";
import {
	readObjectValue,
	readStringValue,
	stringifyCopyValue,
} from "@/app/modals/lib/eventPopoverFormatters";

export interface SystemPromptCall {
	id: string;
	event: AgentEvent;
	index: number;
	title: string;
	traceFile: string;
	runSeq: number;
	modelLabel: string;
	status: string;
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
		const call = buildDebugLLMChatCall(event, -1);
		return call ? [call] : [];
	}
	if (type !== "run.start") {
		return [];
	}

	const runId = readEventRunId(event);
	if (!runId) {
		return [];
	}
	return debugEvents.flatMap((candidate, index) => {
		if (readEventRunId(candidate) !== runId) {
			return [];
		}
		if (String(candidate.type || "").toLowerCase() !== "debug.llmchat") {
			return [];
		}
		const call = buildDebugLLMChatCall(candidate, index);
		return call ? [call] : [];
	});
}

export function resolveSystemPromptTextFromTraceText(rawText: unknown): string {
	for (const candidate of collectTraceCandidates(rawText)) {
		const text = resolveSystemPromptTextFromTrace(candidate);
		if (text) {
			return text;
		}
	}
	return "";
}

export function resolveSystemPromptTextFromTrace(trace: unknown): string {
	const traceRecord = readObjectValue(trace);
	if (!traceRecord) {
		return "";
	}
	return (
		resolveSystemPromptTextFromRequestBody(traceRecord.request) ||
		resolveSystemPromptTextFromRequestBody(traceRecord.requestBody) ||
		resolveSystemPromptTextFromRequestBody(traceRecord.request_body)
	);
}

export function resolveSystemPromptTextFromRequestBody(
	requestBodyValue: unknown,
): string {
	const requestBody = readObjectValue(requestBodyValue);
	if (!requestBody) {
		return "";
	}
	const parts = [
		...extractTextParts(requestBody.system),
		...extractSystemMessages(requestBody.messages),
	];
	return joinTextParts(parts);
}

function buildDebugLLMChatCall(
	event: AgentEvent,
	index: number,
): SystemPromptCall | null {
	const traceFile = resolveRawLLMTraceFile(event);
	if (!traceFile) {
		return null;
	}
	const data = readObjectValue(event.data);
	const runSeq = readNumberValue(data?.runSeq);
	return {
		id: traceFile,
		event,
		index,
		title: runSeq > 0 ? `LLM #${runSeq}` : "LLM",
		traceFile,
		runSeq,
		modelLabel: readModelLabel(data),
		status: readStringValue(data?.status),
	};
}

function readEventRunId(event: AgentEvent): string {
	const value = event.runId;
	if (typeof value === "string") {
		return value.trim();
	}
	if (typeof value === "number") {
		return String(value);
	}
	return "";
}

function readModelLabel(data: Record<string, unknown> | null): string {
	const model = readObjectValue(data?.model);
	return (
		readStringValue(model?.key).trim() ||
		readStringValue(model?.id).trim() ||
		readStringValue(data?.modelKey).trim() ||
		readStringValue(data?.modelId).trim()
	);
}

function readNumberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function collectTraceCandidates(value: unknown, depth = 0): unknown[] {
	if (depth > 4) {
		return [];
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return [];
		}
		try {
			return collectTraceCandidates(JSON.parse(trimmed), depth + 1);
		} catch {
			return [];
		}
	}
	const record = readObjectValue(value);
	if (!record) {
		return [];
	}
	return [record, ...collectTraceCandidates(record.data, depth + 1)];
}

function extractSystemMessages(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((message) => {
		const entry = readObjectValue(message);
		if (!entry || readStringValue(entry.role).toLowerCase() !== "system") {
			return [];
		}
		return extractTextParts(entry.content);
	});
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
	const fallback = stringifyCopyValue(value);
	return fallback ? [fallback] : [];
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
