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
	initWsClient,
	updateCurrentWsClientOptions,
} from "@/features/transport/lib/wsClientSingleton";
import {
	createStreamAbortScope,
	startQueryStreamState,
	stopQueryStreamState,
	type ExecuteQueryStreamOptions,
} from "@/features/transport/lib/queryStreamShared";
import {
	WS_STREAM_RETRY_DELAYS_MS,
	handleStreamReplayError,
} from "@/features/transport/lib/wsStreamReplay";

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
	if (!currentClient) {
		return initWsClient({ accessToken, resolveAccessToken: resolveQueryAccessToken });
	}

	return updateCurrentWsClientOptions({
		accessToken,
		resolveAccessToken: resolveQueryAccessToken,
	}) ?? currentClient;
}

function resolveQueryWsClientForRetry(
	retryIndex: number,
	appMode: boolean,
): Promise<QueryWsClient | null> {
	const reason: TokenRefreshReason = appMode && retryIndex === 0 ? "unauthorized" : "missing";
	return resolveQueryWsClient(reason);
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
			let receivedServerActivity = false;
			const retryCount = { current: 0 };
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

			const handleStreamError = (error: Error) => {
				if (error.name === "AbortError") {
					settle(() => resolve());
					return;
				}

				const handled = handleStreamReplayError(
					error,
					receivedServerActivity,
					{
						signal: abortController.signal,
						retryDelaysMs: WS_STREAM_RETRY_DELAYS_MS,
						getRetryClient: (retryIndex) =>
							resolveQueryWsClientForRetry(retryIndex, appMode)
								.then((client) => {
									if (!client) {
										throw toWsConnectionError(new Error("WebSocket transport is not initialized"));
									}
									return client;
								}),
						startStreamAttempt: (client) => {
							wsClient = client;
							startStream(client);
						},
					},
					retryCount,
					(finalError) => {
						settle(() => reject(finalError));
					},
				);

				if (!handled) {
					if (isWsConnectionFailure(error)) {
						settle(() => reject(toWsConnectionError(error)));
						return;
					}
					settle(() => reject(error));
				}
			};

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
						handleStreamError(error);
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
