import type { Dispatch } from "react";
import type { AppAction } from "../context/AppContext";
import type { AgentEvent } from "../context/types";
import { createQueryStream, type QueryStreamParams } from "./apiClient";
import { consumeJsonSseStream } from "./sseParser";

export interface ExecuteQueryStreamOptions {
	params: QueryStreamParams;
	dispatch: Dispatch<AppAction>;
	handleEvent: (event: AgentEvent) => void;
}

export async function executeQueryStream(
	options: ExecuteQueryStreamOptions,
): Promise<void> {
	const { dispatch, handleEvent, params } = options;
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
		const response = await createQueryStream({
			...params,
			signal: abortController.signal,
		});

		if (!response.ok) {
			const text = await response.text();
			let errMsg: string;
			try {
				const json = JSON.parse(text);
				errMsg = json?.msg
					? `${json.msg} (HTTP ${response.status})`
					: `HTTP ${response.status}: ${text}`;
			} catch {
				errMsg = `HTTP ${response.status}: ${text}`;
			}
			throw new Error(errMsg);
		}

		await consumeJsonSseStream(response, {
			signal: abortController.signal,
			onFrame: (frame) => {
				dispatch({
					type: "APPEND_RAW_SSE_ENTRY",
					entry: {
						receivedAt: frame.receivedAt,
						rawFrame: frame.rawFrame,
						parsedEventName: frame.event,
					},
				});
			},
			onJson: (json) => {
				handleEvent(json as AgentEvent);
			},
			onParseError: (error, rawData) => {
				dispatch({
					type: "APPEND_DEBUG",
					line: `[SSE parse error] ${error.message}: ${rawData.slice(0, 200)}`,
				});
			},
		});
	} finally {
		if (externalSignal) {
			externalSignal.removeEventListener("abort", forwardAbort);
		}
		dispatch({ type: "SET_STREAMING", streaming: false });
		dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
	}
}
