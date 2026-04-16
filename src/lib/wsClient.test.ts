import {
	WsClient,
	WsClientRequestTimeoutError,
	type WsConnectionStatus,
} from "./wsClient";

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

	beforeEach(() => {
		MockWebSocket.instances = [];
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

	it("routes request/response frames by id", async () => {
		const client = new WsClient({ accessToken: "token_1" });
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
		const onEvent = jest.fn();
		const onDone = jest.fn();
		const client = new WsClient();

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
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it("rejects the matching request/stream on error frames", async () => {
		const onError = jest.fn();
		const client = new WsClient();

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
		const client = new WsClient({ requestTimeoutMs: 1_000 });
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
		const client = new WsClient();

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
		const client = new WsClient({
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
		const client = new WsClient();

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
		const client = new WsClient({ accessToken: "token_a" });
		const promise = client.connect();

		const socket = MockWebSocket.instances[0];
		socket.error();

		await expect(promise).rejects.toThrow(
			"WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		);
		client.disconnect();
	});

	it("uses the updated token when reconnecting", async () => {
		const client = new WsClient({ accessToken: "token_a" });
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
});
