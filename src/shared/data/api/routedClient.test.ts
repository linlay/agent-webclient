const mockGetAgents = jest.fn();
const mockGetChat = jest.fn();
const mockGetChats = jest.fn();
const mockGetChatRawJsonl = jest.fn();
const mockGetChatLLMTraceRaw = jest.fn();
const mockUpdateAgentName = jest.fn();
const mockGetAutomations = jest.fn();
const mockGetWsClient = jest.fn();

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
	createQueryStream: jest.fn(),
	downloadChatExport: jest.fn(),
	downloadResource: jest.fn(),
	ensureAccessToken: jest.fn(),
	getCurrentAccessToken: jest.fn(() => ""),
	getResourceText: jest.fn(),
	setAccessToken: jest.fn(),
	uploadFile: jest.fn(),
	getAgents: (...args: unknown[]) => mockGetAgents(...args),
	getChat: (...args: unknown[]) => mockGetChat(...args),
	getChats: (...args: unknown[]) => mockGetChats(...args),
	getChatRawJsonl: (...args: unknown[]) => mockGetChatRawJsonl(...args),
	getChatLLMTraceRaw: (...args: unknown[]) => mockGetChatLLMTraceRaw(...args),
	updateAgentName: (...args: unknown[]) => mockUpdateAgentName(...args),
	getAutomations: (...args: unknown[]) => mockGetAutomations(...args),
	normalizeChatSummariesPayload: jest.fn((data: unknown) => data),
}));

jest.mock("@/features/transport/lib/wsClientSingleton", () => ({
	getWsClient: (...args: unknown[]) => mockGetWsClient(...args),
}));

const ok = <T,>(data: T) => ({
	status: 200,
	code: 0,
	msg: "success",
	data,
});

describe("routedClient HTTP-only routing", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
	});

	it("uses HTTP for ordinary data and dedupes a fresh cached GET", async () => {
		mockGetAgents.mockResolvedValue(ok([{ key: "agent-1" }]));
		const routed = await import("./routedClient");

		const [first, second] = await Promise.all([
			routed.getAgents({ keyword: "coder" }),
			routed.getAgents({ keyword: "coder" }),
		]);
		const third = await routed.getAgents({ keyword: "coder" });

		expect(first).toEqual(second);
		expect(third.data).toEqual([{ key: "agent-1" }]);
		expect(mockGetAgents).toHaveBeenCalledTimes(1);
		expect(mockGetAgents).toHaveBeenCalledWith({ keyword: "coder" });
		expect(mockGetWsClient).not.toHaveBeenCalled();
	});

	it("keeps cache entries independent by request payload", async () => {
		mockGetChat.mockImplementation(async (chatId: string, includeRawMessages: boolean) =>
			ok({ chatId, includeRawMessages }),
		);
		const routed = await import("./routedClient");

		await routed.getChat("chat-1", false);
		await routed.getChat("chat-1", true);

		expect(mockGetChat).toHaveBeenCalledTimes(2);
		expect(mockGetChat).toHaveBeenNthCalledWith(1, "chat-1", false);
		expect(mockGetChat).toHaveBeenNthCalledWith(2, "chat-1", true);
	});

	it("invalidates cached agent reads after an HTTP mutation", async () => {
		mockGetAgents.mockResolvedValue(ok([{ key: "agent-1" }]));
		mockUpdateAgentName.mockResolvedValue(ok({ key: "agent-1", name: "New name" }));
		const routed = await import("./routedClient");

		await routed.getAgents();
		await routed.getAgents();
		await routed.updateAgentName({ agentKey: "agent-1", name: "New name" });
		await routed.getAgents();

		expect(mockUpdateAgentName).toHaveBeenCalledWith({
			agentKey: "agent-1",
			name: "New name",
		});
		expect(mockGetAgents).toHaveBeenCalledTimes(2);
	});

	it("keeps raw chat readers on HTTP", async () => {
		mockGetChatRawJsonl.mockResolvedValue('{"type":"message"}\n');
		mockGetChatLLMTraceRaw.mockResolvedValue('{"runId":"run-1"}\n');
		const routed = await import("./routedClient");

		await expect(routed.getChatRawJsonl("chat-1")).resolves.toBe(
			'{"type":"message"}\n',
		);
		await expect(routed.getChatLLMTraceRaw("trace.json")).resolves.toBe(
			'{"runId":"run-1"}\n',
		);

		expect(mockGetChatRawJsonl).toHaveBeenCalledWith("chat-1");
		expect(mockGetChatLLMTraceRaw).toHaveBeenCalledWith("trace.json");
	});

	it("keeps automation management on HTTP", async () => {
		mockGetAutomations.mockResolvedValue(ok({ items: [] }));
		const routed = await import("./routedClient");

		await routed.getAutomations({ limit: 20 });

		expect(mockGetAutomations).toHaveBeenCalledWith({ limit: 20 });
		expect(mockGetWsClient).not.toHaveBeenCalled();
	});
});
