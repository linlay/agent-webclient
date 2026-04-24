import { resetCompactIdStateForTests } from "@/shared/utils/compactId";
import {
	createWsFrameId,
	WsClient,
	WsClientRequestTimeoutError,
	type WsConnectionStatus,
} from "@/features/transport/lib/wsClient";

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

async function waitForSentFrame(socket: MockWebSocket): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (socket.sent[0]) {
			return socket.sent[0];
		}
		await flushMicrotasks();
	}
	throw new Error("expected a ws frame to be sent");
}

describe("WsClient", () => {
	const originalWindow = globalThis.window;
	const originalWebSocket = globalThis.WebSocket;
	let clients: WsClient[] = [];

	const createClient = (options?: ConstructorParameters<typeof WsClient>[0]) => {
		const client = new WsClient(options);
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
			},
		};
		(globalThis as Record<string, unknown>).WebSocket =
			MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
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
		expect(socket.url).toBe("ws://localhost:3000/ws?token=token_1");

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

	it("routes stream frames and completes on done", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_776_474_697_581);
		const onEvent = jest.fn();
		const onDone = jest.fn();
		const client = createClient();

		client.stream({
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
		socket.message(
			JSON.stringify({
				frame: "stream",
				id: sentFrame.id,
				event: {
					type: "content.delta",
					seq: 1,
					payload: {
						text: "hi",
						chatId: "chat_1",
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
			payload: { runId: string; lastSeq: number };
		};
		expect(attach.requestId).toBe(sentFrame.id);
		expect(sentFrame).toMatchObject({
			type: "/api/attach",
			payload: {
				runId: "run_attach",
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
				msg: "stream failed",
				code: 500,
			}),
		);

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "stream failed",
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

		jest.advanceTimersByTime(50_000);
		expect(firstSocket.closeCalls).toBe(1);

		jest.advanceTimersByTime(1_000);
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(statuses).toContain("connected");
		expect(statuses).toContain("error");
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

	it("surfaces a user-facing handshake error when the socket fails before opening", async () => {
		const client = createClient({ accessToken: "token_a" });
		const promise = client.connect();

		const socket = MockWebSocket.instances[0];
		socket.error();

		await expect(promise).rejects.toThrow(
			"WebSocket handshake failed. Check that the access token is valid and that the backend has enabled /ws.",
		);
		client.disconnect();
	});

	it("uses the updated token when reconnecting", async () => {
		const client = createClient({ accessToken: "token_a" });
		client.connect();
		const firstSocket = MockWebSocket.instances[0];
		expect(firstSocket.url).toBe("ws://localhost:3000/ws?token=token_a");

		firstSocket.open();
		await flushMicrotasks();

		client.disconnect();
		client.updateOptions({ accessToken: "token_b" });
		client.connect();

		const secondSocket = MockWebSocket.instances[1];
		expect(secondSocket.url).toBe("ws://localhost:3000/ws?token=token_b");
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
