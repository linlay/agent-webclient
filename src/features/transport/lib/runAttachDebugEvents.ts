import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent, AppState } from "@/app/state/types";
import type { LiveQuerySession } from "@/features/chats/lib/conversationSession";
import { isDebugRunObservationEnabled } from "@/shared/config/featureFlags";
import { toText } from "@/shared/utils/eventUtils";

export type RunAttachDebugStage =
	| "runObservationReleased"
	| "runStartedCandidate"
	| "runActivationSkipped"
	| "runActivationAttached"
	| "attachRunRequested"
	| "attachRunIgnored";

export interface RunAttachDebugSnapshot {
	stateChatId?: string;
	stateRunId?: string;
	stateStreaming?: boolean;
	activeRequestId?: string;
	activeSessionRunId?: string;
	activeSessionStreaming?: boolean;
	activeAttachRunId?: string;
	pathname?: string;
}

export interface RunAttachDebugInput extends RunAttachDebugSnapshot {
	stage: RunAttachDebugStage;
	chatId?: unknown;
	runId?: unknown;
	agentKey?: unknown;
	reason?: string;
}

export function readRunAttachDebugSnapshot(input: {
	state?: Pick<AppState, "chatId" | "runId" | "streaming"> | null;
	querySessionsRef?: { current: Map<string, LiveQuerySession> } | null;
	activeQuerySessionRequestIdRef?: { current: string } | null;
	activeAttachRef?: { current: { runId?: string } | null } | null;
	pathname?: string;
}): RunAttachDebugSnapshot {
	const activeRequestId = toText(input.activeQuerySessionRequestIdRef?.current);
	const activeSession = activeRequestId
		? input.querySessionsRef?.current.get(activeRequestId) || null
		: null;
	return {
		stateChatId: toText(input.state?.chatId),
		stateRunId: toText(input.state?.runId),
		stateStreaming: Boolean(input.state?.streaming),
		activeRequestId,
		activeSessionRunId: toText(activeSession?.runId),
		activeSessionStreaming: Boolean(activeSession?.streaming),
		activeAttachRunId: toText(input.activeAttachRef?.current?.runId),
		pathname: toText(input.pathname),
	};
}

export function dispatchRunAttachDebugEvent(
	dispatch: Dispatch<AppAction>,
	input: RunAttachDebugInput,
): void {
	if (!isDebugRunObservationEnabled()) {
		return;
	}
	const event: AgentEvent = {
		type: "debug.runObservation",
		timestamp: Date.now(),
	} as unknown as AgentEvent;
	const raw = event as Record<string, unknown>;
	for (const [key, value] of Object.entries({
		stage: toText(input.stage),
		chatId: toText(input.chatId),
		runId: toText(input.runId),
		agentKey: toText(input.agentKey),
		reason: toText(input.reason),
		stateChatId: toText(input.stateChatId),
		stateRunId: toText(input.stateRunId),
		stateStreaming: input.stateStreaming,
		activeRequestId: toText(input.activeRequestId),
		activeSessionRunId: toText(input.activeSessionRunId),
		activeSessionStreaming: input.activeSessionStreaming,
		activeAttachRunId: toText(input.activeAttachRunId),
		pathname: toText(input.pathname),
	})) {
		if (value === "" || value === undefined) {
			continue;
		}
		raw[key] = value;
	}
	dispatch({ type: "PUSH_EVENT", event });
}
