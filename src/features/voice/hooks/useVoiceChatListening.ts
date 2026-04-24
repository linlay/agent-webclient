import { useCallback } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { createRequestId } from "@/shared/api/apiClient";
import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";
import { runVoiceChatListeningReady } from "@/features/voice/lib/voiceChatListeningReady";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import type { VoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";

export function useVoiceChatListening({
	controller,
	currentWorker,
	dispatch,
	ensureAudioCapture,
	handleEvent,
	resumeAudioCapture,
	startAsrTask,
}: {
	controller: VoiceChatRuntimeController;
	currentWorker: CurrentWorkerSummary | null;
	dispatch: Dispatch<AppAction>;
	ensureAudioCapture: () => Promise<boolean>;
	handleEvent: (event: AgentEvent) => void;
	resumeAudioCapture: () => Promise<boolean>;
	startAsrTask: (reason: string) => boolean;
}) {
	const enterListeningReady = useCallback(
		async (options: { resumeCapture: boolean }) => {
			const transitionId = controller.listeningTransitionRef.current + 1;
			controller.listeningTransitionRef.current = transitionId;

			await runVoiceChatListeningReady({
				transitionId,
				resumeCapture: options.resumeCapture,
				isCurrent: (id) =>
					id === controller.listeningTransitionRef.current &&
					controller.stateRef.current.inputMode === "voice" &&
					!Boolean(controller.stateRef.current.voiceChat.error),
				waitForIdle: async () => undefined,
				playReadyCue: async () => {
					try {
						await controller.readyCuePlayerRef.current.playReadyCue();
					} catch (error) {
						controller.appendDebug(
							`ready cue failed: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}
				},
				ensureAudioCapture,
				resumeAudioCapture,
				onListeningReady: () => {
					controller.patchVoiceChat({
						status: "listening",
						sessionActive: true,
						error: "",
						wsStatus: "open",
					});
				},
			});
		},
		[controller, ensureAudioCapture, resumeAudioCapture],
	);

	const resumeListeningAfterResponse = useCallback(
		async (reason: string) => {
			if (
				controller.stateRef.current.inputMode !== "voice" ||
				Boolean(controller.stateRef.current.voiceChat.error)
			) {
				return;
			}
			if (
				controller.asrRestartPendingRef.current ||
				controller.asrStartInFlightRef.current ||
				!controller.asrTaskActiveRef.current
			) {
				const restarted = startAsrTask(reason);
				if (!restarted && !controller.asrStartInFlightRef.current) {
					controller.scheduleVoiceReconnectRef.current(
						"voice response completed without active asr",
					);
				}
				return;
			}
			await enterListeningReady({
				resumeCapture: true,
			});
		},
		[controller, enterListeningReady, startAsrTask],
	);

	const submitVoiceChatQuery = useCallback(
		async (finalText: string) => {
			const text = String(finalText || "").trim();
			if (!text) return;

			const chatId = String(controller.stateRef.current.chatId || "").trim();
			let agentKey = chatId
				? String(controller.stateRef.current.chatAgentById.get(chatId) || "").trim()
				: "";
			if (!agentKey) {
				agentKey = String(
					controller.stateRef.current.voiceChat.currentAgentKey ||
						currentWorker?.sourceId ||
						controller.stateRef.current.pendingNewChatAgentKey ||
						"",
				).trim();
			}

			if (agentKey) {
				dispatch({
					type: "SET_WORKER_PRIORITY_KEY",
					workerKey: `agent:${agentKey}`,
				});
			}
			if (!chatId && agentKey) {
				dispatch({
					type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
					agentKey,
				});
			}

			const requestId = createRequestId("req");
			controller.createTurnNodes(text);
			controller.cancelListeningTransition();
			controller.ttsTaskActiveRef.current = true;
			controller.patchVoiceChat({
				status: "thinking",
				sessionActive: true,
				partialUserText: text,
				partialAssistantText: "",
				activeAssistantContentId: "",
				activeRequestId: requestId,
				activeTtsTaskId: "",
				ttsCommitted: false,
				error: "",
			});

			try {
				await executeQueryStreamWs({
					params: {
						requestId,
						message: text,
						agentKey: agentKey || undefined,
						chatId: chatId || undefined,
						planningMode: Boolean(controller.stateRef.current.planningMode),
					},
					dispatch,
					handleEvent,
				});

				const activeAssistantContentId = String(
					controller.stateRef.current.voiceChat.activeAssistantContentId || "",
				).trim();
				if (activeAssistantContentId) {
					controller.patchVoiceChat({
						ttsCommitted: true,
					});
					await getVoiceRuntime()?.commitVoiceChatSession(
						activeAssistantContentId,
					);
				}
				controller.patchVoiceChat({
					activeAssistantContentId: "",
					activeRequestId: "",
					activeTtsTaskId: "",
					ttsCommitted: false,
					error: "",
				});
				await resumeListeningAfterResponse("resume after voice query");
			} catch (error) {
				if (controller.bargeInProgressRef.current) {
					controller.bargeInProgressRef.current = false;
					return;
				}
				const activeAssistantContentId = String(
					controller.stateRef.current.voiceChat.activeAssistantContentId || "",
				).trim();
				if (activeAssistantContentId) {
					getVoiceRuntime()?.stopVoiceChatSession(activeAssistantContentId);
				}
				controller.patchVoiceChat({
					activeAssistantContentId: "",
					activeRequestId: "",
					activeTtsTaskId: "",
					ttsCommitted: false,
				});
				if (error instanceof Error && error.name === "AbortError") {
					controller.patchVoiceChat({
						status: "connecting",
						error: "",
					});
					await resumeListeningAfterResponse("resume after voice abort");
					return;
				}
				controller.handleFatalError(
					error instanceof Error ? error.message : String(error),
				);
			} finally {
				if (!controller.bargeInProgressRef.current) {
					controller.ttsTaskActiveRef.current = false;
				}
			}
		},
		[
			controller,
			currentWorker,
			dispatch,
			handleEvent,
			resumeListeningAfterResponse,
		],
	);

	return {
		enterListeningReady,
		resumeListeningAfterResponse,
		submitVoiceChatQuery,
	};
}
