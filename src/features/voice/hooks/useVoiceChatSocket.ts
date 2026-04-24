import { useCallback } from "react";
import {
	DEFAULT_VOICE_CHAT_SEND_PAUSE_MS,
	describeVoiceChatWsTarget,
	mergeVoiceChatUtterance,
	normalizeVoiceChatUtteranceForLength,
	resolveVoiceChatWsUrl,
} from "@/features/voice/lib/voiceChatAudio";
import {
	formatVoiceSocketClose,
	MAX_VOICE_WS_RECONNECT_ATTEMPTS,
	QA_ASR_TASK_ID,
	type VoiceTaskEvent,
	VOICE_WS_RECONNECT_BASE_DELAY_MS,
} from "@/features/voice/lib/voiceChatRuntimeUtils";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { t } from "@/shared/i18n";
import type { VoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";

export function useVoiceChatSocket({
	controller,
	enterListeningReady,
	startAsrTask,
	submitVoiceChatQuery,
}: {
	controller: VoiceChatRuntimeController;
	enterListeningReady: (options: { resumeCapture: boolean }) => Promise<void>;
	startAsrTask: (reason: string) => boolean;
	submitVoiceChatQuery: (finalText: string) => Promise<void>;
}) {
	const connectSocket = useCallback(async () => {
		if (controller.socketRef.current?.readyState === WebSocket.OPEN) {
			return controller.socketRef.current;
		}
		if (controller.socketPromiseRef.current) {
			return controller.socketPromiseRef.current;
		}

		const wsPath =
			controller.stateRef.current.voiceChat.capabilities?.websocketPath ||
			"/api/voice/ws";
		const accessToken = await controller.ensureVoiceAccessToken();
		if (!accessToken) {
			throw new Error("voice access_token is required");
		}
		const url = resolveVoiceChatWsUrl(wsPath, accessToken);
		controller.appendDebug(`connect ${describeVoiceChatWsTarget(wsPath)}`);
		controller.patchVoiceChat({ wsStatus: "connecting" });

		controller.socketPromiseRef.current = new Promise<WebSocket>(
			(resolve, reject) => {
				let settled = false;
				try {
					const socket = new WebSocket(url);
					socket.binaryType = "arraybuffer";
					controller.socketRef.current = socket;

					socket.onopen = () => {
						if (settled) return;
						settled = true;
						controller.socketPromiseRef.current = null;
						controller.patchVoiceChat({ wsStatus: "open" });
						controller.appendDebug("socket open");
						resolve(socket);
					};

					socket.onmessage = async (event) => {
						if (typeof event.data !== "string") {
							return;
						}
						try {
							const message = JSON.parse(event.data) as VoiceTaskEvent;
							if (message.taskId !== QA_ASR_TASK_ID) {
								return;
							}
							if (message.type === "task.started") {
								controller.asrTaskActiveRef.current = true;
								controller.asrStartInFlightRef.current = false;
								controller.reconnectAttemptRef.current = 0;
								if (controller.ttsTaskActiveRef.current) {
									controller.appendDebug(
										"received task.started for asr while tts is active",
									);
									return;
								}
								if (
									controller.audioCaptureStateRef.current.captureStarted &&
									!controller.capturePausedRef.current
								) {
									controller.appendDebug(
										"received task.started for asr while capture is already active",
									);
									controller.patchVoiceChat({
										sessionActive: true,
										error: "",
										wsStatus: "open",
									});
									return;
								}
								controller.appendDebug("received task.started for asr");
								void enterListeningReady({ resumeCapture: false }).catch(
									() => undefined,
								);
								return;
							}
							if (message.type === "asr.text.final" && message.text) {
								if (controller.ttsTaskActiveRef.current) {
									const bargeText = message.text.trim();
									if (
										bargeText &&
										normalizeVoiceChatUtteranceForLength(bargeText).length > 2
									) {
										controller.appendDebug(`barge-in triggered: "${bargeText}"`);
										controller.bargeInProgressRef.current = true;
										getVoiceRuntime()?.stopAllVoiceSessions("barge_in", {
											mode: "stop",
										});
										controller.stateRef.current.abortController?.abort();
										controller.clearFlushTimer();
										controller.pendingUtteranceRef.current = "";
										controller.ttsTaskActiveRef.current = false;
										controller.patchVoiceChat({
											activeAssistantContentId: "",
											activeRequestId: "",
											activeTtsTaskId: "",
											ttsCommitted: false,
											partialUserText: bargeText,
											partialAssistantText: "",
											error: "",
										});
										void submitVoiceChatQuery(bargeText).catch((error) =>
											controller.handleFatalError(
												error instanceof Error
													? error.message
													: String(error),
											),
										);
									}
									return;
								}
								const merged = mergeVoiceChatUtterance(
									controller.pendingUtteranceRef.current,
									message.text,
								);
								controller.pendingUtteranceRef.current = merged;
								controller.patchVoiceChat({
									partialUserText: merged,
									error: "",
								});
								controller.clearFlushTimer();
								controller.flushTimerRef.current = window.setTimeout(() => {
									controller.flushTimerRef.current = null;
									const finalText =
										controller.pendingUtteranceRef.current.trim();
									controller.pendingUtteranceRef.current = "";
									if (!finalText) return;
									if (
										normalizeVoiceChatUtteranceForLength(finalText).length <= 2
									) {
										controller.patchVoiceChat({ status: "listening" });
										return;
									}
									void submitVoiceChatQuery(finalText).catch((error) =>
										controller.handleFatalError(
											error instanceof Error ? error.message : String(error),
										),
									);
								}, DEFAULT_VOICE_CHAT_SEND_PAUSE_MS);
								return;
							}
							if (message.type === "error") {
								controller.asrTaskActiveRef.current = false;
								controller.asrStartInFlightRef.current = false;
								controller.handleFatalError(
									`${message.code || "ERROR"}: ${
										message.message || t("voice.chat.error.asrFailure")
									}`,
								);
								return;
							}
							if (message.type === "task.stopped") {
								controller.asrTaskActiveRef.current = false;
								controller.asrStartInFlightRef.current = false;
								controller.appendDebug(
									`asr task stopped: ${
										message.reason ? `reason=${message.reason}` : "no reason"
									}`,
								);
								if (controller.stateRef.current.inputMode === "voice") {
									if (controller.ttsTaskActiveRef.current) {
										controller.asrRestartPendingRef.current = true;
										controller.appendDebug(
											"defer asr restart until tts finishes",
										);
										return;
									}
									const restarted = startAsrTask(
										"recover after asr task.stopped",
									);
									if (!restarted) {
										controller.scheduleVoiceReconnectRef.current(
											message.reason || t("voice.chat.error.taskStopped"),
										);
									}
								}
							}
						} catch (error) {
							controller.appendDebug(
								`message parse failed: ${
									error instanceof Error ? error.message : String(error)
								}`,
							);
						}
					};

					socket.onerror = () => {
						controller.appendDebug("socket error event");
						if (!settled) {
							settled = true;
							controller.socketPromiseRef.current = null;
							reject(new Error(t("voice.chat.error.connectionFailed")));
							return;
						}
						controller.asrTaskActiveRef.current = false;
						controller.asrStartInFlightRef.current = false;
						controller.asrRestartPendingRef.current = false;
						controller.ttsTaskActiveRef.current = false;
						controller.patchVoiceChat({ wsStatus: "error" });
						try {
							if (
								socket.readyState === WebSocket.OPEN ||
								socket.readyState === WebSocket.CONNECTING
							) {
								socket.close(1011, "voice socket error");
							}
						} catch {
							/* no-op */
						}
					};

					socket.onclose = (event) => {
						controller.socketPromiseRef.current = null;
						controller.socketRef.current = null;
						controller.asrTaskActiveRef.current = false;
						controller.asrStartInFlightRef.current = false;
						controller.asrRestartPendingRef.current = false;
						controller.ttsTaskActiveRef.current = false;
						const closeEvent = event as CloseEvent;
						controller.appendDebug(
							`socket closed: code=${String(closeEvent?.code ?? "-")}, reason=${String(closeEvent?.reason || "").trim() || "-"}, clean=${Boolean(closeEvent?.wasClean)}`,
						);
						const closeMessage = formatVoiceSocketClose(event);
						const expected = controller.expectedCloseRef.current;
						controller.expectedCloseRef.current = false;
						if (expected) {
							controller.patchVoiceChat({ wsStatus: "closed" });
							return;
						}
						if (controller.stateRef.current.inputMode === "voice") {
							if (controller.isVoiceRecoveryEligible()) {
								controller.scheduleVoiceReconnectRef.current(closeMessage);
								return;
							}
							controller.handleFatalError(closeMessage);
						}
					};
				} catch (error) {
					controller.socketPromiseRef.current = null;
					reject(error as Error);
				}
			},
		);

		return controller.socketPromiseRef.current;
	}, [controller, enterListeningReady, startAsrTask, submitVoiceChatQuery]);

	const scheduleVoiceReconnect = useCallback(
		(reason: string) => {
			if (!controller.isVoiceRecoveryEligible()) {
				return;
			}
			if (
				controller.reconnectTimerRef.current != null ||
				controller.reconnectInFlightRef.current
			) {
				controller.appendDebug(`skip reconnect scheduling: ${reason}`);
				return;
			}

			const attempt = controller.reconnectAttemptRef.current + 1;
			controller.reconnectAttemptRef.current = attempt;
			if (attempt > MAX_VOICE_WS_RECONNECT_ATTEMPTS) {
				controller.handleFatalError(
					t("voice.chat.error.linkRecoveryFailed", { reason }),
				);
				return;
			}

			const delay = Math.min(
				VOICE_WS_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
				4000,
			);
			controller.patchVoiceChat({
				status: "connecting",
				sessionActive: false,
				error: "",
				wsStatus: "connecting",
			});
			controller.appendDebug(
				`schedule reconnect #${attempt} in ${delay}ms: ${reason}`,
			);
			controller.reconnectTimerRef.current = window.setTimeout(() => {
				controller.reconnectTimerRef.current = null;
				if (
					!controller.isVoiceRecoveryEligible() ||
					controller.reconnectInFlightRef.current
				) {
					return;
				}
				controller.reconnectInFlightRef.current = true;
				controller.appendDebug(`reconnect attempt #${attempt}: ${reason}`);
				void (async () => {
					let nextReason = "";
					try {
						await connectSocket();
						if (!controller.isVoiceRecoveryEligible()) {
							return;
						}
						const started = startAsrTask(`reconnect attempt #${attempt}`);
						if (!started) {
							throw new Error(t("voice.chat.error.reconnectStartAsrFailed"));
						}
						controller.reconnectAttemptRef.current = 0;
						controller.patchVoiceChat({
							error: "",
							wsStatus: "open",
						});
					} catch (error) {
						nextReason =
							error instanceof Error ? error.message : String(error);
						controller.appendDebug(
							`reconnect attempt #${attempt} failed: ${nextReason}`,
						);
					} finally {
						controller.reconnectInFlightRef.current = false;
						if (nextReason) {
							scheduleVoiceReconnect(nextReason);
						}
					}
				})();
			}, delay);
		},
		[connectSocket, controller, startAsrTask],
	);

	controller.scheduleVoiceReconnectRef.current = scheduleVoiceReconnect;

	return {
		connectSocket,
		scheduleVoiceReconnect,
	};
}

