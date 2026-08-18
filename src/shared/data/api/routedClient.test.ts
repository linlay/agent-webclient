const mockGetAgents = jest.fn();
const mockGetAgent = jest.fn();
const mockGetAgentOrder = jest.fn();
const mockGetChat = jest.fn();
const mockGetChats = jest.fn();
const mockGetChatRawJsonl = jest.fn();
const mockGetChatLLMTraceRaw = jest.fn();
const mockUpdateAgentName = jest.fn();
const mockGetAutomations = jest.fn();
const mockRequestPlatformData = jest.fn();
const mockGetBackendMode = jest.fn(() => "platform");

jest.mock("@/shared/data/api/client", () => ({
	ApiError: class MockApiError extends Error {
		status: number | null;
		code: number | string | null;
		data: unknown;

		constructor(
			message: string,
			options: {
				status?: number | null;
				code?: number | string | null;
				data?: unknown;
			} = {},
		) {
			super(message);
			this.name = "ApiError";
			this.status = options.status ?? null;
			this.code = options.code ?? null;
			this.data = options.data ?? null;
		}
	},
	buildResourceUrl: jest.fn((file: string) => `/api/resource?file=${file}`),
	downloadChatExport: jest.fn(),
	downloadResource: jest.fn(),
	ensureAccessToken: jest.fn(),
	getCurrentAccessToken: jest.fn(() => ""),
	getResourceText: jest.fn(),
	setAccessToken: jest.fn(),
	uploadFile: jest.fn(),
	getAgents: (...args: unknown[]) => mockGetAgents(...args),
	getAgent: (...args: unknown[]) => mockGetAgent(...args),
	getAgentOrder: (...args: unknown[]) => mockGetAgentOrder(...args),
	getChat: (...args: unknown[]) => mockGetChat(...args),
	getChats: (...args: unknown[]) => mockGetChats(...args),
	getChatRawJsonl: (...args: unknown[]) => mockGetChatRawJsonl(...args),
	getChatLLMTraceRaw: (...args: unknown[]) => mockGetChatLLMTraceRaw(...args),
	updateAgentName: (...args: unknown[]) => mockUpdateAgentName(...args),
	getAutomations: (...args: unknown[]) => mockGetAutomations(...args),
	normalizeChatSummariesPayload: jest.fn((data: unknown) => data),
}));

jest.mock("@/features/transport/lib/platformDataRequestTransport", () => ({
	requestPlatformData: (...args: unknown[]) => mockRequestPlatformData(...args),
}));

jest.mock("@/shared/config/backendMode", () => ({
	getBackendMode: () => mockGetBackendMode(),
}));

const ok = <T,>(data: T) => ({
	status: 200,
	code: 0,
	msg: "success",
	data,
});

