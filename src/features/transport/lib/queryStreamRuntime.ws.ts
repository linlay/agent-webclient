import {
	compactQueryModelOverride,
	ensureAccessToken,
	getCurrentAccessToken,
} from "@/shared/api/apiClient";
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
import {
	createStreamAbortScope,
	startQueryStreamState,
	stopQueryStreamState,
	type ExecuteQueryStreamOptions,
} from "@/features/transport/lib/queryStreamShared";

export type ExecuteQueryStreamWsOptions = ExecuteQueryStreamOptions;

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

	const { abortController, cleanup } = createStreamAbortScope(params.signal);

	startQueryStreamState(dispatch, params.requestId, abortController);

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
				const model = compactQueryModelOverride(params.model);
				client.stream({
					type: "/api/query",
					payload: {
						requestId: params.requestId,
						planningMode: params.planningMode ?? false,
						message: params.message,
						...(params.agentKey ? { agentKey: params.agentKey } : {}),
						...(params.teamId ? { teamId: params.teamId } : {}),
						...(params.chatId ? { chatId: params.chatId } : {}),
						...(params.accessLevel ? { accessLevel: params.accessLevel } : {}),
						...(model ? { model } : {}),
						...(params.role ? { role: params.role } : {}),
						...(params.references !== undefined
							? { references: params.references }
							: {}),
						...(params.params !== undefined ? { params: params.params } : {}),
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
		cleanup();
		stopQueryStreamState(dispatch);
	}
}
