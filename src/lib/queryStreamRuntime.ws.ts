import type { Dispatch } from "react";
import type { AppAction } from "../context/AppContext";
import type { AgentEvent } from "../context/types";
import type { QueryStreamParams } from "./apiClient";
import {
	isWsConnectionFailure,
	toWsConnectionError,
} from "./wsClient";
import { getWsClient } from "./wsClientSingleton";

export interface ExecuteQueryStreamWsOptions {
	params: QueryStreamParams;
	dispatch: Dispatch<AppAction>;
	handleEvent: (event: AgentEvent) => void;
}

export async function executeQueryStreamWs(
	options: ExecuteQueryStreamWsOptions,
): Promise<void> {
	const { dispatch, handleEvent, params } = options;
	const wsClient = getWsClient();
	if (!wsClient) {
		throw toWsConnectionError(new Error("WebSocket transport is not initialized"));
	}

	const abortController = new AbortController();
	const externalSignal = params.signal;
	const forwardAbort = () => abortController.abort();

	if (externalSignal) {
		if (externalSignal.aborted) {
			abortController.abort();
		} else {
			externalSignal.addEventListener("abort", forwardAbort, {
				once: true,
			});
		}
	}

	dispatch({ type: "SET_REQUEST_ID", requestId: params.requestId });
	dispatch({ type: "SET_STREAMING", streaming: true });
	dispatch({
		type: "SET_ABORT_CONTROLLER",
		controller: abortController,
	});
	dispatch({ type: "CLEAR_RAW_SSE_ENTRIES" });

	try {
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const settle = (callback: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				callback();
			};

			wsClient.stream({
				type: "/api/query",
				payload: {
					requestId: params.requestId,
					planningMode: params.planningMode ?? false,
					message: params.message,
					...(params.agentKey ? { agentKey: params.agentKey } : {}),
					...(params.teamId ? { teamId: params.teamId } : {}),
					...(params.chatId ? { chatId: params.chatId } : {}),
					...(params.role ? { role: params.role } : {}),
					...(params.references !== undefined
						? { references: params.references }
						: {}),
					...(params.params !== undefined ? { params: params.params } : {}),
					...(params.scene ? { scene: params.scene } : {}),
					...(params.stream !== undefined ? { stream: params.stream } : {}),
				},
				signal: abortController.signal,
				onEvent: handleEvent,
				onFrame: (rawFrame) => {
					dispatch({
						type: "APPEND_RAW_SSE_ENTRY",
						entry: {
							receivedAt: Date.now(),
							rawFrame,
							parsedEventName: "ws",
						},
					});
				},
				onError: (error) => {
					if (error.name === "AbortError") {
						settle(() => resolve());
						return;
					}
					if (isWsConnectionFailure(error)) {
						settle(() => reject(toWsConnectionError(error)));
						return;
					}
					settle(() => reject(error));
				},
				onDone: (_reason, _lastSeq) => {
					settle(() => resolve());
				},
			});

			abortController.signal.addEventListener(
				"abort",
				() => {
					settle(() => resolve());
				},
				{ once: true },
			);
		});
	} finally {
		if (externalSignal) {
			externalSignal.removeEventListener("abort", forwardAbort);
		}
		dispatch({ type: "SET_STREAMING", streaming: false });
		dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
	}
}