describe("routedClient capability routing", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		mockGetBackendMode.mockReturnValue("platform");
	});

	it("routes Platform agent lists over WS with payload caching and dedupe", async () => {
		mockRequestPlatformData.mockResolvedValue(ok([{ key: "agent-1" }]));
		const routed = await import("./routedClient");
		const options = {
			includeChats: 5,
			includeTeam: true,
			scope: "nav" as const,
		};

		const [first, second] = await Promise.all([
			routed.getAgents(options),
			routed.getAgents(options),
		]);
		const third = await routed.getAgents(options);

		expect(first).toEqual(second);
		expect(third.data).toEqual([{ key: "agent-1" }]);
		expect(mockRequestPlatformData).toHaveBeenCalledTimes(1);
		expect(mockRequestPlatformData).toHaveBeenCalledWith("/api/agents", options);
		expect(mockGetAgents).not.toHaveBeenCalled();
	});

	it("routes agent detail over WS with cached request dedupe", async () => {
		mockRequestPlatformData.mockResolvedValue(ok({ key: "demo-agent" }));
		const routed = await import("./routedClient");

		const [first, second] = await Promise.all([
			routed.getAgent("demo-agent"),
			routed.getAgent("demo-agent"),
		]);
		const third = await routed.getAgent("demo-agent");

		expect(first).toEqual(second);
		expect(third.data).toEqual({ key: "demo-agent" });
		expect(mockRequestPlatformData).toHaveBeenCalledTimes(1);
		expect(mockRequestPlatformData).toHaveBeenCalledWith("/api/agent", {
			agentKey: "demo-agent",
		});
		expect(mockGetAgent).not.toHaveBeenCalled();
	});

	it("dedupes only concurrent chat detail requests", async () => {
		mockRequestPlatformData.mockResolvedValue(ok({ chatId: "chat-1" }));
		const routed = await import("./routedClient");

		const [first, second] = await Promise.all([
			routed.getChat("chat-1", false),
			routed.getChat("chat-1", false),
		]);
		const refreshed = await routed.getChat("chat-1", false);

		expect(first).toEqual(second);
		expect(refreshed.data).toEqual({ chatId: "chat-1" });
		expect(
			mockRequestPlatformData.mock.calls.filter(
				([type]) => type === "/api/chat",
			),
		).toHaveLength(2);
		expect(mockGetChat).not.toHaveBeenCalled();
	});

	it("keeps cached payloads independent and preserves invalidation", async () => {
		mockRequestPlatformData.mockImplementation(async (type: string, payload: unknown) =>
			ok(type === "/api/chat" ? payload : [{ key: "agent-1" }]),
		);
		mockUpdateAgentName.mockResolvedValue(ok({ key: "agent-1", name: "New name" }));
		const routed = await import("./routedClient");

		await routed.getChat("chat-1", false);
		await routed.getChat("chat-1", true);
		await routed.getAgents();
		await routed.getAgents();
		await routed.getAgent("agent-1");
		await routed.getAgent("agent-1");
		await routed.updateAgentName({ agentKey: "agent-1", name: "New name" });
		await routed.getAgents();
		await routed.getAgent("agent-1");

		expect(mockRequestPlatformData.mock.calls.filter(([type]) => type === "/api/chat"))
			.toHaveLength(2);
		expect(mockRequestPlatformData.mock.calls.filter(([type]) => type === "/api/agents"))
			.toHaveLength(2);
		expect(mockRequestPlatformData.mock.calls.filter(([type]) => type === "/api/agent"))
			.toHaveLength(2);
		expect(mockUpdateAgentName).toHaveBeenCalledTimes(1);
	});

	it("routes Platform raw text readers over WS", async () => {
		mockRequestPlatformData
			.mockResolvedValueOnce(ok('{"type":"message"}\n'))
			.mockResolvedValueOnce(ok({ runId: "run-1" }));
		const routed = await import("./routedClient");

		await expect(routed.getChatRawJsonl("chat-1")).resolves.toBe(
			'{"type":"message"}\n',
		);
		await expect(routed.getChatLLMTraceRaw("trace.json")).resolves.toBe(
			'{"runId":"run-1"}',
		);

		expect(mockRequestPlatformData).toHaveBeenNthCalledWith(1, "/api/chat/jsonl", {
			chatId: "chat-1",
		});
		expect(mockRequestPlatformData).toHaveBeenNthCalledWith(2, "/api/chat/llm-trace", {
			file: "trace.json",
		});
		expect(mockGetChatRawJsonl).not.toHaveBeenCalled();
		expect(mockGetChatLLMTraceRaw).not.toHaveBeenCalled();
	});

	it("uses WS for Gateway-supported endpoints and HTTP for unsupported ones", async () => {
		mockGetBackendMode.mockReturnValue("gateway");
		mockRequestPlatformData.mockResolvedValue(ok([{ key: "agent-1" }]));
		mockGetChatRawJsonl.mockResolvedValue('{"type":"message"}\n');
		const routed = await import("./routedClient");

		await routed.getAgents();
		await expect(routed.getChatRawJsonl("chat-1")).resolves.toBe(
			'{"type":"message"}\n',
		);

		expect(mockRequestPlatformData).toHaveBeenCalledTimes(1);
		expect(mockRequestPlatformData).toHaveBeenCalledWith("/api/agents", undefined);
		expect(mockGetChatRawJsonl).toHaveBeenCalledWith("chat-1");
	});

	it("never falls back to HTTP after transport or business failures", async () => {
		mockGetAgents.mockResolvedValue(ok([{ key: "http-agent" }]));
		const routed = await import("./routedClient");
		const failures = [
			Object.assign(new Error("WebSocket connection failed"), { code: "WS_CONNECT_FAILED" }),
			Object.assign(new Error("WebSocket transport disconnected"), { code: "WS_DISCONNECTED" }),
			Object.assign(new Error("WebSocket request timeout"), { code: "WS_REQUEST_TIMEOUT" }),
			Object.assign(new Error("Bad request"), { status: 400, code: 400 }),
			Object.assign(new Error("Server error"), { status: 500, code: 500 }),
		];

		for (const failure of failures) {
			mockRequestPlatformData.mockRejectedValueOnce(failure);
			await expect(routed.getAgents()).rejects.toBe(failure);
		}

		expect(mockRequestPlatformData).toHaveBeenCalledTimes(failures.length);
		expect(mockGetAgents).not.toHaveBeenCalled();
	});

	it("keeps management endpoints on HTTP", async () => {
		mockGetAutomations.mockResolvedValue(ok({ items: [] }));
		mockGetAgentOrder.mockResolvedValue(ok({ order: [] }));
		const routed = await import("./routedClient");

		await routed.getAutomations({ limit: 20 });
		await routed.getAgentOrder();

		expect(mockGetAutomations).toHaveBeenCalledWith({ limit: 20 });
		expect(mockGetAgentOrder).toHaveBeenCalledTimes(1);
		expect(mockRequestPlatformData).not.toHaveBeenCalled();
	});
});
