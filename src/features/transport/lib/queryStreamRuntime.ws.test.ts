import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";
import { getWsClient } from "@/features/transport/lib/wsClientSingleton";

jest.mock("./wsClientSingleton", () => ({
	getWsClient: jest.fn(),
}));

describe("executeQueryStreamWs", () => {
	const getWsClientMock = getWsClient as jest.MockedFunction<typeof getWsClient>;

	beforeEach(() => {
		getWsClientMock.mockReset();
	});

	it("throws a user-facing error when websocket transport is not initialized", async () => {
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
		).rejects.toThrow(
			"WebSocket transport is not initialized yet. Switch to WebSocket mode and confirm the connection first.",
		);
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
	});

	it("aborts the underlying stream when the external signal is cancelled", async () => {
		const dispatch = jest.fn();
		const handleEvent = jest.fn();
		const abortSpy = jest.fn();

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
		getWsClientMock.mockReturnValue({
			stream: jest.fn(
				(options: {
					onError?: (error: Error) => void;
				}) => {
					options.onError?.(new Error("WebSocket connection failed"));
					return { abort: jest.fn() };
				},
			),
		} as never);

		await expect(
			executeQueryStreamWs({
				params: {
					requestId: "req_failed_ws",
					message: "hello",
				},
				dispatch: jest.fn(),
				handleEvent: jest.fn(),
			}),
		).rejects.toThrow(
			"WebSocket handshake failed. Check that the access token is valid and that the backend has enabled /ws.",
		);
	});
});
