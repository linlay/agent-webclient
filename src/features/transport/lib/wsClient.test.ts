import { resetCompactIdStateForTests } from "@/shared/utils/compactId";
import {
	createWsFrameId,
	describeWsConnectionFailure,
	WsClient,
	WsClientDisconnectedError,
	WsInboundRequestError,
	WsClientRequestTimeoutError,
	type WsConnectionStatus,
} from "@/features/transport/lib/wsClient";
import {
	resetAuthCoordinatorForTests,
	setAuthCoordinatorNavigationForTests,
} from "@/shared/data/auth/authCoordinator";

jest.mock("@/shared/data/clientDeviceId", () => ({
	getClientDeviceId: () => "device-test",
}));

jest.mock("@/shared/data/clientSurfaceId", () => ({
	getClientSurfaceId: () => "surface-test",
}));

type Listener = (event?: any) => void;

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.CONNECTING;
	sent: string[] = [];
	closeCalls = 0;
	private listeners = new Map<string, Set<Listener>>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	addEventListener(type: string, listener: Listener): void {
		const current = this.listeners.get(type) || new Set<Listener>();
		current.add(listener);
		this.listeners.set(type, current);
	}

	removeEventListener(type: string, listener: Listener): void {
		this.listeners.get(type)?.delete(listener);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(code?: number, reason?: string): void {
		this.closeCalls += 1;
		this.readyState = MockWebSocket.CLOSED;
		this.emit("close", { code: code ?? 1000, reason: reason ?? "", wasClean: true });
	}

	open(): void {
		this.readyState = MockWebSocket.OPEN;
		this.emit("open");
	}

	message(data: string): void {
		this.emit("message", { data });
	}

	error(): void {
		this.emit("error", {});
	}

	private emit(type: string, event: unknown = {}): void {
		for (const listener of this.listeners.get(type) || []) {
			listener(event);
		}
	}
}

function flushMicrotasks(): Promise<void> {
	return Promise.resolve()
		.then(() => undefined)
		.then(() => undefined);
}

async function waitForSocketCount(count: number): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (MockWebSocket.instances.length >= count) {
			return;
		}
		await flushMicrotasks();
	}
	throw new Error(`expected ${count} websocket instances`);
}

async function waitForSentFrame(socket: MockWebSocket): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (socket.sent[0]) {
			return socket.sent[0];
		}
		await flushMicrotasks();
	}
	throw new Error("expected a ws frame to be sent");
}

function expectSocketUrl(socket: MockWebSocket, token = ""): void {
	const url = new URL(socket.url);
	expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(
		"ws://localhost:3000/ws",
	);
	expect(url.searchParams.get("token") || "").toBe(token);
	expect(url.searchParams.get("deviceId")).toBe("device-test");
	expect(url.searchParams.get("source")).toBe("WebClient");
	expect(url.searchParams.get("surfaceId")).toBe("surface-test");
}

