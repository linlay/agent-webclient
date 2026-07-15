import type { AppState } from "@/app/state/types";
import { resolveChatAgentKey } from "@/features/runs/lib/runAgentIdentity";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import type { RunOwner } from "@/shared/data/runOwner";
import { toText } from "@/shared/utils/eventUtils";

export const AGENT_RUN_STARTED_PUSH_EVENT = "agent:run-started-push";

export interface RunStartedPushDetail {
	chatId: string;
	runId: string;
	agentKey: string;
	owner: RunOwner | null;
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
			owner: RunOwner;
			lastSeq: number;
	  }
	| {
			shouldActivate: false;
			reason:
				| "invalid_route"
				| "missing_identity"
				| "chat_mismatch"
				| "same_run";
			chatId: string;
			runId: string;
			agentKey: string;
			owner: RunOwner | null;
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
	const owner = resolveRunOwner({
		chatId,
		chats: state.chats,
		eventIdentity: { teamId: record.teamId, agentKey: record.agentKey },
	});
	const agentKey = owner?.kind === "agent"
		? owner.agentKey
		: "";
	const lastSeqRaw = Number(record.lastSeq ?? 0);
	const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
	return {
		chatId,
		runId,
		agentKey,
		owner,
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
		owner: detail.owner,
		targetAgentKey,
	});

	if (!isMainChatRoutePathname(pathname)) {
		return inactive("invalid_route");
	}
	if (!detail.chatId || !detail.runId || !detail.owner) {
		return inactive("missing_identity");
	}
	const owner = detail.owner;

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
		owner,
	};
}

export function dispatchRunStartedPushEvent(
	detail: RunStartedPushDetail & { owner: RunOwner },
): void {
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
				...(detail.owner.kind === "agent" ? { agentKey: detail.owner.agentKey } : {}),
				...(detail.owner.kind === "orchestrated-team" ? { teamId: detail.owner.teamId } : {}),
				owner: detail.owner,
				lastSeq: detail.lastSeq,
			},
		}),
	);
}
