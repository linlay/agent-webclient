import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";

export interface DebugPreCallCopyPayloads {
	requestBodyText: string;
	systemPromptText: string;
	toolsText: string;
	modelText: string;
}

export interface InjectedPromptPayloads {
	rawJsonText: string;
	systemPromptText: string;
	systemPromptTokens: number;
	historyMessagesText: string;
	historyMessagesTokens: number;
	currentUserMessageText: string;
	currentUserMessageTokens: number;
	providerMessagesText: string;
	providerMessagesTokens: number;
	entries: InjectedPromptEntry[];
}

export interface InjectedPromptEntry {
	id: string;
	title: string;
	role: string;
	category?: string;
	roundNumber?: number;
	tokens: number;
	contentText: string;
	rawJsonText: string;
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

export function resolveInjectedPromptPayloads(
	event: AgentEvent | null,
): InjectedPromptPayloads | null {
	if (!event || String(event.type || "").toLowerCase() !== "debug.precall") {
		return null;
	}
	const payload = readObjectValue(event.data);
	const injectedPrompt = readObjectValue(payload?.injectedPrompt);
	if (!injectedPrompt) {
		return null;
	}
	return {
		rawJsonText: JSON.stringify(injectedPrompt, null, 2),
		systemPromptText: stringifyCopyValue(injectedPrompt.systemPrompt),
		systemPromptTokens: readNumberValue(injectedPrompt.systemPromptTokens),
		historyMessagesText: stringifyCopyValue(injectedPrompt.historyMessages),
		historyMessagesTokens: readNumberValue(injectedPrompt.historyMessagesTokens),
		currentUserMessageText: stringifyCopyValue(injectedPrompt.currentUserMessage),
		currentUserMessageTokens: readNumberValue(injectedPrompt.currentUserMessageTokens),
		providerMessagesText: stringifyCopyValue(injectedPrompt.providerMessages),
		providerMessagesTokens: readNumberValue(injectedPrompt.providerMessagesTokens),
		entries: buildInjectedPromptEntries(injectedPrompt),
	};
}

export function readNumberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildInjectedPromptEntries(
	injectedPrompt: Record<string, unknown>,
): InjectedPromptEntry[] {
	const entries: InjectedPromptEntry[] = [];

	const systemSections = Array.isArray(injectedPrompt.systemSections)
		? injectedPrompt.systemSections
		: [];
	systemSections.forEach((section, index) => {
		const entry = readObjectValue(section);
		if (!entry) return;
		entries.push({
			id: readNonEmptyStringValue(entry.id) || `system-section-${index + 1}`,
			title: readNonEmptyStringValue(entry.title) || `System Section #${index + 1}`,
			role: readNonEmptyStringValue(entry.role) || "system",
			category: readNonEmptyStringValue(entry.category),
			tokens: readNumberValue(entry.tokens),
			contentText: stringifyCopyValue(entry.content),
			rawJsonText: JSON.stringify(entry, null, 2),
		});
	});
	if (entries.length === 0) {
		const systemPromptText = stringifyCopyValue(injectedPrompt.systemPrompt);
		if (systemPromptText) {
			entries.push({
				id: "system-prompt",
				title: "System Prompt",
				role: "system",
				tokens: readNumberValue(injectedPrompt.systemPromptTokens),
				contentText: systemPromptText,
				rawJsonText: stringifyCopyValue(injectedPrompt.systemPrompt),
			});
		}
	}

	const historyMessages = Array.isArray(injectedPrompt.historyMessages)
		? injectedPrompt.historyMessages
		: [];
	let currentRoundNumber = 0;
	historyMessages.forEach((message, index) => {
		const entry = readObjectValue(message);
		if (!entry) return;
		const role = readNonEmptyStringValue(entry.role) || "unknown";
		if (role === "user") {
			currentRoundNumber += 1;
		}
		entries.push(
			buildInjectedPromptMessageEntry(
				entry,
				`history-${index + 1}`,
				index + 1,
				"History Message",
				currentRoundNumber > 0 ? currentRoundNumber : undefined,
			),
		);
	});

	const currentUserMessage = readObjectValue(injectedPrompt.currentUserMessage);
	if (currentUserMessage) {
		entries.push(
			buildInjectedPromptMessageEntry(
				currentUserMessage,
				"current-user",
				historyMessages.length + 1,
				"Current User Message",
			),
		);
	}

	const providerMessages = Array.isArray(injectedPrompt.providerMessages)
		? injectedPrompt.providerMessages
		: [];
	providerMessages.forEach((message, index) => {
		const entry = readObjectValue(message);
		if (!entry) return;
		entries.push(
			buildInjectedPromptMessageEntry(
				entry,
				`provider-${index + 1}`,
				index + 1,
				"Provider Message",
			),
		);
	});

	return entries;
}

function buildInjectedPromptMessageEntry(
	message: Record<string, unknown>,
	id: string,
	index: number,
	prefix = "History Message",
	roundNumber?: number,
): InjectedPromptEntry {
	const role = readNonEmptyStringValue(message.role) || "unknown";
	const contentText = extractInjectedPromptMessageContent(message);
	const title = `${prefix} #${index}`;
	return {
		id,
		title,
		role,
		roundNumber,
		tokens: readNumberValue(message.estimatedTokens),
		contentText,
		rawJsonText: JSON.stringify(message, null, 2),
	};
}

function extractInjectedPromptMessageContent(
	message: Record<string, unknown>,
): string {
	const content = stringifyCopyValue(message.content);
	if (content) return content;
	const toolCalls = stringifyCopyValue(message.toolCalls);
	if (toolCalls) return toolCalls;
	return JSON.stringify(message, null, 2);
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
