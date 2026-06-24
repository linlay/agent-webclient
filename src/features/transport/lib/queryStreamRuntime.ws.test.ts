import {
	executeQueryStreamWs,
} from "@/features/transport/lib/queryStreamRuntime.ws";
import {
	WS_STREAM_RETRY_DELAYS_MS,
} from "@/features/transport/lib/wsStreamReplay";
import {
	ensureAccessToken,
	getCurrentAccessToken,
} from "@/shared/api/apiClient";
import { isAppMode } from "@/shared/utils/routing";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
	updateCurrentWsClientOptions,
} from "@/features/transport/lib/wsClientSingleton";

jest.mock("./wsClientSingleton", () => ({
	getWsClient: jest.fn(),
	getWsClientAccessToken: jest.fn(),
	initWsClient: jest.fn(),
	updateCurrentWsClientOptions: jest.fn(),
}));

jest.mock("@/shared/api/apiClient", () => ({
	compactQueryModelOverride: jest.fn((model: unknown) => {
		if (!model || typeof model !== "object") return null;
		const record = model as Record<string, unknown>;
		const key = String(record.key || "").trim();
		const reasoningEffort = String(record.reasoningEffort || "").trim();
		return key || reasoningEffort
			? {
					...(key ? { key } : {}),
					...(reasoningEffort ? { reasoningEffort } : {}),
				}
			: null;
	}),
	ensureAccessToken: jest.fn(),
	getCurrentAccessToken: jest.fn(),
}));

jest.mock("@/shared/utils/routing", () => ({
	isAppMode: jest.fn(),
}));

async function advanceQueryWsRetryDelays(): Promise<void> {
	for (const delayMs of WS_STREAM_RETRY_DELAYS_MS) {
		await jest.advanceTimersByTimeAsync(delayMs);
	}
}

