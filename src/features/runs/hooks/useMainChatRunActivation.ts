import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import type { RunSession } from "@/features/runs/lib/runSession";
import type { RunOwner } from "@/shared/data/runOwner";
import {
	AGENT_RUN_STARTED_PUSH_EVENT,
	resolveMainChatRunActivation,
	type MainChatRunActivationDecision,
} from "@/features/runs/lib/mainChatRunActivation";
import {
	dispatchRunAttachDebugEvent,
	readRunAttachDebugSnapshot,
	type RunAttachDebugSnapshot,
} from "@/features/runs/lib/runAttachDebugEvents";

type MainChatRunActivationDispatch = Dispatch<AppAction>;

interface RegisterMainChatRunActivationListenerOptions {
	dispatch: MainChatRunActivationDispatch;
	stateRef: { current: AppState };
	querySessionsRef: { current: ReadonlyMap<string, RunSession> };
	activeQuerySessionRequestIdRef: { current: string };
	handledRunKeysRef: { current: Set<string> };
	getPathname?: () => string;
}

function currentPathname(): string {
	return typeof window === "undefined" ? "" : window.location.pathname;
}

function runKey(chatId: string, runId: string): string {
	return `${chatId}\u0000${runId}`;
}

function dispatchAttachRunEvent(
	chatId: string,
	runId: string,
	lastSeq = 0,
	owner: RunOwner,
): void {
	if (
		typeof window === "undefined" ||
		typeof window.dispatchEvent !== "function" ||
		typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(
		new CustomEvent("agent:attach-run", {
		detail: {
			chatId,
			runId,
			lastSeq,
			...(owner.kind === "agent" ? { agentKey: owner.agentKey } : {}),
			...(owner.kind === "orchestrated-team" ? { teamId: owner.teamId } : {}),
			owner,
		},
		}),
	);
}

type ActiveObservationResult =
	| { blocked: false; snapshot: RunAttachDebugSnapshot }
	| { blocked: true; reason: string; snapshot: RunAttachDebugSnapshot };

function resolveActiveObservation(
	options: Pick<
		RegisterMainChatRunActivationListenerOptions,
		"stateRef" | "querySessionsRef" | "activeQuerySessionRequestIdRef"
	>,
	decision: Extract<MainChatRunActivationDecision, { shouldActivate: true }>,
	pathname: string,
): ActiveObservationResult {
	const snapshot = readRunAttachDebugSnapshot({
		state: options.stateRef.current,
		querySessionsRef: options.querySessionsRef,
		activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
		pathname,
	});
	const activeRequestId = String(options.activeQuerySessionRequestIdRef.current || "").trim();
	const activeSession = activeRequestId
		? options.querySessionsRef.current.get(activeRequestId) || null
		: null;
	if (activeSession?.streaming) {
		return { blocked: true, reason: "active_session_streaming", snapshot };
	}
	if (activeSession?.runId && activeSession.runId === decision.runId) {
		return { blocked: true, reason: "active_session_same_run", snapshot };
	}
	for (const session of options.querySessionsRef.current.values()) {
		if (session.runId && session.runId === decision.runId) {
			return { blocked: true, reason: "already_observing_new_run", snapshot };
		}
	}
	return { blocked: false, snapshot };
}

function activateMainChatRun(
	options: RegisterMainChatRunActivationListenerOptions,
	decision: Extract<MainChatRunActivationDecision, { shouldActivate: true }>,
	pathname: string,
): void {
	const observation = resolveActiveObservation(options, decision, pathname);
	if (observation.blocked) {
		dispatchRunAttachDebugEvent(options.dispatch, {
			stage: "runActivationSkipped",
			chatId: decision.chatId,
			runId: decision.runId,
			agentKey: decision.agentKey,
			reason: observation.reason,
			...observation.snapshot,
		});
		return;
	}
	const key = runKey(decision.chatId, decision.runId);
	if (options.handledRunKeysRef.current.has(key)) {
		dispatchRunAttachDebugEvent(options.dispatch, {
			stage: "runActivationSkipped",
			chatId: decision.chatId,
			runId: decision.runId,
			agentKey: decision.agentKey,
			reason: "duplicate_push",
			...observation.snapshot,
		});
		return;
	}
	options.handledRunKeysRef.current.add(key);

	if (decision.switchChat) {
		options.dispatch({ type: "SET_CHAT_ID", chatId: decision.chatId });
		options.dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
		if (
			typeof window !== "undefined" &&
			typeof window.dispatchEvent === "function" &&
			typeof CustomEvent === "function"
		) {
			window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
			window.dispatchEvent(new CustomEvent("agent:voice-reset"));
		}
	}

	if (decision.owner.kind === "agent") {
		options.dispatch({
			type: "SET_CHAT_AGENT_BY_ID",
			chatId: decision.chatId,
			agentKey: decision.owner.agentKey,
		});
		options.dispatch({
			type: "SET_RUN_AGENT_BY_ID",
			runId: decision.runId,
			agentKey: decision.owner.agentKey,
		});
	}
	options.dispatch({
		type: "SET_CURRENT_CHAT_ACTIVE_RUN",
		activeRun: {
			chatId: decision.chatId,
			runId: decision.runId,
			...(decision.owner.kind === "agent" ? { agentKey: decision.owner.agentKey } : {}),
			...(decision.owner.kind === "orchestrated-team" ? { teamId: decision.owner.teamId } : {}),
			owner: decision.owner,
			lastSeq: decision.lastSeq,
			...(typeof decision.editingMode === "boolean"
				? { editingMode: decision.editingMode }
				: {}),
		},
	});
	options.dispatch({ type: "SET_RUN_ID", runId: decision.runId });
	if (decision.owner.kind === "agent") {
		options.dispatch({
			type: "SET_CURRENT_RUN_AGENT_KEY",
			agentKey: decision.owner.agentKey,
		});
	}

	dispatchRunAttachDebugEvent(options.dispatch, {
		stage: "runActivationAttached",
		chatId: decision.chatId,
		runId: decision.runId,
		agentKey: decision.agentKey,
		reason: observation.snapshot.stateStreaming
			? "stale_state_streaming_ignored"
			: undefined,
		...observation.snapshot,
	});

	dispatchAttachRunEvent(
		decision.chatId,
		decision.runId,
		decision.lastSeq,
		decision.owner,
	);
}

export function registerMainChatRunActivationListener(
	options: RegisterMainChatRunActivationListenerOptions,
): () => void {
	const getPathname = options.getPathname ?? currentPathname;
	const handler = (event: Event) => {
		const pathname = getPathname();
		const decision = resolveMainChatRunActivation({
			state: options.stateRef.current,
			detail: (event as CustomEvent).detail,
			pathname,
		});
		if (!decision.shouldActivate) {
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "runActivationSkipped",
				chatId: decision.chatId,
				runId: decision.runId,
				agentKey: decision.agentKey,
				reason: decision.reason,
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					pathname,
				}),
			});
			return;
		}
		activateMainChatRun(options, decision, pathname);
	};

	if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
		window.addEventListener(AGENT_RUN_STARTED_PUSH_EVENT, handler);
	}

	return () => {
		if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
			window.removeEventListener(AGENT_RUN_STARTED_PUSH_EVENT, handler);
		}
	};
}

export function useMainChatRunActivation(): void {
	const {
		dispatch,
		stateRef,
		querySessionsRef,
		activeQuerySessionRequestIdRef,
	} = useAppContext();
	const handledRunKeysRef = useRef(new Set<string>());

	useEffect(
		() =>
			registerMainChatRunActivationListener({
				dispatch,
				stateRef,
				querySessionsRef,
				activeQuerySessionRequestIdRef,
				handledRunKeysRef,
			}),
		[activeQuerySessionRequestIdRef, dispatch, querySessionsRef, stateRef],
	);
}
