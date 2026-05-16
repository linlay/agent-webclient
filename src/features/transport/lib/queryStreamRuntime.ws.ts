import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import type { QueryStreamParams } from "@/shared/api/apiClient";
import {
	ensureAccessToken,
	getCurrentAccessToken,
} from "@/shared/api/apiClient";
import { buildDesktopQueryContext } from "@/shared/api/desktopQueryContext";
import {
	isWsConnectionFailure,
	toWsConnectionError,
} from "@/features/transport/lib/wsClient";
import { isAppMode } from "@/shared/utils/routing";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
} from "@/features/transport/lib/wsClientSingleton";

export interface ExecuteQueryStreamWsOptions {
	params: QueryStreamParams;
	dispatch: Dispatch<AppAction>;
	handleEvent: (event: AgentEvent) => void;
}

type QueryWsClient = NonNullable<ReturnType<typeof getWsClient>>;
type TokenRefreshReason = Parameters<typeof ensureAccessToken>[0];

async function resolveQueryAccessToken(
	reason: TokenRefreshReason = "missing",
): Promise<string> {
	let accessToken = String(getCurrentAccessToken() || "").trim();
	if (!accessToken || reason === "unauthorized") {
		accessToken = String(await ensureAccessToken(reason)).trim();
	}
	return accessToken;
}

async function resolveQueryWsClient(
	reason: TokenRefreshReason = "missing",
): Promise<QueryWsClient | null> {
	const accessToken = await resolveQueryAccessToken(reason);

	const currentClient = getWsClient();
	if (!currentClient && !accessToken) {
		return null;
	}
	if (!currentClient || getWsClientAccessToken() !== accessToken) {
		return initWsClient({ accessToken, resolveAccessToken: resolveQueryAccessToken });
	}
	if (typeof currentClient.updateOptions === "function") {
		currentClient.updateOptions({
			accessToken,
			resolveAccessToken: resolveQueryAccessToken,
		});
	}
	return currentClient;
}

export async function executeQueryStreamWs(
	options: ExecuteQueryStreamWsOptions,
): Promise<void> {
	const { dispatch, handleEvent, params } = options;
	let wsClient = await resolveQueryWsClient("missing");
	if (!wsClient) {
		throw toWsConnectionError(new Error("WebSocket transport is not initialized"));
	}
	const initialWsClient = wsClient;
	const appMode = isAppMode();

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

	try {
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			let retriedAfterRefresh = false;
			let receivedServerActivity = false;
			const settle = (callback: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				callback();
			};
			if (abortController.signal.aborted) {
				settle(() => resolve());
				return;
			}

			const startStream = (client: QueryWsClient) => {
				const queryParams = buildDesktopQueryContext(params.params);
				client.stream({
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
						...(queryParams !== undefined ? { params: queryParams } : {}),
						...(params.scene ? { scene: params.scene } : {}),
						...(params.stream !== undefined ? { stream: params.stream } : {}),
					},
					signal: abortController.signal,
					onEvent: (event) => {
						receivedServerActivity = true;
						handleEvent(event);
					},
					onFrame: (_rawFrame) => {
						receivedServerActivity = true;
					},
					onError: (error) => {
						if (error.name === "AbortError") {
							settle(() => resolve());
							return;
						}
						if (
							appMode
							&& isWsConnectionFailure(error)
							&& !retriedAfterRefresh
							&& !receivedServerActivity
							&& !abortController.signal.aborted
						) {
							retriedAfterRefresh = true;
							void (async () => {
								try {
									const refreshedClient = await resolveQueryWsClient("unauthorized");
									if (!refreshedClient || abortController.signal.aborted || settled) {
										settle(() => reject(toWsConnectionError(error)));
										return;
									}
									wsClient = refreshedClient;
									await wsClient.connect();
									if (abortController.signal.aborted || settled) {
										return;
									}
									startStream(wsClient);
								} catch (refreshError) {
									settle(() =>
										reject(
											toWsConnectionError(
												isWsConnectionFailure(refreshError)
													? refreshError
													: error,
											),
										),
									);
								}
							})();
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
			};

			startStream(initialWsClient);

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