describe("executeQueryStreamWs", () => {
	const getWsClientMock = getWsClient as jest.MockedFunction<typeof getWsClient>;
	const getWsClientAccessTokenMock = getWsClientAccessToken as jest.MockedFunction<typeof getWsClientAccessToken>;
	const initWsClientMock = initWsClient as jest.MockedFunction<typeof initWsClient>;
	const updateCurrentWsClientOptionsMock = updateCurrentWsClientOptions as jest.MockedFunction<typeof updateCurrentWsClientOptions>;
	const ensureAccessTokenMock = ensureAccessToken as jest.MockedFunction<typeof ensureAccessToken>;
	const getCurrentAccessTokenMock = getCurrentAccessToken as jest.MockedFunction<typeof getCurrentAccessToken>;
	const isAppModeMock = isAppMode as jest.MockedFunction<typeof isAppMode>;

	beforeEach(() => {
		getWsClientMock.mockReset();
		getWsClientAccessTokenMock.mockReset();
		initWsClientMock.mockReset();
		updateCurrentWsClientOptionsMock.mockReset();
		ensureAccessTokenMock.mockReset();
		getCurrentAccessTokenMock.mockReset();
		isAppModeMock.mockReset();
		ensureAccessTokenMock.mockResolvedValue("");
		getCurrentAccessTokenMock.mockReturnValue("");
		getWsClientAccessTokenMock.mockReturnValue("");
		isAppModeMock.mockReturnValue(false);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("throws a user-facing error when websocket transport is not initialized", async () => {
		isAppModeMock.mockReturnValue(true);
		getWsClientMock.mockReturnValue(null as never);

		await expect(
			executeQueryStreamWs({
				params: {
					requestId: "req_missing_ws",
					message: "hello",
				},
				dispatch: jest.fn(),
				handleEvent: jest.fn(),
			}),
		).rejects.toThrow(/WebSocket .*?(not initialized|尚未初始化)/i);
	});

	it("creates an anonymous ws client for standalone query streaming", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: {
			onDone?: (reason: string, lastSeq: number) => void;
		}) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue(null as never);
		initWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_anonymous",
				message: "hello",
			},
			dispatch,
			handleEvent,
		});

		expect(initWsClientMock).toHaveBeenCalledWith(
			expect.objectContaining({
				accessToken: "",
				allowAnonymous: true,
			}),
		);
		expect(streamMock).toHaveBeenCalledTimes(1);
	});

	it("dispatches the expected lifecycle actions", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: {
			type: string;
			payload: { requestId: string; message: string };
			onEvent: (event: unknown) => void;
			onFrame?: (raw: string) => void;
			onDone?: (reason: string, lastSeq: number) => void;
		}) => {
			options.onEvent({ type: "content.delta", text: "hi" });
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_1",
				message: "hello",
			},
			dispatch,
			handleEvent,
		});

		expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
			"SET_REQUEST_ID",
			"SET_STREAMING",
			"SET_ABORT_CONTROLLER",
			"SET_STREAMING",
			"SET_ABORT_CONTROLLER",
		]);
		expect(handleEvent).toHaveBeenCalledWith({
			type: "content.delta",
			text: "hi",
		});
		expect(streamMock).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "/api/query",
				payload: expect.objectContaining({
					requestId: "req_1",
					message: "hello",
				}),
			}),
		);
		const firstCall = streamMock.mock.calls[0][0] as { payload: Record<string, unknown> };
		expect(firstCall.payload).not.toHaveProperty("planningMode");
		expect(firstCall.payload).not.toHaveProperty("agentMode");
	});

	it("serializes planningMode=true for CODER websocket payloads", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: { onDone?: (reason: string, lastSeq: number) => void }) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_plan_ws",
				message: "plan",
				planningMode: true,
				agentMode: "CODER",
			},
			dispatch,
			handleEvent,
		});

		const call = streamMock.mock.calls[0][0] as { payload: Record<string, unknown> };
		expect(call.payload).toEqual(
			expect.objectContaining({
				requestId: "req_plan_ws",
				planningMode: true,
				message: "plan",
			}),
		);
		expect(call.payload).not.toHaveProperty("agentMode");
	});

	it("serializes planningMode=false for CODER websocket payloads", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: { onDone?: (reason: string, lastSeq: number) => void }) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_coder_false_ws",
				message: "execute",
				planningMode: false,
				agentMode: "CODER",
			},
			dispatch,
			handleEvent,
		});

		const call = streamMock.mock.calls[0][0] as { payload: Record<string, unknown> };
		expect(call.payload).toEqual(
			expect.objectContaining({
				requestId: "req_coder_false_ws",
				planningMode: false,
				message: "execute",
			}),
		);
		expect(call.payload).not.toHaveProperty("agentMode");
	});

	it("omits planningMode for non-CODER websocket payloads", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: { onDone?: (reason: string, lastSeq: number) => void }) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_react_plan_ws",
				message: "react",
				planningMode: true,
				agentMode: "REACT",
			},
			dispatch,
			handleEvent,
		});

		const call = streamMock.mock.calls[0][0] as { payload: Record<string, unknown> };
		expect(call.payload).toEqual(
			expect.objectContaining({
				requestId: "req_react_plan_ws",
				message: "react",
			}),
		);
		expect(call.payload).not.toHaveProperty("planningMode");
		expect(call.payload).not.toHaveProperty("agentMode");
	});

	it("passes business params unchanged through websocket payloads", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: {
			payload: { params?: Record<string, unknown> };
			onDone?: (reason: string, lastSeq: number) => void;
		}) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_desktop_ws",
				message: "hello",
				params: {
					city: "beijing",
				},
			},
			dispatch,
			handleEvent,
		});

		expect(streamMock).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					params: {
						city: "beijing",
					},
				}),
			}),
		);
	});

	it("sends access level and model overrides through websocket payloads", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn((options: {
			payload: Record<string, unknown>;
			onDone?: (reason: string, lastSeq: number) => void;
		}) => {
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});
		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await executeQueryStreamWs({
			params: {
				requestId: "req_access_model_ws",
				message: "hello",
				accessLevel: "full_access",
				model: {
					key: "gpt-5.5",
					reasoningEffort: "HIGH",
				},
			},
			dispatch,
			handleEvent,
		});

		expect(streamMock).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					requestId: "req_access_model_ws",
					accessLevel: "full_access",
					model: {
						key: "gpt-5.5",
						reasoningEffort: "HIGH",
					},
				}),
			}),
		);
	});

	it("refreshes token through the singleton update path without disposing old singleton", async () => {
		jest.useFakeTimers();
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const streamMock = jest.fn()
			.mockImplementationOnce((options: { onError?: (error: Error) => void }) => {
				options.onError?.(new Error("WebSocket connection failed"));
				return { abort: jest.fn() };
			})
			.mockImplementationOnce((options: {
				onEvent: (event: unknown) => void;
				onDone?: (reason: string, lastSeq: number) => void;
			}) => {
				options.onEvent({ type: "content.delta", text: "after refresh" });
				options.onDone?.("done", 1);
				return { abort: jest.fn() };
			});
		const connect = jest.fn().mockResolvedValue(undefined);
		const currentClient = {
			updateOptions: jest.fn(),
			connect,
			stream: streamMock,
		};

		isAppModeMock.mockReturnValue(true);
		getCurrentAccessTokenMock.mockReturnValue("token_old");
		getWsClientAccessTokenMock.mockReturnValue("token_old");
		ensureAccessTokenMock.mockResolvedValue("token_new");
		getWsClientMock.mockReturnValue(currentClient as never);
		updateCurrentWsClientOptionsMock.mockImplementation((options) => {
			if (typeof options.accessToken === "string") {
				getWsClientAccessTokenMock.mockReturnValue(options.accessToken);
			}
			return currentClient as never;
		});

		const promise = executeQueryStreamWs({
			params: {
				requestId: "req_refresh",
				message: "hello",
			},
			dispatch,
			handleEvent,
		});
		await jest.advanceTimersByTimeAsync(WS_STREAM_RETRY_DELAYS_MS[0]);
		await promise;

		expect(streamMock).toHaveBeenCalledTimes(2);
		expect(ensureAccessTokenMock).toHaveBeenCalledWith("unauthorized");
		// Should NOT have called initWsClient (which would dispose the old singleton)
		expect(initWsClientMock).not.toHaveBeenCalled();
		// Should update the current singleton instead of calling updateOptions directly.
		expect(updateCurrentWsClientOptionsMock).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: "token_new" }),
		);
		expect(currentClient.updateOptions).not.toHaveBeenCalled();
		expect(getWsClientAccessToken()).toBe("token_new");
		expect(connect).toHaveBeenCalledTimes(1);
		expect(handleEvent).toHaveBeenCalledWith({
			type: "content.delta",
			text: "after refresh",
		});
	});

	it("replays a query stream up to five times when the connection fails before server activity", async () => {
		jest.useFakeTimers();
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const connect = jest.fn().mockResolvedValue(undefined);
		const streamMock = jest.fn((options: {
			payload: { requestId: string; message: string };
			onEvent: (event: unknown) => void;
			onError?: (error: Error) => void;
			onDone?: (reason: string, lastSeq: number) => void;
		}) => {
			if (streamMock.mock.calls.length <= WS_STREAM_RETRY_DELAYS_MS.length) {
				options.onError?.(new Error("WebSocket connection failed"));
				return { abort: jest.fn() };
			}
			options.onEvent({ type: "content.delta", text: "after retries" });
			options.onDone?.("done", 1);
			return { abort: jest.fn() };
		});

		getCurrentAccessTokenMock.mockReturnValue("token_1");
		getWsClientAccessTokenMock.mockReturnValue("token_1");
		getWsClientMock.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			stream: streamMock,
		} as never);

		const promise = executeQueryStreamWs({
			params: {
				requestId: "req_replay",
				message: "hello",
			},
			dispatch,
			handleEvent,
		});

		await advanceQueryWsRetryDelays();
		await promise;

		expect(streamMock).toHaveBeenCalledTimes(
			WS_STREAM_RETRY_DELAYS_MS.length + 1,
		);
		expect(connect).toHaveBeenCalledTimes(WS_STREAM_RETRY_DELAYS_MS.length);
		for (const [call] of streamMock.mock.calls) {
			expect(call).toEqual(
				expect.objectContaining({
					type: "/api/query",
					payload: expect.objectContaining({
						requestId: "req_replay",
						message: "hello",
					}),
				}),
			);
		}
		expect(handleEvent).toHaveBeenCalledWith({
			type: "content.delta",
			text: "after retries",
		});
	});

	it("does not replay after receiving a server frame", async () => {
		const streamMock = jest.fn((options: {
			onFrame?: (raw: string) => void;
			onError?: (error: Error) => void;
		}) => {
			options.onFrame?.('{"frame":"stream","id":"stream_1"}');
			options.onError?.(new Error("WebSocket transport disconnected"));
			return { abort: jest.fn() };
		});

		getCurrentAccessTokenMock.mockReturnValue("token_1");
		getWsClientAccessTokenMock.mockReturnValue("token_1");
		getWsClientMock.mockReturnValue({
			stream: streamMock,
		} as never);

		await expect(
			executeQueryStreamWs({
				params: {
					requestId: "req_no_replay_after_frame",
					message: "hello",
				},
				dispatch: jest.fn(),
				handleEvent: jest.fn(),
			}),
		).rejects.toThrow(/WebSocket .*?(disconnected|连接已断开)/i);

		expect(streamMock).toHaveBeenCalledTimes(1);
	});

	it("aborts the underlying stream when the external signal is cancelled", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const abortSpy = jest.fn();
		getCurrentAccessTokenMock.mockReturnValue("token_1");
		getWsClientAccessTokenMock.mockReturnValue("token_1");

		getWsClientMock.mockReturnValue({
			stream: jest.fn(
				(options: {
					signal?: AbortSignal;
					onError?: (error: Error) => void;
				}) => {
					options.signal?.addEventListener(
						"abort",
						() => {
							abortSpy();
							options.onError?.(
								new DOMException("The operation was aborted.", "AbortError"),
							);
						},
						{ once: true },
					);
					return { abort: abortSpy };
				},
			),
		} as never);

		const externalController = new AbortController();
		const promise = executeQueryStreamWs({
			params: {
				requestId: "req_abort",
				message: "hello",
				signal: externalController.signal,
			},
			dispatch,
			handleEvent,
		});

		await Promise.resolve();
		await Promise.resolve();
		externalController.abort();
		await promise;

		expect(abortSpy).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_STREAMING",
			streaming: false,
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
	});

	it("settles only once when abort and done race", async () => {
		const dispatch = jest.fn();
		const abortSpy = jest.fn();
		getCurrentAccessTokenMock.mockReturnValue("token_1");
		getWsClientAccessTokenMock.mockReturnValue("token_1");

		getWsClientMock.mockReturnValue({
			stream: jest.fn(
				(options: {
					signal?: AbortSignal;
					onDone?: (reason: string, lastSeq: number) => void;
					onError?: (error: Error) => void;
				}) => {
					options.signal?.addEventListener(
						"abort",
						() => {
							abortSpy();
							options.onError?.(
								new DOMException("The operation was aborted.", "AbortError"),
							);
							options.onDone?.("detached", 0);
						},
						{ once: true },
					);
					return { abort: abortSpy };
				},
			),
		} as never);

		const externalController = new AbortController();
		const promise = executeQueryStreamWs({
			params: {
				requestId: "req_race",
				message: "hello",
				signal: externalController.signal,
			},
			dispatch,
			handleEvent: jest.fn(),
		});

		await Promise.resolve();
		await Promise.resolve();
		externalController.abort();
		await promise;

		const stopActions = dispatch.mock.calls.filter(
			([action]) => action.type === "SET_STREAMING" && action.streaming === false,
		);
		const clearAbortControllerActions = dispatch.mock.calls.filter(
			([action]) =>
				action.type === "SET_ABORT_CONTROLLER" && action.controller === null,
		);

		expect(abortSpy).toHaveBeenCalledTimes(1);
		expect(stopActions).toHaveLength(1);
		expect(clearAbortControllerActions).toHaveLength(1);
	});

	it("normalizes websocket connection failures into actionable messages", async () => {
		jest.useFakeTimers();
		const streamMock = jest.fn(
			(options: {
				onError?: (error: Error) => void;
			}) => {
				options.onError?.(new Error("WebSocket connection failed"));
				return { abort: jest.fn() };
			},
		);
		getWsClientMock.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			stream: jest.fn(
				(options: Parameters<typeof streamMock>[0]) => streamMock(options),
			),
		} as never);

		const promise = executeQueryStreamWs({
			params: {
				requestId: "req_failed_ws",
				message: "hello",
			},
			dispatch: jest.fn(),
			handleEvent: jest.fn(),
		});
		const assertion = expect(promise).rejects.toThrow(
			/WebSocket .*?(handshake failed|握手失败)/i,
		);

		await advanceQueryWsRetryDelays();
		await assertion;
		expect(streamMock).toHaveBeenCalledTimes(
			WS_STREAM_RETRY_DELAYS_MS.length + 1,
		);
	});
});
