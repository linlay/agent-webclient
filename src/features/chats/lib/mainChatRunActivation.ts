import type { AppState } from "@/app/state/types";
import { resolveChatAgentKey, resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";
import { toText } from "@/shared/utils/eventUtils";

export const AGENT_RUN_STARTED_PUSH_EVENT = "agent:run-started-push";

export interface RunStartedPushDetail {
	chatId: string;
	runId: string;
	agentKey: string;
	lastSeq: number;
}

export type MainChatRunActivationState = Pick<
	AppState,
	| "chatId"
	| "runId"
	| "streaming"
	| "workerSelectionKey"
	| "pendingNewChatAgentKey"
	| "runAgentById"
	| "chatAgentById"
	| "chats"
>;

export type MainChatRunActivationDecision =
	| {
			shouldActivate: true;
			switchChat: boolean;
			chatId: string;
			runId: string;
			agentKey: string;
			lastSeq: number;
	  }
	| {
			shouldActivate: false;
			reason:
				| "invalid_route"
				| "missing_identity"
				| "streaming"
				| "chat_mismatch"
				| "same_run";
			chatId: string;
			runId: string;
			agentKey: string;
			targetAgentKey: string;
	  };

function normalizePathname(pathname: string): string {
	const trimmed = String(pathname || "").trim();
	const pathOnly = trimmed.split(/[?#]/, 1)[0] || "/";
	const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
	const normalized =
		withLeadingSlash.length > 1
			? withLeadingSlash.replace(/\/+$/, "")
			: withLeadingSlash;
	return normalized || "/";
}

function decodeRouteSegment(value: string): string {
	const segment = String(value || "").trim();
	if (!segment) {
		return "";
	}
	try {
		return decodeURIComponent(segment).trim();
	} catch (_error) {
		return segment;
	}
}

export function isMainChatRoutePathname(pathname: string): boolean {
	const normalized = normalizePathname(pathname);
	return (
		normalized === "/" ||
		normalized === "/copilot" ||
		normalized.startsWith("/copilot/") ||
		normalized.startsWith("/agent/")
	);
}

export function resolveMainChatRouteAgentKey(pathname: string): string {
	const normalized = normalizePathname(pathname);
	if (normalized.startsWith("/agent/")) {
		return decodeRouteSegment(normalized.slice("/agent/".length).split("/", 1)[0]);
	}
	if (normalized.startsWith("/copilot/")) {
		return decodeRouteSegment(normalized.slice("/copilot/".length).split("/", 1)[0]);
	}
	return "";
}

function resolveAgentWorkerKey(value: unknown): string {
	const workerKey = toText(value);
	if (!workerKey.startsWith("agent:")) {
		return "";
	}
	return workerKey.slice("agent:".length).trim();
}

export function resolveMainChatTargetAgentKey(
	state: MainChatRunActivationState,
	pathname: string,
): string {
	return (
		resolveMainChatRouteAgentKey(pathname) ||
		resolveAgentWorkerKey(state.workerSelectionKey) ||
		toText(state.pendingNewChatAgentKey) ||
		resolveChatAgentKey({
			chatId: state.chatId,
			chatAgentById: state.chatAgentById,
			chats: state.chats,
		})
	);
}

export function normalizeRunStartedPushDetail(
	detail: unknown,
	state: MainChatRunActivationState,
): RunStartedPushDetail {
	const record =
		detail && typeof detail === "object" && !Array.isArray(detail)
			? (detail as Record<string, unknown>)
			: {};
	const chatId = toText(record.chatId);
	const runId = toText(record.runId);
	const agentKey = resolveRunAgentKey({
		runId,
		metadataAgentKey: record.agentKey,
		runAgentById: state.runAgentById,
		chatId,
		chatAgentById: state.chatAgentById,
		chats: state.chats,
		fallbackAgentKey: "",
	});
	const lastSeqRaw = Number(record.lastSeq ?? 0);
	const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
	return {
		chatId,
		runId,
		agentKey,
		lastSeq,
	};
}

export function resolveMainChatRunActivation(input: {
	state: MainChatRunActivationState;
	detail: unknown;
	pathname: string;
}): MainChatRunActivationDecision {
	const pathname = input.pathname;
	const detail = normalizeRunStartedPushDetail(input.detail, input.state);
	const targetAgentKey = resolveMainChatTargetAgentKey(input.state, pathname);
	const inactive = (
		reason: Extract<MainChatRunActivationDecision, { shouldActivate: false }>["reason"],
	): MainChatRunActivationDecision => ({
		shouldActivate: false,
		reason,
		chatId: detail.chatId,
		runId: detail.runId,
		agentKey: detail.agentKey,
		targetAgentKey,
	});

	if (!isMainChatRoutePathname(pathname)) {
		return inactive("invalid_route");
	}
	if (!detail.chatId || !detail.runId || !detail.agentKey) {
		return inactive("missing_identity");
	}
	if (input.state.streaming) {
		return inactive("streaming");
	}

	const currentChatId = toText(input.state.chatId);
	if (!currentChatId || currentChatId !== detail.chatId) {
		return inactive("chat_mismatch");
	}
	if (toText(input.state.runId) === detail.runId) {
		return inactive("same_run");
	}

	return {
		shouldActivate: true,
		switchChat: false,
		...detail,
	};
}

export function dispatchRunStartedPushEvent(detail: RunStartedPushDetail): void {
	if (
		typeof window === "undefined" ||
		typeof window.dispatchEvent !== "function" ||
		typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(
		new CustomEvent(AGENT_RUN_STARTED_PUSH_EVENT, {
			detail: {
				chatId: toText(detail.chatId),
				runId: toText(detail.runId),
				agentKey: toText(detail.agentKey),
				lastSeq: detail.lastSeq,
			},
		}),
	);
}
