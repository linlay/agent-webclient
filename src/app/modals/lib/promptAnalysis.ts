import type { AgentEvent } from "@/app/state/types";
import {
	readNumberValue,
	readObjectValue,
	readStringValue,
	resolveInjectedPromptPayloadFromLLMTrace,
	resolveInjectedPromptPayloadRecord,
	type InjectedPromptPayloads,
} from "@/app/modals/lib/eventPopoverFormatters";

export type PromptAnalysisCallKind = "trace" | "inline";

export interface PromptAnalysisCall {
	id: string;
	kind: PromptAnalysisCallKind;
	event: AgentEvent;
	index: number;
	title: string;
	traceFile: string;
	runSeq: number;
	modelLabel: string;
	status: string;
	inlinePayload: InjectedPromptPayloads | null;
}

export type PromptAnalysisLoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; payload: InjectedPromptPayloads }
	| { status: "empty" }
	| { status: "error"; message: string };

export const PROMPT_ANALYSIS_LOAD_TIMEOUT_MS = 15_000;

export function buildPromptAnalysisTimeoutLoadState(
	message: string,
): PromptAnalysisLoadState {
	return { status: "error", message };
}

export function isValidRawLLMTraceFile(file: string): boolean {
	const normalized = String(file || "").trim();
	if (
		!normalized.startsWith("llm/") ||
		normalized.includes("\\") ||
		normalized.includes("\0")
	) {
		return false;
	}
	const filename = normalized.slice("llm/".length);
	if (!filename || filename.includes("/") || !filename.endsWith(".json")) {
		return false;
	}
	const stem = filename.slice(0, -".json".length);
	if (stem.length < 5 || stem[stem.length - 4] !== "_") {
		return false;
	}
	const name = stem.slice(0, -4);
	const seq = stem.slice(-3);
	if (
		!name ||
		name === "." ||
		name === ".." ||
		name.includes("..") ||
		!/^\d{3}$/.test(seq)
	) {
		return false;
	}
	return /^[A-Za-z0-9._-]+$/.test(name);
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

export function resolvePromptAnalysisCalls(
	event: AgentEvent | null,
	debugEvents: AgentEvent[],
): PromptAnalysisCall[] {
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
		const candidateType = String(candidate.type || "").toLowerCase();
		if (candidateType === "debug.llmchat") {
			const call = buildDebugLLMChatCall(candidate, index);
			return call ? [call] : [];
		}
		return [];
	});
}

export function resolvePromptAnalysisPayloadFromTraceText(
	rawText: unknown,
): InjectedPromptPayloads | null {
	for (const candidate of collectPromptAnalysisTraceCandidates(rawText)) {
		const payload = resolveInjectedPromptPayloadFromLLMTrace(candidate);
		if (payload) {
			return payload;
		}
	}
	return null;
}

function collectPromptAnalysisTraceCandidates(
	value: unknown,
	depth = 0,
): unknown[] {
	if (depth > 4) {
		return [];
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return [];
		}
		try {
			return collectPromptAnalysisTraceCandidates(JSON.parse(trimmed), depth + 1);
		} catch {
			return [];
		}
	}

	const record = readObjectValue(value);
	if (!record) {
		return [];
	}

	return [
		record,
		...collectPromptAnalysisTraceCandidates(record.data, depth + 1),
	];
}

function buildDebugLLMChatCall(
	event: AgentEvent,
	index: number,
): PromptAnalysisCall | null {
	const data = readObjectValue(event.data);
	const inlinePayload = resolveInjectedPromptPayloadRecord(data?.injectedPrompt);
	const traceFile = resolveRawLLMTraceFile(event);
	if (!inlinePayload && !traceFile) {
		return null;
	}
	const runSeq = readNumberValue(data?.runSeq);
	return {
		id: traceFile || `debug-llmchat-${index >= 0 ? index : "current"}`,
		kind: traceFile ? "trace" : "inline",
		event,
		index,
		title: runSeq > 0 ? `LLM #${runSeq}` : "LLM",
		traceFile,
		runSeq,
		modelLabel: readModelLabel(data),
		status: readStringValue(data?.status),
		inlinePayload,
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
