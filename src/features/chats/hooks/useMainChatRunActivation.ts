import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import type { LiveQuerySession } from "@/features/chats/lib/conversationSession";
import {
	AGENT_RUN_STARTED_PUSH_EVENT,
	resolveMainChatRunActivation,
	type MainChatRunActivationDecision,
} from "@/features/chats/lib/mainChatRunActivation";

type MainChatRunActivationDispatch = Dispatch<AppAction>;

interface RegisterMainChatRunActivationListenerOptions {
	dispatch: MainChatRunActivationDispatch;
	stateRef: { current: AppState };
	querySessionsRef: { current: Map<string, LiveQuerySession> };
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
	agentKey = "",
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
			detail: { chatId, runId, lastSeq, agentKey },
		}),
	);
}

function appendIgnoredDebug(
	dispatch: MainChatRunActivationDispatch,
	decision: Extract<MainChatRunActivationDecision, { shouldActivate: false }>,
): void {
	if (decision.reason === "missing_identity") {
		dispatch({
			type: "APPEND_DEBUG",
			line: `[main chat run] ignored run.started without attach identity (chatId=${decision.chatId || "-"}, runId=${decision.runId || "-"}, agentKey=${decision.agentKey || "-"})`,
		});
	}
}

function hasActiveObservation(
	options: Pick<
		RegisterMainChatRunActivationListenerOptions,
		"stateRef" | "querySessionsRef" | "activeQuerySessionRequestIdRef"
	>,
	decision: Extract<MainChatRunActivationDecision, { shouldActivate: true }>,
): boolean {
	if (options.stateRef.current.streaming) {
		return true;
	}
	const activeRequestId = String(options.activeQuerySessionRequestIdRef.current || "").trim();
	const activeSession = activeRequestId
		? options.querySessionsRef.current.get(activeRequestId) || null
		: null;
	if (activeSession?.streaming) {
		return true;
	}
	if (activeSession?.runId && activeSession.runId === decision.runId) {
		return true;
	}
	for (const session of options.querySessionsRef.current.values()) {
		if (session.runId && session.runId === decision.runId) {
			return true;
		}
	}
	return false;
}

function activateMainChatRun(
	options: RegisterMainChatRunActivationListenerOptions,
	decision: Extract<MainChatRunActivationDecision, { shouldActivate: true }>,
): void {
	if (hasActiveObservation(options, decision)) {
		return;
	}
	const key = runKey(decision.chatId, decision.runId);
	if (options.handledRunKeysRef.current.has(key)) {
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

	options.dispatch({
		type: "SET_CHAT_AGENT_BY_ID",
		chatId: decision.chatId,
		agentKey: decision.agentKey,
	});
	options.dispatch({
		type: "SET_RUN_AGENT_BY_ID",
		runId: decision.runId,
		agentKey: decision.agentKey,
	});
	options.dispatch({
		type: "SET_CURRENT_CHAT_ACTIVE_RUN",
		activeRun: {
			chatId: decision.chatId,
			runId: decision.runId,
			agentKey: decision.agentKey,
			lastSeq: decision.lastSeq,
		},
	});
	options.dispatch({ type: "SET_RUN_ID", runId: decision.runId });
	options.dispatch({
		type: "SET_CURRENT_RUN_AGENT_KEY",
		agentKey: decision.agentKey,
	});

	dispatchAttachRunEvent(
		decision.chatId,
		decision.runId,
		decision.lastSeq,
		decision.agentKey,
	);
}

export function registerMainChatRunActivationListener(
	options: RegisterMainChatRunActivationListenerOptions,
): () => void {
	const getPathname = options.getPathname ?? currentPathname;
	const handler = (event: Event) => {
		const decision = resolveMainChatRunActivation({
			state: options.stateRef.current,
			detail: (event as CustomEvent).detail,
			pathname: getPathname(),
		});
		if (!decision.shouldActivate) {
			appendIgnoredDebug(options.dispatch, decision);
			return;
		}
		activateMainChatRun(options, decision);
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