describe("WsClient", () => {
	const originalWindow = globalThis.window;
	const originalWebSocket = globalThis.WebSocket;
	let clients: WsClient[] = [];

	const createClient = (options?: ConstructorParameters<typeof WsClient>[0]) => {
		const clientOptions = options && Object.prototype.hasOwnProperty.call(options, "accessToken")
			? options
			: { accessToken: "token_default", ...options };
		const client = new WsClient(clientOptions);
		clients.push(client);
		return client;
	};

	beforeEach(() => {
		MockWebSocket.instances = [];
		clients = [];
		resetCompactIdStateForTests();
		(globalThis as Record<string, unknown>).window = {
			location: {
				protocol: "http:",
				host: "localhost:3000",
				origin: "http://localhost:3000",
				pathname: "/agent/public-agent",
				search: "",
				hash: "",
			},
			dispatchEvent: jest.fn(),
		};
		(globalThis as Record<string, unknown>).WebSocket =
			MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		delete (globalThis as typeof globalThis & {
			__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
		}).__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
		resetAuthCoordinatorForTests();
		for (const client of clients) {
			if (client.getStatus() !== "connecting") {
				client.disconnect();
			}
		}
		jest.restoreAllMocks();
		jest.useRealTimers();
		if (originalWindow) {
			(globalThis as Record<string, unknown>).window = originalWindow;
		} else {
			delete (globalThis as Record<string, unknown>).window;
		}
		if (originalWebSocket) {
			(globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
		} else {
			delete (globalThis as Record<string, unknown>).WebSocket;
		}
	});

	it("uses a cookie-only same-origin URL and coordinates auth.required in gateway mode", async () => {
		(globalThis as typeof globalThis & {
			__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
		}).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);
		const client = createClient({ accessToken: "must-not-leak", allowAnonymous: true });
		const promise = client.request({ type: "/api/agents" });
		const socket = MockWebSocket.instances[0];
		const url = new URL(socket.url);
		expect(url.pathname).toBe("/ws");
		expect(url.search).toBe("");
		socket.open();
		const sent = JSON.parse(await waitForSentFrame(socket)) as { id: string };
		socket.message(
			JSON.stringify({
				frame: "error",
				id: sent.id,
				type: "auth.required",
				code: 401,
				msg: "Authentication is required",
			}),
		);

		await expect(promise).rejects.toMatchObject({ status: 401 });
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	it("treats gateway close code 4401 as auth required without reconnecting", async () => {
		jest.useFakeTimers();
		(globalThis as typeof globalThis & {
			__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
		}).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);
		const client = createClient({ accessToken: "", allowAnonymous: true });
		const connected = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await connected;

		socket.close(4401, "authentication required");
		jest.advanceTimersByTime(60_000);

		expect(navigate).toHaveBeenCalledTimes(1);
		expect(MockWebSocket.instances).toHaveLength(1);
	});

	it("creates compact websocket frame ids from second-plus-counter", () => {
		const second = 1776474697;
		const baseMs = second * 1000;

		expect(createWsFrameId("wsreq", baseMs + 581)).toBe(
			`wsr_${(second * 1000).toString(36)}`,
		);
		expect(createWsFrameId("wsstream", baseMs + 999)).toBe(
			`wss_${(second * 1000 + 1).toString(36)}`,
		);
		expect(createWsFrameId("wsreq", baseMs + 999)).toBe(
			`wsr_${(second * 1000 + 2).toString(36)}`,
		);
	});

	it("resets the websocket frame id counter when the second changes", () => {
		expect(createWsFrameId("wsreq", 2_500)).toBe(`wsr_${(2_000).toString(36)}`);
		expect(createWsFrameId("wsstream", 2_999)).toBe(`wss_${(2_001).toString(36)}`);
		expect(createWsFrameId("wsreq", 3_000)).toBe(`wsr_${(3_000).toString(36)}`);
	});

	it("throws when more than 1000 websocket frame ids are requested in the same second", () => {
		const secondMs = 10_000;
		for (let index = 0; index < 1000; index += 1) {
			createWsFrameId(index % 2 === 0 ? "wsreq" : "wsstream", secondMs);
		}

		expect(() => createWsFrameId("wsreq", secondMs + 999)).toThrow(
			"WebSocket request id overflow in the same second",
		);
	});

	it("routes request/response frames by id", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_776_475_494_719);
		const client = createClient({ accessToken: "token_1" });
		const promise = client.request<{ items: string[] }>({
			type: "/api/agents",
		});

		const socket = MockWebSocket.instances[0];
		expectSocketUrl(socket, "token_1");

		socket.open();
		await flushMicrotasks();

		const sentFrame = JSON.parse(await waitForSentFrame(socket)) as {
			id: string;
			type: string;
			frame: string;
		};
		expect(sentFrame).toMatchObject({
			frame: "request",
			type: "/api/agents",
			id: `wsr_${(1_776_475_494 * 1000).toString(36)}`,
		});

		socket.message(
			JSON.stringify({
				frame: "response",
				id: sentFrame.id,
				code: 0,
				msg: "ok",
				data: { items: ["agent-a"] },
			}),
		);

		await expect(promise).resolves.toMatchObject({
			code: 0,
			data: { items: ["agent-a"] },
		});
	});

	it("handles inbound requests and returns a flat response with the same id and type", async () => {
		const client = createClient();
		const handler = jest.fn().mockReturnValue({
			applied: true,
			sidebar: "right",
			open: true,
			tab: "debug",
		});
		client.registerInboundRequestHandler(
			"test.inbound.setState",
			handler,
		);
		const connected = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await connected;

		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.setState",
				id: "wsa-1",
				payload: {
					sidebar: "right",
					open: true,
					tab: "debug",
				},
			}),
		);
		await flushMicrotasks();

		expect(handler).toHaveBeenCalledWith({
			sidebar: "right",
			open: true,
			tab: "debug",
		});
		expect(JSON.parse(socket.sent[0])).toEqual({
			frame: "response",
			type: "test.inbound.setState",
			id: "wsa-1",
			code: 0,
			msg: "success",
			data: {
				applied: true,
				sidebar: "right",
				open: true,
				tab: "debug",
			},
		});
	});

	it("rejects unknown and duplicate inbound request ids", async () => {
		let resolveHandler: ((value: unknown) => void) | undefined;
		const client = createClient();
		client.registerInboundRequestHandler(
			"test.inbound.setState",
			() =>
				new Promise((resolve) => {
					resolveHandler = resolve;
				}),
		);
		const connected = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await connected;

		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.unknown",
				id: "wsa-unknown",
				payload: {},
			}),
		);
		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.setState",
				id: "wsa-duplicate",
				payload: { sidebar: "right", open: true },
			}),
		);
		await flushMicrotasks();
		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.setState",
				id: "wsa-duplicate",
				payload: { sidebar: "right", open: true },
			}),
		);
		await flushMicrotasks();

		expect(JSON.parse(socket.sent[0])).toMatchObject({
			frame: "error",
			type: "unknown_request_type",
			id: "wsa-unknown",
			code: 404,
		});
		expect(JSON.parse(socket.sent[1])).toMatchObject({
			frame: "error",
			type: "duplicate_id",
			id: "wsa-duplicate",
			code: 409,
		});

		resolveHandler?.({ applied: true });
		await flushMicrotasks();
		expect(JSON.parse(socket.sent[2])).toMatchObject({
			frame: "response",
			type: "test.inbound.setState",
			id: "wsa-duplicate",
			code: 0,
		});

		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.setState",
				id: "wsa-duplicate",
				payload: { sidebar: "right", open: false },
			}),
		);
		await flushMicrotasks();
		expect(JSON.parse(socket.sent[3])).toMatchObject({
			frame: "error",
			type: "duplicate_id",
			id: "wsa-duplicate",
			code: 409,
		});
	});

	it("rejects malformed inbound request identifiers", async () => {
		const client = createClient();
		const connected = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await connected;

		socket.message(
			JSON.stringify({
				frame: "request",
				type: 42,
				id: "wsa-malformed",
				payload: {},
			}),
		);
		await flushMicrotasks();

		expect(JSON.parse(socket.sent[0])).toEqual({
			frame: "error",
			type: "invalid_request",
			id: "wsa-malformed",
			code: 400,
			msg: "type is required",
		});
	});

	it("returns handler business errors and suppresses results after disconnect", async () => {
		const client = createClient();
		let resolvePending: ((value: unknown) => void) | undefined;
		client.registerInboundRequestHandler(
			"test.inbound.invalid",
			() => {
				throw new WsInboundRequestError(
					"invalid_request",
					400,
					"payload is invalid",
					{ field: "sidebar" },
				);
			},
		);
		client.registerInboundRequestHandler(
			"test.inbound.pending",
			() =>
				new Promise((resolve) => {
					resolvePending = resolve;
				}),
		);
		const connected = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await connected;

		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.invalid",
				id: "wsa-invalid",
				payload: {},
			}),
		);
		await flushMicrotasks();
		expect(JSON.parse(socket.sent[0])).toEqual({
			frame: "error",
			type: "invalid_request",
			id: "wsa-invalid",
			code: 400,
			msg: "payload is invalid",
			data: { field: "sidebar" },
		});

		socket.message(
			JSON.stringify({
				frame: "request",
				type: "test.inbound.pending",
				id: "wsa-pending",
				payload: {},
			}),
		);
		await flushMicrotasks();
		socket.close(1000, "page closed");
		resolvePending?.({ applied: true });
		await flushMicrotasks();

		expect(socket.sent).toHaveLength(1);
	});

	it("refreshes a missing token before opening a websocket", async () => {
		const resolveAccessToken = jest.fn().mockResolvedValue("token_from_refresh");
		const client = createClient({
			accessToken: "",
			resolveAccessToken,
		});

		const promise = client.connect();
		await flushMicrotasks();
		await waitForSocketCount(1);

		expect(resolveAccessToken).toHaveBeenCalledWith("missing");
		const socket = MockWebSocket.instances[0];
		expectSocketUrl(socket, "token_from_refresh");
		socket.open();
		await expect(promise).resolves.toBeUndefined();
	});

	it("does not open a naked websocket when missing token refresh returns empty", async () => {
		const resolveAccessToken = jest.fn().mockResolvedValue("");
		const client = createClient({
			accessToken: "",
			resolveAccessToken,
		});

		const promise = client.connect();
		await flushMicrotasks();

		await expect(promise).rejects.toThrow(/access token|令牌/i);
		expect(resolveAccessToken).toHaveBeenCalledWith("missing");
		expect(MockWebSocket.instances).toHaveLength(0);
		expect(client.getStatus()).toBe("error");
	});

	it("opens an anonymous websocket when anonymous mode is allowed", async () => {
		const resolveAccessToken = jest.fn().mockResolvedValue("");
		const client = createClient({
			accessToken: "",
			allowAnonymous: true,
			resolveAccessToken,
		});

		const promise = client.connect();
		await waitForSocketCount(1);

		expect(resolveAccessToken).not.toHaveBeenCalled();
		const socket = MockWebSocket.instances[0];
		expectSocketUrl(socket);
		socket.open();
		await expect(promise).resolves.toBeUndefined();
	});

	it("does not report an anonymous handshake failure as a missing token", async () => {
		const client = createClient({
			accessToken: "",
			allowAnonymous: true,
		});
		const promise = client.connect();
		const socket = MockWebSocket.instances[0];

		socket.error();
		const error = await promise.catch((reason) => reason as Error);

		expect(error.message).toMatch(/握手失败|handshake failed|断开|disconnected/i);
		expect(error.message).not.toMatch(/access token|令牌/i);
	});

	it("prefers and preserves an anonymous pre-open close reason after an error event", async () => {
		const client = createClient({
			accessToken: "",
			allowAnonymous: true,
		});
		const promise = client.connect();
		const socket = MockWebSocket.instances[0];

		socket.error();
		socket.close(1008, "surface_unavailable");
		const error = await promise.catch((reason) => reason as Error);

		expect(error).toBeInstanceOf(WsClientDisconnectedError);
		expect(error).toMatchObject({ code: "WS_DISCONNECTED" });
		expect(error.message).toContain("surface_unavailable");
		expect(error.message).not.toMatch(/access token|令牌/i);
	});

	it("routes stream frames and completes on done", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_776_474_697_581);
		const onEvent = jest.fn();
		const onDone = jest.fn();
		const client = createClient();

		const stream = client.stream({
			type: "/api/query",
			payload: { message: "hello" },
			onEvent,
			onDone,
		});

		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		const sentFrame = JSON.parse(await waitForSentFrame(socket)) as { id: string };
		expect(sentFrame.id).toBe(`wss_${(1_776_474_697 * 1000).toString(36)}`);
		expect(stream.requestId).toBe(sentFrame.id);
		socket.message(
			JSON.stringify({
				frame: "stream",
				id: sentFrame.id,
				event: {
					type: "content.delta",
					seq: 1,
					timestamp: 1_710_000_000_006,
					payload: {
						text: "hi",
						chatId: "chat_1",
						timestamp: 1_710_000_000_006,
					},
				},
			}),
		);
		socket.message(
			JSON.stringify({
				frame: "stream",
				id: sentFrame.id,
				reason: "done",
				lastSeq: 9,
			}),
		);

		expect(onEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "content.delta",
				seq: 1,
				text: "hi",
				chatId: "chat_1",
			}),
		);
		expect(onDone).toHaveBeenCalledWith("done", 9);
	});

	it("rejects malformed stream timestamps without forwarding the event", async () => {
		for (const timestamp of ["1710000000000", 1_710_000_000, 1_710_000_000_000.5, 0, undefined]) {
			const onEvent = jest.fn();
			const onError = jest.fn();
			const client = createClient();
			client.stream({
				type: "/api/query",
				payload: { message: "hello" },
				onEvent,
				onError,
			});

			const socket = MockWebSocket.instances.at(-1);
			if (!socket) {
				throw new Error("expected websocket instance");
			}
			socket.open();
			await flushMicrotasks();
			const sentFrame = JSON.parse(await waitForSentFrame(socket)) as { id: string };
			socket.message(
				JSON.stringify({
					frame: "stream",
					id: sentFrame.id,
					event: {
						type: "content.delta",
						...(timestamp === undefined ? {} : { timestamp }),
					},
				}),
			);
			expect(onEvent).not.toHaveBeenCalled();
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: expect.stringContaining("time_contract_violation") }),
			);
		}
	});

	it("invokes onDone for non-done stream terminal reasons", async () => {
		const onDone = jest.fn();
		const client = createClient();

		client.stream({
			type: "/api/query",
			payload: { message: "hello" },
			onEvent: jest.fn(),
			onDone,
		});

		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		const sentFrame = JSON.parse(await waitForSentFrame(socket)) as { id: string };
		socket.message(
			JSON.stringify({
				frame: "stream",
				id: sentFrame.id,
				reason: "cancelled",
				lastSeq: 3,
			}),
		);

		expect(onDone).toHaveBeenCalledWith("cancelled", 3);
	});

	it("attachRun sends /api/attach and surfaces detached on abort", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_776_474_697_581);
		const onDone = jest.fn();
		const client = createClient();
		const controller = new AbortController();

		const attach = client.attachRun(
			"run_attach",
			"demo-agent",
			0,
			jest.fn(),
			onDone,
			controller.signal,
		);

		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		const sentFrame = JSON.parse(await waitForSentFrame(socket)) as {
			id: string;
			type: string;
			payload: { runId: string; agentKey: string; lastSeq: number };
		};
		expect(attach.requestId).toBe(sentFrame.id);
		expect(sentFrame).toMatchObject({
			type: "/api/attach",
			payload: {
				runId: "run_attach",
				agentKey: "demo-agent",
				lastSeq: 0,
			},
		});

		controller.abort();

		expect(onDone).toHaveBeenCalledWith("detached", 0);
	});

	it("rejects the matching request/stream on error frames", async () => {
		const onError = jest.fn();
		const client = createClient();

		client.stream({
			type: "/api/query",
			payload: { message: "boom" },
			onEvent: jest.fn(),
			onError,
		});

		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		const sentFrame = JSON.parse(await waitForSentFrame(socket)) as { id: string };
		socket.message(
			JSON.stringify({
				frame: "error",
				id: sentFrame.id,
				type: "provider_quota_exhausted",
				msg: "model request failed with status 429",
				code: 429,
				data: {
					error: {
						category: "model",
						code: "provider_quota_exhausted",
						scope: "run",
						status: 429,
						retryable: false,
						message: "model request failed with status 429: quota exhausted",
						diagnostics: { upstreamStatus: 429 },
					},
				},
			}),
		);

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "model request failed with status 429",
				platformError: expect.objectContaining({
					code: "provider_quota_exhausted",
					message: "model request failed with status 429: quota exhausted",
				}),
			}),
		);
	});

	it("rejects requests that exceed the request timeout", async () => {
		jest.useFakeTimers();
		const client = createClient({ requestTimeoutMs: 1_000 });
		const promise = client.request({
			type: "/api/agents",
		});

		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();
		await waitForSentFrame(socket);

		jest.advanceTimersByTime(1_000);

		await expect(promise).rejects.toEqual(
			new WsClientRequestTimeoutError("WebSocket request timeout: /api/agents"),
		);
	});

	it("warns and ignores malformed inbound frames without breaking the connection", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const client = createClient();

		try {
			client.connect();
			const socket = MockWebSocket.instances[0];
			socket.open();
			await flushMicrotasks();

			socket.message("not-json");

			expect(warnSpy).toHaveBeenCalledWith(
				"[WsClient] Failed to parse incoming frame:",
				"not-json",
			);
			expect(client.getStatus()).toBe("connected");

			const promise = client.request<{ ok: boolean }>({
				type: "/api/agents",
			});
			const sentFrame = JSON.parse(await waitForSentFrame(socket)) as { id: string };

			socket.message(
				JSON.stringify({
					frame: "response",
					id: sentFrame.id,
					code: 0,
					msg: "ok",
					data: { ok: true },
				}),
			);

			await expect(promise).resolves.toMatchObject({
				data: { ok: true },
			});
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("closes stale sockets and reconnects after heartbeat timeout", async () => {
		jest.useFakeTimers();
		const statuses: WsConnectionStatus[] = [];
		const client = createClient({
			onStatusChange: (status) => statuses.push(status),
		});

		client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await flushMicrotasks();

		jest.advanceTimersByTime(95_000);
		expect(firstSocket.closeCalls).toBe(0);

		jest.advanceTimersByTime(10_000);
		expect(firstSocket.closeCalls).toBe(1);

		jest.advanceTimersByTime(1_000);
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(statuses).toContain("connected");
		expect(statuses).toContain("error");
	});

	it("keeps an idle default connection open for 95 seconds", async () => {
		jest.useFakeTimers();
		const client = createClient();

		client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		jest.advanceTimersByTime(95_000);

		expect(socket.closeCalls).toBe(0);
		expect(client.getStatus()).toBe("connected");
	});

	it("refreshes lastSeenAt when a push heartbeat arrives", async () => {
		jest.useFakeTimers();
		const client = createClient();

		client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		jest.advanceTimersByTime(95_000);
		expect(socket.closeCalls).toBe(0);

		socket.message(JSON.stringify({ frame: "push", type: "heartbeat", data: {} }));
		jest.advanceTimersByTime(95_000);
		expect(socket.closeCalls).toBe(0);

		jest.advanceTimersByTime(10_000);
		expect(socket.closeCalls).toBe(1);
	});

	it("does not reconnect after an explicit disconnect", async () => {
		jest.useFakeTimers();
		const client = createClient();

		client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await flushMicrotasks();

		client.disconnect();
		jest.advanceTimersByTime(60_000);

		expect(MockWebSocket.instances).toHaveLength(1);
		expect(client.getStatus()).toBe("disconnected");
	});

	it("does not reconnect after dispose", async () => {
		const client = createClient({ accessToken: "token_a" });
		const firstConnect = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.open();
		await expect(firstConnect).resolves.toBeUndefined();

		client.dispose();

		await expect(client.connect()).rejects.toThrow(/disposed/i);
		expect(MockWebSocket.instances).toHaveLength(1);
		expect(client.getStatus()).toBe("disconnected");
	});

	it("does not revive a disposed client after handshake token refresh resolves", async () => {
		let resolveToken: (token: string) => void = () => undefined;
		const resolveAccessToken = jest.fn(
			() => new Promise<string>((resolve) => {
				resolveToken = resolve;
			}),
		);
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
		});

		const connect = client.connect();
		const socket = MockWebSocket.instances[0];
		socket.error();
		await flushMicrotasks();

		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");
		client.dispose();
		resolveToken("token_b");

		await expect(connect).rejects.toThrow(/disposed/i);
		await flushMicrotasks();
		expect(MockWebSocket.instances).toHaveLength(1);
		expect(client.getStatus()).toBe("disconnected");
	});

	it("surfaces a user-facing handshake error when the socket fails before opening", async () => {
		const client = createClient({ accessToken: "token_a" });
		const promise = client.connect();

		const socket = MockWebSocket.instances[0];
		socket.error();

		await expect(promise).rejects.toThrow(
			/握手失败|handshake failed/i,
		);
		client.disconnect();
	});

	it("times out handshake attempts that never open", async () => {
		jest.useFakeTimers();
		const client = createClient({
			accessToken: "token_a",
			connectTimeoutMs: 1_000,
		});
		const promise = client.connect();

		const socket = MockWebSocket.instances[0];
		jest.advanceTimersByTime(1_000);
		await flushMicrotasks();

		await expect(promise).rejects.toThrow(
			/握手失败|handshake failed/i,
		);
		expect(socket.closeCalls).toBe(1);
		expect(client.getStatus()).toBe("error");
		client.disconnect();
	});

	it("describes open-phase disconnects without blaming the handshake", () => {
		expect(describeWsConnectionFailure(new WsClientDisconnectedError())).toMatch(
			/断开|disconnected/i,
		);
		expect(
			describeWsConnectionFailure(
				new WsClientDisconnectedError("WebSocket heartbeat timeout"),
			),
		).toMatch(/心跳|heartbeat/i);
		expect(describeWsConnectionFailure(new Error("WebSocket connection failed"))).toMatch(
			/握手失败|handshake failed/i,
		);
	});

	it("refreshes token once when the initial handshake fails before opening", async () => {
		const resolveAccessToken = jest.fn().mockResolvedValue("token_b");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
		});

		const promise = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		expectSocketUrl(firstSocket, "token_a");
		firstSocket.error();
		await flushMicrotasks();
		await waitForSocketCount(2);

		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");
		const secondSocket = MockWebSocket.instances[1];
		expectSocketUrl(secondSocket, "token_b");
		secondSocket.open();
		await expect(promise).resolves.toBeUndefined();
	});

	it("uses the updated token when reconnecting", async () => {
		const client = createClient({ accessToken: "token_a" });
		client.connect();
		const firstSocket = MockWebSocket.instances[0];
		expectSocketUrl(firstSocket, "token_a");

		firstSocket.open();
		await flushMicrotasks();

		client.disconnect();
		client.updateOptions({ accessToken: "token_b" });
		const secondConnect = client.connect();

		const secondSocket = MockWebSocket.instances[1];
		expectSocketUrl(secondSocket, "token_b");
		secondSocket.open();
		await expect(secondConnect).resolves.toBeUndefined();
	});

	it("refreshes the token immediately after an abnormal reconnect close", async () => {
		jest.useFakeTimers();
		const resolveAccessToken = jest.fn().mockResolvedValue("token_b");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
			reconnectTokenRefreshThreshold: 2,
		});

		const firstConnect = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await expect(firstConnect).resolves.toBeUndefined();

		firstSocket.close(1006, "server disconnected");
		jest.advanceTimersByTime(1_000);
		await waitForSocketCount(2);

		const secondSocket = MockWebSocket.instances[1];
		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");
		expectSocketUrl(secondSocket, "token_b");
		secondSocket.open();
		await flushMicrotasks();
	});

	it("does not refresh the token after a client heartbeat timeout close", async () => {
		jest.useFakeTimers();
		const resolveAccessToken = jest.fn().mockResolvedValue("token_b");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
			reconnectTokenRefreshThreshold: 2,
		});

		const firstConnect = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await expect(firstConnect).resolves.toBeUndefined();

		jest.advanceTimersByTime(105_000);
		expect(firstSocket.closeCalls).toBe(1);
		jest.advanceTimersByTime(1_000);
		await waitForSocketCount(2);

		expect(resolveAccessToken).not.toHaveBeenCalled();
		expectSocketUrl(MockWebSocket.instances[1], "token_a");
	});

	it("does not reconnect with a naked websocket URL when unauthorized refresh returns empty", async () => {
		jest.useFakeTimers();
		const changedTokens: string[] = [];
		const resolveAccessToken = jest.fn().mockResolvedValue("");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
			onAccessTokenChange: (token) => changedTokens.push(token),
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
		});

		const firstConnect = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await expect(firstConnect).resolves.toBeUndefined();

		firstSocket.close(1006, "Invalid frame header");
		jest.advanceTimersByTime(1_000);
		await flushMicrotasks();

		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");
		expect(changedTokens).toEqual([""]);
		expect(MockWebSocket.instances).toHaveLength(1);
		expect(client.getStatus()).toBe("error");
	});

	it("refreshes the token immediately when the close reason points to auth", async () => {
		jest.useFakeTimers();
		const resolveAccessToken = jest.fn().mockResolvedValue("token_b");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
		});

		const firstConnect = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await expect(firstConnect).resolves.toBeUndefined();

		firstSocket.close(1008, "token expired");
		jest.advanceTimersByTime(1_000);
		await waitForSocketCount(2);

		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");
		expectSocketUrl(MockWebSocket.instances[1], "token_b");
		MockWebSocket.instances[1].open();
		await flushMicrotasks();
	});

	it("clears a pending reconnect timer after an explicit reconnect succeeds", async () => {
		jest.useFakeTimers();
		const resolveAccessToken = jest.fn().mockResolvedValue("token_a");
		const client = createClient({
			accessToken: "token_a",
			resolveAccessToken,
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
		});

		const firstConnect = client.connect();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.close(1008, "token expired");

		await expect(firstConnect).rejects.toThrow(/token expired/i);
		expect(resolveAccessToken).toHaveBeenCalledWith("unauthorized");

		const secondConnect = client.connect();
		await waitForSocketCount(2);
		const secondSocket = MockWebSocket.instances[1];
		secondSocket.open();
		await expect(secondConnect).resolves.toBeUndefined();

		resolveAccessToken.mockClear();
		jest.advanceTimersByTime(1_000);
		await flushMicrotasks();

		expect(resolveAccessToken).not.toHaveBeenCalled();
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(client.getStatus()).toBe("connected");
	});

	it("closes a stale pre-open socket when a newer socket becomes current", async () => {
		const client = createClient({ accessToken: "token_a" });
		const staleConnect = client.connect();
		const staleSocket = MockWebSocket.instances[0];

		(client as unknown as { connectPromise: Promise<void> | null }).connectPromise =
			null;
		const currentConnect = client.connect();
		await waitForSocketCount(2);
		const currentSocket = MockWebSocket.instances[1];

		currentSocket.open();
		await expect(currentConnect).resolves.toBeUndefined();

		staleSocket.open();
		await expect(staleConnect).resolves.toBeUndefined();

		expect(staleSocket.closeCalls).toBe(1);
		expect(currentSocket.closeCalls).toBe(0);
		expect(client.getStatus()).toBe("connected");
	});

	it("swallows reconnect handshake failures while preserving error state", async () => {
		jest.useFakeTimers();
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const statuses: WsConnectionStatus[] = [];
		const client = createClient({
			accessToken: "token_a",
			onStatusChange: (status) => statuses.push(status),
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 1_000,
		});

		try {
			const firstConnect = client.connect();
			const firstSocket = MockWebSocket.instances[0];
			firstSocket.open();
			await expect(firstConnect).resolves.toBeUndefined();

			firstSocket.close(1006, "server disconnected");
			expect(client.getStatus()).toBe("error");

			jest.advanceTimersByTime(1_000);
			expect(MockWebSocket.instances).toHaveLength(2);

			const secondSocket = MockWebSocket.instances[1];
			secondSocket.error();
			await flushMicrotasks();

			expect(client.getStatus()).toBe("error");
			expect(warnSpy).not.toHaveBeenCalled();

			jest.advanceTimersByTime(1_000);
			expect(MockWebSocket.instances).toHaveLength(3);
			expect(statuses).toContain("error");
		} finally {
			client.disconnect();
			warnSpy.mockRestore();
		}
	});
});
