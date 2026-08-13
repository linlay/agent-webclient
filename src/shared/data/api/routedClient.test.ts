const mockGetWsClient = jest.fn();
const mockGetWsClientAccessToken = jest.fn();
const mockInitWsClient = jest.fn();

jest.mock("@/shared/data/api/client", () => {
	class MockApiError extends Error {
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
	}

	return {
			ApiError: MockApiError,
			archiveChats: jest.fn(),
			buildResourceUrl: jest.fn((file: string) => `/api/resource?file=${file}`),
			createAgent: jest.fn(),
			createAutomation: jest.fn(),
			createQueryStream: jest.fn(),
			deriveChat: jest.fn(),
			deleteAgent: jest.fn(),
			deleteArchive: jest.fn(),
			deleteChat: jest.fn(),
			deleteAutomation: jest.fn(),
		downloadChatExport: jest.fn(),
		downloadResource: jest.fn(),
		ensureAccessToken: jest.fn(),
			getAgent: jest.fn(),
			getAgentSkills: jest.fn(),
			getAgentFile: jest.fn(),
		getAgentOrder: jest.fn(),
		getModelOptions: jest.fn(),
		getAgents: jest.fn(),
		getChatLLMTraceRaw: jest.fn(),
		getChatRawJsonl: jest.fn(),
		getChatSystemPrompt: jest.fn(),
		getArchive: jest.fn(),
		getArchives: jest.fn(),
		getChat: jest.fn(),
		getChats: jest.fn(),
			getMemoryMeta: jest.fn(),
			getMemoryRecord: jest.fn(),
			getMemoryRecords: jest.fn(),
			getMemoryScope: jest.fn(),
			getMemoryScopes: jest.fn(),
			getCurrentAccessToken: jest.fn(),
			getAutomation: jest.fn(),
			getAutomationExecutions: jest.fn(),
			getAutomations: jest.fn(),
			normalizeChatSummariesPayload: jest.fn((data: unknown) =>
			Array.isArray(data)
				? data.map((item) =>
					item && typeof item === "object"
						? {
							...item,
							hasPendingAwaiting: Boolean((item as { awaiting?: unknown }).awaiting),
						}
						: item,
				  )
				: [],
		),
		getResourceText: jest.fn(),
		getTeams: jest.fn(),
		getViewport: jest.fn(),
		compactChat: jest.fn(),
		interruptChat: jest.fn(),
		learnChat: jest.fn(),
		markChatRead: jest.fn(),
		openAgentDirectory: jest.fn(),
		rememberChat: jest.fn(),
		renameChat: jest.fn(),
		restoreArchives: jest.fn(),
		previewMemoryContext: jest.fn(),
		searchArchives: jest.fn(),
		searchGlobal: jest.fn(),
		saveMemoryScope: jest.fn(),
		setAccessToken: jest.fn(),
			steerChat: jest.fn(),
			submitFeedback: jest.fn(),
			submitAwaiting: jest.fn(),
			submitTool: jest.fn(),
			toggleAutomation: jest.fn(),
			updateAgent: jest.fn(),
			updateAgentName: jest.fn(),
			updateAccessLevel: jest.fn(),
			updateAgentModelConfig: jest.fn(),
			putAgentOrder: jest.fn(),
			updateAutomation: jest.fn(),
		uploadFile: jest.fn(),
		validateMemoryScope: jest.fn(),
	};
});
jest.mock("@/features/transport/lib/wsClientSingleton", () => ({
	getWsClient: () => mockGetWsClient(),
	getWsClientAccessToken: () => mockGetWsClientAccessToken(),
	initWsClient: (options: unknown) => mockInitWsClient(options),
}));

let mockApiClient: {
		ApiError: new (
		message: string,
		options?: { status?: number | null; code?: number | string | null; data?: unknown },
	) => Error;
		archiveChats: jest.Mock;
		buildResourceUrl: jest.Mock;
		createAgent: jest.Mock;
		createAutomation: jest.Mock;
		createQueryStream: jest.Mock;
		deriveChat: jest.Mock;
		deleteArchive: jest.Mock;
		deleteAgent: jest.Mock;
		deleteChat: jest.Mock;
		deleteAutomation: jest.Mock;
	downloadChatExport: jest.Mock;
	downloadResource: jest.Mock;
	ensureAccessToken: jest.Mock;
	getAgent: jest.Mock;
	getAgentSkills: jest.Mock;
	getAgentFile: jest.Mock;
	getAgentOrder: jest.Mock;
	getModelOptions: jest.Mock;
	getAgents: jest.Mock;
	getChatLLMTraceRaw: jest.Mock;
	getChatRawJsonl: jest.Mock;
	getChatSystemPrompt: jest.Mock;
	getArchive: jest.Mock;
	getArchives: jest.Mock;
	getChat: jest.Mock;
	getChats: jest.Mock;
		getMemoryMeta: jest.Mock;
		getMemoryRecord: jest.Mock;
		getMemoryRecords: jest.Mock;
		getMemoryScope: jest.Mock;
		getMemoryScopes: jest.Mock;
		getCurrentAccessToken: jest.Mock;
		getAutomation: jest.Mock;
		getAutomationExecutions: jest.Mock;
		getAutomations: jest.Mock;
	normalizeChatSummariesPayload: jest.Mock;
	getResourceText: jest.Mock;
	getTeams: jest.Mock;
	getViewport: jest.Mock;
	compactChat: jest.Mock;
	interruptChat: jest.Mock;
	learnChat: jest.Mock;
	markChatRead: jest.Mock;
	openAgentDirectory: jest.Mock;
	rememberChat: jest.Mock;
	renameChat: jest.Mock;
	restoreArchives: jest.Mock;
	previewMemoryContext: jest.Mock;
	searchArchives: jest.Mock;
	searchGlobal: jest.Mock;
	saveMemoryScope: jest.Mock;
	setAccessToken: jest.Mock;
	steerChat: jest.Mock;
		submitFeedback: jest.Mock;
		submitAwaiting: jest.Mock;
		submitTool: jest.Mock;
		toggleAutomation: jest.Mock;
		updateAgent: jest.Mock;
		updateAgentName: jest.Mock;
		updateAccessLevel: jest.Mock;
		updateAgentModelConfig: jest.Mock;
		putAgentOrder: jest.Mock;
		updateAutomation: jest.Mock;
		uploadFile: jest.Mock;
		validateMemoryScope: jest.Mock;
	};
let WsClientDisconnectedError: typeof import("@/features/transport/lib/wsClient").WsClientDisconnectedError;
let WsClientRequestTimeoutError: typeof import("@/features/transport/lib/wsClient").WsClientRequestTimeoutError;

describe("routedClient", () => {
	beforeEach(() => {
		jest.resetModules();
		mockGetWsClient.mockReset();
		mockGetWsClientAccessToken.mockReset();
		mockInitWsClient.mockReset();
		mockApiClient = jest.requireMock("@/shared/data/api/client") as typeof mockApiClient;
		({
			WsClientDisconnectedError,
			WsClientRequestTimeoutError,
		} = jest.requireActual("@/features/transport/lib/wsClient") as typeof import("@/features/transport/lib/wsClient"));
		Object.values(mockApiClient).forEach((value) => {
			if (typeof value === "function" && "mockReset" in value) {
				(value as jest.Mock).mockClear();
			}
		});
		mockApiClient.getCurrentAccessToken.mockReturnValue("");
		mockApiClient.ensureAccessToken.mockResolvedValue("");
	});

	it("routes request/response calls over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getAgents();

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: undefined,
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("routes mixed agent and team filters over ws payload", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [{ kind: "team", teamId: "team-a", stats: { totalCount: 2 }, chats: [] }],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgents({
			includeChats: 5,
			includeTeam: true,
			scope: "nav",
			mode: "CODER",
		})).resolves.toMatchObject({
			data: [{ kind: "team", teamId: "team-a" }],
		});

		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: { includeChats: 5, includeTeam: true, scope: "nav", mode: "CODER" },
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("routes agent skills over ws with an agentKey payload", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { agentKey: "mock-agent", skills: [] },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getAgentSkills("mock-agent");

		expect(request).toHaveBeenCalledWith({
			type: "/api/skills",
			payload: { agentKey: "mock-agent" },
		});
		expect(mockApiClient.getAgentSkills).not.toHaveBeenCalled();
	});

	it("falls back to http when the agent skills ws transport disconnects", async () => {
		const proxy = await import("./routedClient");
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request: jest.fn().mockRejectedValue(new WsClientDisconnectedError()),
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAgentSkills.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { agentKey: "mock-agent", skills: [] },
		});

		await proxy.getAgentSkills("mock-agent");

		expect(mockApiClient.getAgentSkills).toHaveBeenCalledWith("mock-agent");
	});

	it("does not hide agent skills business errors behind an http fallback", async () => {
		const proxy = await import("./routedClient");
		const error = new mockApiClient.ApiError("agent not found", {
			status: 404,
			code: "agent_not_found",
		});
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request: jest.fn().mockRejectedValue(error),
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgentSkills("missing-agent")).rejects.toBe(error);

		expect(mockApiClient.getAgentSkills).not.toHaveBeenCalled();
	});

	it("caches agent skills independently by agentKey", async () => {
		const proxy = await import("./routedClient");
		const request = jest.fn(({ payload }: { payload?: { agentKey?: string } }) =>
			Promise.resolve({
				status: 200,
				code: 0,
				msg: "ok",
				data: { agentKey: payload?.agentKey, skills: [] },
			}),
		);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getAgentSkills("agent-a");
		await proxy.getAgentSkills("agent-a");
		await proxy.getAgentSkills("agent-b");

		expect(request).toHaveBeenCalledTimes(2);
		expect(request.mock.calls.map(([call]) => call.payload)).toEqual([
			{ agentKey: "agent-a" },
			{ agentKey: "agent-b" },
		]);
	});

	it("dedupes cached GET endpoints and reuses fresh route responses", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["agent-a"],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(Promise.all([proxy.getAgents(), proxy.getAgents()])).resolves.toEqual([
			{
				status: 200,
				code: 0,
				msg: "ok",
				data: ["agent-a"],
			},
			{
				status: 200,
				code: 0,
				msg: "ok",
				data: ["agent-a"],
			},
		]);
		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["agent-a"],
		});

		expect(request).toHaveBeenCalledTimes(1);
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("invalidates route cache after agent mutations", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["agent-a"],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.createAgent.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "agent-b" },
		});

		await proxy.getAgents();
		await proxy.createAgent({
			key: "agent-b",
			definition: { key: "agent-b", name: "Agent B" },
		});
		await proxy.getAgents();

		expect(request).toHaveBeenCalledTimes(2);
		expect(mockApiClient.createAgent).toHaveBeenCalledTimes(1);
	});

	it("routes agent order reads and writes over ws", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest
			.fn()
			.mockResolvedValueOnce({
				status: 200,
				code: 0,
				msg: "ok",
				data: { version: 1, order: [], updatedAt: 0 },
			})
			.mockResolvedValueOnce({
				status: 200,
				code: 0,
				msg: "ok",
				data: { version: 1, order: ["agent-b", "agent-a"], updatedAt: 1 },
			});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getAgentOrder();
		await proxy.putAgentOrder({ order: ["agent-b", "agent-a"] });

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/agents/order",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/agents/order",
			payload: { order: ["agent-b", "agent-a"] },
		});
		expect(mockApiClient.getAgentOrder).not.toHaveBeenCalled();
		expect(mockApiClient.putAgentOrder).not.toHaveBeenCalled();
	});

	it("keeps automation management calls on http even when ws mode is selected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { items: [], total: 0 },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAutomations.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { items: [], total: 0 },
		});
		mockApiClient.getAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", name: "Daily Demo" },
		});
		mockApiClient.createAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", name: "Daily Demo" },
		});
		mockApiClient.updateAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", cron: "0 18 * * 1-5" },
		});
		mockApiClient.toggleAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", enabled: false },
		});
		mockApiClient.getAutomationExecutions.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { items: [], total: 0 },
		});
		mockApiClient.deleteAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", deleted: true },
		});

		await proxy.getAutomations();
		await proxy.getAutomation("daily-demo");
		await proxy.createAutomation({
			name: "Daily Demo",
			description: "Demo",
			cron: "0 9 * * *",
			agentKey: "demo-agent",
			query: { message: "hello" },
		});
		await proxy.updateAutomation({ id: "daily-demo", cron: "0 18 * * 1-5" });
		await proxy.toggleAutomation({ id: "daily-demo", enabled: false });
		await proxy.getAutomationExecutions({ id: "daily-demo", limit: 20 });
		await proxy.deleteAutomation({ id: "daily-demo" });

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(connect).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
		expect(mockApiClient.getAutomations).toHaveBeenCalledWith({});
		expect(mockApiClient.getAutomation).toHaveBeenCalledWith("daily-demo");
		expect(mockApiClient.createAutomation).toHaveBeenCalledWith({
			name: "Daily Demo",
			description: "Demo",
			cron: "0 9 * * *",
			agentKey: "demo-agent",
			query: { message: "hello" },
		});
		expect(mockApiClient.updateAutomation).toHaveBeenCalledWith({
			id: "daily-demo",
			cron: "0 18 * * 1-5",
		});
		expect(mockApiClient.toggleAutomation).toHaveBeenCalledWith({
			id: "daily-demo",
			enabled: false,
		});
		expect(mockApiClient.getAutomationExecutions).toHaveBeenCalledWith({
			id: "daily-demo",
			limit: 20,
		});
		expect(mockApiClient.deleteAutomation).toHaveBeenCalledWith({
			id: "daily-demo",
		});
	});

	it("keeps agent CRUD on http and routes model config over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.createAgent.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});
		mockApiClient.updateAgent.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});
		mockApiClient.deleteAgent.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent", deleted: true },
		});

		await proxy.createAgent({
			key: "editable-agent",
			definition: { key: "editable-agent", name: "Editable Agent" },
		});
		await proxy.updateAgent({
			key: "editable-agent",
			definition: { key: "editable-agent", name: "Updated Agent" },
		});
		await proxy.updateAgentModelConfig({
			agentKey: "editable-agent",
			modelKey: "coder-model",
			reasoningEffort: "HIGH",
		});
		await proxy.deleteAgent({ key: "editable-agent" });
		await proxy.getModelOptions();

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/agent/model-config",
			payload: {
				agentKey: "editable-agent",
				modelKey: "coder-model",
				reasoningEffort: "HIGH",
			},
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/model-options",
			payload: undefined,
		});
		expect(mockApiClient.createAgent).toHaveBeenCalledWith({
			key: "editable-agent",
			definition: { key: "editable-agent", name: "Editable Agent" },
		});
		expect(mockApiClient.updateAgent).toHaveBeenCalledWith({
			key: "editable-agent",
			definition: { key: "editable-agent", name: "Updated Agent" },
		});
		expect(mockApiClient.deleteAgent).toHaveBeenCalledWith({ key: "editable-agent" });
	});

	it("forwards updateAgentName to http and invalidates cached routes", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.updateAgentName.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});

		const result = await proxy.updateAgentName({
			key: "editable-agent",
			name: "Renamed Agent",
		});

		expect(connect).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
		expect(mockApiClient.updateAgentName).toHaveBeenCalledWith({
			key: "editable-agent",
			name: "Renamed Agent",
		});
		expect(result).toEqual({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "editable-agent" },
		});
	});

	it("forwards openAgentDirectory to http with the registered directory identity", async () => {
		const proxy = await import("./routedClient");
		mockApiClient.openAgentDirectory.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				agentKey: "editable-agent",
				directoryType: "config",
				directoryPath: "/agents/editable-agent",
				opened: true,
			},
		});

		await expect(
			proxy.openAgentDirectory({
				agentKey: "editable-agent",
				directoryType: "config",
			}),
		).resolves.toMatchObject({
			data: {
				agentKey: "editable-agent",
				directoryType: "config",
				opened: true,
			},
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.openAgentDirectory).toHaveBeenCalledWith({
			agentKey: "editable-agent",
			directoryType: "config",
		});
	});

	it("routes memory console calls over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {},
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getMemoryRecords({
			agentKey: "agent-a",
			keyword: "bugfix",
			limit: 15,
		});
		await proxy.getMemoryRecord("agent-a", "mem_101");
		await proxy.getMemoryScopes("agent-a");
		await proxy.getMemoryMeta();
		await proxy.getMemoryScope("agent-a", "agent", "agent:agent-a");
		await proxy.validateMemoryScope("agent-a", "agent", "# AGENT");
		await proxy.previewMemoryContext({
			chatId: "chat-preview",
			message: "hello",
		});
		await proxy.saveMemoryScope({
			agentKey: "agent-a",
			scopeType: "agent",
			scopeKey: "agent:agent-a",
			mode: "records",
			records: [
				{
					title: "Preference",
					summary: "Prefer concise answers.",
					category: "general",
					importance: 8,
					confidence: 0.95,
				},
			],
			archiveMissing: true,
		});

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/memory/record/list",
			payload: { agentKey: "agent-a", keyword: "bugfix", limit: 15 },
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/memory/record/detail",
			payload: { agentKey: "agent-a", recordId: "mem_101" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/memory/scope/list",
			payload: { agentKey: "agent-a" },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/memory/meta",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(5, {
			type: "/api/memory/scope/detail",
			payload: {
				agentKey: "agent-a",
				scopeType: "agent",
				scopeKey: "agent:agent-a",
			},
		});
		expect(request).toHaveBeenNthCalledWith(6, {
			type: "/api/memory/scope/validate",
			payload: { agentKey: "agent-a", scopeType: "agent", markdown: "# AGENT" },
		});
		expect(request).toHaveBeenNthCalledWith(7, {
			type: "/api/memory/context-preview",
			payload: { chatId: "chat-preview", message: "hello" },
		});
		expect(request).toHaveBeenNthCalledWith(8, {
			type: "/api/memory/scope/save",
			payload: {
				agentKey: "agent-a",
				scopeType: "agent",
				scopeKey: "agent:agent-a",
				mode: "records",
				records: [
					{
						title: "Preference",
						summary: "Prefer concise answers.",
						category: "general",
						importance: 8,
						confidence: 0.95,
					},
				],
				archiveMissing: true,
			},
		});
		expect(mockApiClient.getMemoryRecords).not.toHaveBeenCalled();
		expect(mockApiClient.getMemoryRecord).not.toHaveBeenCalled();
		expect(mockApiClient.getMemoryScopes).not.toHaveBeenCalled();
		expect(mockApiClient.getMemoryMeta).not.toHaveBeenCalled();
		expect(mockApiClient.getMemoryScope).not.toHaveBeenCalled();
		expect(mockApiClient.validateMemoryScope).not.toHaveBeenCalled();
		expect(mockApiClient.previewMemoryContext).not.toHaveBeenCalled();
		expect(mockApiClient.saveMemoryScope).not.toHaveBeenCalled();
	});

	it("initializes a ws client when ws mode is selected before transport bootstraps", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["ws"],
		});
		mockGetWsClient.mockReturnValue(null);
		mockApiClient.getCurrentAccessToken.mockReturnValue("token_1");
		mockInitWsClient.mockReturnValue({
			connect,
			request,
		});

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["ws"],
		});

		expect(mockInitWsClient).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: "token_1" }),
		);
		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: undefined,
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("waits for a disconnected ws client instead of falling back to http", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["ws-after-connect"],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["ws-after-connect"],
		});

		expect(connect).toHaveBeenCalledTimes(1);
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("uses the current singleton when the initial ws client is replaced before request", async () => {
		const proxy = await import("./routedClient");

		let currentSingleton: {
			connect: jest.Mock;
			updateOptions: jest.Mock;
			request: jest.Mock;
		};
		const currentClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request: jest.fn().mockResolvedValue({
				status: 200,
				code: 0,
				msg: "ok",
				data: ["current-ws"],
			}),
		};
		const staleClient = {
			connect: jest.fn().mockImplementation(async () => {
				currentSingleton = currentClient;
			}),
			updateOptions: jest.fn(),
			request: jest.fn(),
		};
		currentSingleton = staleClient;
		mockGetWsClient.mockImplementation(() => currentSingleton);
		mockGetWsClientAccessToken.mockReturnValue("token_1");
		mockApiClient.getCurrentAccessToken.mockReturnValue("token_1");

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["current-ws"],
		});

		expect(staleClient.connect).toHaveBeenCalledTimes(1);
		expect(currentClient.connect).toHaveBeenCalledTimes(1);
		expect(staleClient.request).not.toHaveBeenCalled();
		expect(currentClient.request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: undefined,
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("falls back to http when agents websocket connect fails", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientDisconnectedError("WebSocket connection failed");
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockRejectedValue(error),
			updateOptions: jest.fn(),
			request: jest.fn(),
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAgents.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["http-agents"],
		});

		await expect(proxy.getAgents({ includeChats: 5 })).resolves.toMatchObject({
			data: ["http-agents"],
		});
		expect(mockApiClient.getAgents).toHaveBeenCalledWith({ includeChats: 5 });
	});

	it("falls back to http when teams websocket connect fails", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientDisconnectedError("WebSocket connection failed");
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockRejectedValue(error),
			updateOptions: jest.fn(),
			request: jest.fn(),
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getTeams.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["http-teams"],
		});

		await expect(proxy.getTeams()).resolves.toMatchObject({
			data: ["http-teams"],
		});
		expect(mockApiClient.getTeams).toHaveBeenCalledTimes(1);
	});

	it("falls back to http when chats websocket connect fails", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientDisconnectedError("WebSocket connection failed");
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockRejectedValue(error),
			updateOptions: jest.fn(),
			request: jest.fn(),
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getChats.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [{ chatId: "chat_http", awaiting: { awaitingId: "await_http" } }],
		});

		await expect(proxy.getChats({ agentKey: "agent-a" })).resolves.toMatchObject({
			data: [{ chatId: "chat_http", hasPendingAwaiting: true }],
		});
		expect(mockApiClient.getChats).toHaveBeenCalledWith({ agentKey: "agent-a" });
	});

	it("normalizes chat summaries returned from ws /api/chats responses", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [
				{
					chatId: "chat_1",
					teamId: "team-a",
					awaiting: {
						awaitingId: "await_1",
						runId: "run_1",
						mode: "question",
						createdAt: 123,
					},
				},
			],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChats({ agentKey: "agent-a", mode: "CODER" })).resolves.toMatchObject({
			data: [
				{
					chatId: "chat_1",
					teamId: "team-a",
					hasPendingAwaiting: true,
				},
			],
		});
		expect(request).toHaveBeenCalledWith({
			type: "/api/chats",
			payload: { agentKey: "agent-a", mode: "CODER" },
		});
		expect(mockApiClient.normalizeChatSummariesPayload).toHaveBeenCalledWith([
			{
				chatId: "chat_1",
				teamId: "team-a",
				awaiting: {
					awaitingId: "await_1",
					runId: "run_1",
					mode: "question",
					createdAt: 123,
				},
			},
		]);
	});

	it("routes chat history loads over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", events: [] },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChat("chat_1", true)).resolves.toMatchObject({
			data: { chatId: "chat_1", events: [] },
		});

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/chat",
			payload: { chatId: "chat_1", includeRawMessages: true },
		});
		expect(mockApiClient.getChat).not.toHaveBeenCalled();
	});

	it("routes raw chat jsonl loads over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: '{"_type":"query"}\n',
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChatRawJsonl("chat_1")).resolves.toBe(
			'{"_type":"query"}\n',
		);

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/jsonl",
			payload: { chatId: "chat_1" },
		});
		expect(mockApiClient.getChatRawJsonl).not.toHaveBeenCalled();
	});

	it("falls back to http when raw chat jsonl ws request disconnects", async () => {
		const proxy = await import("./routedClient");

		const request = jest
			.fn()
			.mockRejectedValue(new WsClientDisconnectedError());
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getChatRawJsonl.mockResolvedValue('{"_type":"query"}\n');

		await expect(proxy.getChatRawJsonl("chat_1")).resolves.toBe(
			'{"_type":"query"}\n',
		);

		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/jsonl",
			payload: { chatId: "chat_1" },
		});
		expect(mockApiClient.getChatRawJsonl).toHaveBeenCalledWith("chat_1");
	});

	it("routes agent file details over ws when connected", async () => {
		const proxy = await import("./routedClient");
		const params = { agentKey: "coder-agent", path: "Dockerfile" };
		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { ...params, name: "Dockerfile", contentKind: "text", content: "FROM node", sizeBytes: 9, truncated: false },
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgentFile(params)).resolves.toMatchObject({
			data: { name: "Dockerfile", content: "FROM node" },
		});

		expect(request).toHaveBeenCalledWith({
			type: "/api/file",
			payload: params,
		});
		expect(mockApiClient.getAgentFile).not.toHaveBeenCalled();
	});

	it("falls back to HTTP when an agent file ws request disconnects", async () => {
		const proxy = await import("./routedClient");
		const params = { agentKey: "coder-agent", path: ".env.example" };
		const request = jest
			.fn()
			.mockRejectedValue(new WsClientDisconnectedError());
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAgentFile.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { ...params, name: ".env.example", contentKind: "text", content: "", sizeBytes: 0, truncated: false },
		});

		await expect(proxy.getAgentFile(params)).resolves.toMatchObject({
			data: { name: ".env.example" },
		});

		expect(request).toHaveBeenCalledWith({ type: "/api/file", payload: params });
		expect(mockApiClient.getAgentFile).toHaveBeenCalledWith(params);
	});

	it("falls back to HTTP when the current server has no agent file ws route", async () => {
		const proxy = await import("./routedClient");
		const params = { agentKey: "coder-agent", path: "jest.config.cjs" };
		const request = jest.fn().mockRejectedValue(
			new mockApiClient.ApiError("unknown type: /api/file", {
				status: 400,
				code: "invalid_request",
			}),
		);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAgentFile.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { ...params, name: "jest.config.cjs", contentKind: "text", content: "module.exports = {}", sizeBytes: 19, truncated: false },
		});

		await expect(proxy.getAgentFile(params)).resolves.toMatchObject({
			data: { name: "jest.config.cjs" },
		});

		expect(mockApiClient.getAgentFile).toHaveBeenCalledWith(params);
	});

	it("does not hide real agent file api errors behind an HTTP retry", async () => {
		const proxy = await import("./routedClient");
		const params = { agentKey: "coder-agent", path: "missing.ts" };
		const error = new mockApiClient.ApiError("file not found", {
			status: 404,
			code: "not_found",
		});
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request: jest.fn().mockRejectedValue(error),
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgentFile(params)).rejects.toBe(error);
		expect(mockApiClient.getAgentFile).not.toHaveBeenCalled();
	});

	it("routes persisted run system prompts over ws when connected", async () => {
		const proxy = await import("./routedClient");
		const params = { chatId: "chat_1", runId: "run_1", agentKey: "agent_1" };
		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				...params,
				systemRef: { ...params, cacheKey: "react:main", fingerprint: "sha256:test" },
				systemMessage: { role: "system", content: "persisted prompt" },
			},
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChatSystemPrompt(params)).resolves.toMatchObject({
			data: { systemMessage: { content: "persisted prompt" } },
		});

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/system-prompt",
			payload: params,
		});
		expect(mockApiClient.getChatSystemPrompt).not.toHaveBeenCalled();
	});

	it("falls back to HTTP when the system prompt ws request disconnects", async () => {
		const proxy = await import("./routedClient");
		const params = { chatId: "chat_1", runId: "run_1", agentKey: "agent_1" };
		const request = jest.fn().mockRejectedValue(new WsClientDisconnectedError());
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getChatSystemPrompt.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				...params,
				systemRef: { agentKey: params.agentKey, cacheKey: "react:main", fingerprint: "sha256:test" },
				systemMessage: { role: "system", content: "persisted prompt" },
			},
		});

		await expect(proxy.getChatSystemPrompt(params)).resolves.toMatchObject({
			data: { systemMessage: { content: "persisted prompt" } },
		});

		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/system-prompt",
			payload: params,
		});
		expect(mockApiClient.getChatSystemPrompt).toHaveBeenCalledWith(params);
	});

	it("does not fall back to HTTP when the system prompt ws request returns an API error", async () => {
		const proxy = await import("./routedClient");
		const params = { chatId: "chat_1", runId: "run_missing", agentKey: "agent_1" };
		const error = new mockApiClient.ApiError("system prompt not found", {
			status: 404,
			code: 404,
		});
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChatSystemPrompt(params)).rejects.toBe(error);

		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/system-prompt",
			payload: params,
		});
		expect(mockApiClient.getChatSystemPrompt).not.toHaveBeenCalled();
	});

	it("routes raw llm trace loads over ws when connected", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: '{"runId":"run_1"}\n',
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getChatLLMTraceRaw("chat_1/.llm-records/run_1_001.json")).resolves.toBe(
			'{"runId":"run_1"}\n',
		);

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/llm-trace",
			payload: { file: "chat_1/.llm-records/run_1_001.json" },
		});
		expect(mockApiClient.getChatLLMTraceRaw).not.toHaveBeenCalled();
	});

	it("normalizes object raw llm trace ws responses to json text", async () => {
		const proxy = await import("./routedClient");

		const tracePayload = {
			request: {
				messages: [
					{ role: "system", content: "system" },
					{ role: "user", content: "hello" },
				],
			},
		};
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: tracePayload,
		});
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		const rawText = await proxy.getChatLLMTraceRaw("chat_1/.llm-records/run_1_001.json");

		expect(JSON.parse(rawText)).toEqual(tracePayload);
		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/llm-trace",
			payload: { file: "chat_1/.llm-records/run_1_001.json" },
		});
		expect(mockApiClient.getChatLLMTraceRaw).not.toHaveBeenCalled();
	});

	it("falls back to http when raw llm trace ws request disconnects", async () => {
		const proxy = await import("./routedClient");

		const request = jest
			.fn()
			.mockRejectedValue(new WsClientDisconnectedError());
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getChatLLMTraceRaw.mockResolvedValue('{"runId":"run_1"}\n');

		await expect(proxy.getChatLLMTraceRaw("chat_1/.llm-records/run_1_001.json")).resolves.toBe(
			'{"runId":"run_1"}\n',
		);

		expect(request).toHaveBeenCalledWith({
			type: "/api/chat/llm-trace",
			payload: { file: "chat_1/.llm-records/run_1_001.json" },
		});
		expect(mockApiClient.getChatLLMTraceRaw).toHaveBeenCalledWith("chat_1/.llm-records/run_1_001.json");
	});

	it("routes markChatRead over ws without falling back to http", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				chatId: "chat_1",
				read: { isRead: true },
			},
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(
			proxy.markChatRead({ chatId: "chat_1", runId: "run_1" }),
		).resolves.toMatchObject({
			data: {
				chatId: "chat_1",
				read: { isRead: true },
			},
		});
		expect(request).toHaveBeenCalledWith({
			type: "/api/read",
			payload: { chatId: "chat_1", runId: "run_1" },
		});
		expect(mockApiClient.markChatRead).not.toHaveBeenCalled();
	});

	it("routes access level updates over ws without falling back to http", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				accepted: true,
				status: "updated",
				runId: "run_1",
				previousAccessLevel: "default",
				accessLevel: "auto_approve",
				version: 2,
				detail: "accessLevel updated",
			},
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(
			proxy.updateAccessLevel({
				requestId: "req_access",
				owner: { kind: "agent", agentKey: "agent_a" },
				runId: "run_1",
				accessLevel: "auto_approve",
				reason: "user toggled permission",
			}),
		).resolves.toMatchObject({
			data: {
				accepted: true,
				accessLevel: "auto_approve",
			},
		});
		expect(request).toHaveBeenCalledWith({
			type: "/api/access-level",
			payload: {
				requestId: "req_access",
				agentKey: "agent_a",
				runId: "run_1",
				accessLevel: "auto_approve",
				reason: "user toggled permission",
			},
		});
		expect(mockApiClient.updateAccessLevel).not.toHaveBeenCalled();
	});

	it("refreshes the app token once when a ws action connect fails", async () => {
		const proxy = await import("./routedClient");

		const firstConnect = jest.fn().mockRejectedValue(
			new WsClientDisconnectedError("WebSocket connection failed"),
		);
		const secondConnect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {
				chatId: "chat_1",
				read: { isRead: true },
			},
		});
		mockApiClient.getCurrentAccessToken.mockReturnValue("token_old");
		mockApiClient.ensureAccessToken.mockResolvedValue("token_new");
		mockGetWsClient.mockReturnValue({
			connect: firstConnect,
			updateOptions: jest.fn(),
			request: jest.fn(),
		});
		mockGetWsClientAccessToken.mockReturnValue("token_old");
		mockInitWsClient.mockReturnValue({
			connect: secondConnect,
			request,
		});

		await expect(
			proxy.markChatRead({ chatId: "chat_1", runId: "run_1" }),
		).resolves.toMatchObject({
			data: {
				chatId: "chat_1",
				read: { isRead: true },
			},
		});

		expect(firstConnect).toHaveBeenCalledTimes(1);
		expect(mockApiClient.ensureAccessToken).toHaveBeenCalledWith("unauthorized");
		expect(mockInitWsClient).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: "token_new" }),
		);
		expect(secondConnect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/read",
			payload: { chatId: "chat_1", runId: "run_1" },
		});
		expect(mockApiClient.markChatRead).not.toHaveBeenCalled();
	});

	it("routes chat action requests over ws", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: {},
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.submitFeedback({
			chatId: "chat_1",
			runId: "run_1",
			type: "thumbs_down",
		});
		await proxy.deriveChat({
			sourceChatId: "chat_1",
			sourceRunId: "run_1",
		});
		await proxy.deleteChat({ chatId: "chat_1" });
		await proxy.renameChat({ chatId: "chat_1", chatName: "Renamed chat" });
		await proxy.searchGlobal({ query: "needle", agentKey: "agent_a", limit: 5 });
		await proxy.markChatRead({ agentKey: "agent_a" });
		await proxy.archiveChats({ chatIds: ["chat_1"] });
		await proxy.getArchives({ agentKey: "agent_a", limit: 10, offset: 20 });
		await proxy.getArchive("chat_1", true);
		await proxy.searchArchives({ query: "old", agentKey: "agent_a", limit: 6 });
		await proxy.deleteArchive({ chatId: "chat_1" });
		await proxy.restoreArchives({ chatIds: ["chat_1"] });

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/feedback",
			payload: { chatId: "chat_1", runId: "run_1", type: "thumbs_down" },
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/chat/derive",
			payload: { sourceChatId: "chat_1", sourceRunId: "run_1" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/chat/delete",
			payload: { chatId: "chat_1" },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/chat/rename",
			payload: { chatId: "chat_1", chatName: "Renamed chat" },
		});
		expect(request).toHaveBeenNthCalledWith(5, {
			type: "/api/chats/search",
			payload: { query: "needle", agentKey: "agent_a", limit: 5 },
		});
		expect(request).toHaveBeenNthCalledWith(6, {
			type: "/api/read",
			payload: { agentKey: "agent_a" },
		});
		expect(request).toHaveBeenNthCalledWith(7, {
			type: "/api/chat/archive",
			payload: { chatIds: ["chat_1"] },
		});
		expect(request).toHaveBeenNthCalledWith(8, {
			type: "/api/archives",
			payload: { agentKey: "agent_a", limit: 10, offset: 20 },
		});
		expect(request).toHaveBeenNthCalledWith(9, {
			type: "/api/archive",
			payload: { chatId: "chat_1", includeRawMessages: true },
		});
		expect(request).toHaveBeenNthCalledWith(10, {
			type: "/api/archives/search",
			payload: { query: "old", agentKey: "agent_a", limit: 6 },
		});
		expect(request).toHaveBeenNthCalledWith(11, {
			type: "/api/archive/delete",
			payload: { chatId: "chat_1" },
		});
		expect(request).toHaveBeenNthCalledWith(12, {
			type: "/api/archive/restore",
			payload: { chatIds: ["chat_1"] },
		});
		expect(mockApiClient.submitFeedback).not.toHaveBeenCalled();
		expect(mockApiClient.deriveChat).not.toHaveBeenCalled();
		expect(mockApiClient.deleteChat).not.toHaveBeenCalled();
		expect(mockApiClient.renameChat).not.toHaveBeenCalled();
		expect(mockApiClient.searchGlobal).not.toHaveBeenCalled();
		expect(mockApiClient.archiveChats).not.toHaveBeenCalled();
		expect(mockApiClient.deleteArchive).not.toHaveBeenCalled();
		expect(mockApiClient.restoreArchives).not.toHaveBeenCalled();
	});

	it("falls back to http when derive chat websocket connect fails", async () => {
		const proxy = await import("./routedClient");

		const connect = jest.fn().mockRejectedValue(new Error("ws unavailable"));
		const request = jest.fn();
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.deriveChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_new" },
		});

		const response = await proxy.deriveChat({
			sourceChatId: "chat_1",
			sourceRunId: "run_1",
		});

		expect(response.data).toEqual({ chatId: "chat_new" });
		expect(request).not.toHaveBeenCalled();
		expect(mockApiClient.deriveChat).toHaveBeenCalledWith({
			sourceChatId: "chat_1",
			sourceRunId: "run_1",
		});
	});

	it("falls back to http when a read-only ws request times out", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientRequestTimeoutError(
			"WebSocket request timeout: /api/agents",
		);
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getAgents.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["http-after-timeout"],
		});

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["http-after-timeout"],
		});
		expect(mockApiClient.getAgents).toHaveBeenCalledTimes(1);
	});

	it("falls back to http when a read-only ws request disconnects after connect", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientDisconnectedError("WebSocket transport disconnected");
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");
		mockApiClient.getChats.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [{ chatId: "chat_http", awaiting: { awaitingId: "await_http" } }],
		});

		await expect(proxy.getChats()).resolves.toMatchObject({
			data: [{ chatId: "chat_http", hasPendingAwaiting: true }],
		});
		expect(mockApiClient.getChats).toHaveBeenCalledTimes(1);
	});

	it("does not fall back for read-only requests when ws returns an ApiError", async () => {
		const proxy = await import("./routedClient");

		const error = new mockApiClient.ApiError("bad request", {
			status: 400,
			code: 123,
		});
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgents()).rejects.toBe(error);
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("does not fall back for side-effect requests when ws transport fails", async () => {
		const proxy = await import("./routedClient");

		const error = new WsClientDisconnectedError();
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(
			proxy.interruptChat({
				requestId: "req_1",
				chatId: "chat_1",
				owner: { kind: "agent", agentKey: "agent_a" },
				message: "stop",
			}),
		).rejects.toBe(error);
		expect(mockApiClient.interruptChat).not.toHaveBeenCalled();
	});

	it("keeps ordinary requests on websocket transport when ws mode is selected", async () => {
		const proxy = await import("./routedClient");
		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["ws-only"],
		});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["ws-only"],
		});

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: undefined,
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("keeps upload/download/resource helpers on the original http exports", async () => {
		const proxy = await import("./routedClient");

		expect(proxy.buildResourceUrl("demo.txt")).toBe("/api/resource?file=demo.txt");
		expect(proxy.uploadFile).toBe(mockApiClient.uploadFile);
		expect(proxy.downloadResource).toBe(mockApiClient.downloadResource);
	});

	it("routes automation management over ws transport", async () => {
		const proxy = await import("./routedClient");
		mockApiClient.getAutomations.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { items: [], total: 0 },
		});
		mockApiClient.toggleAutomation.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { id: "daily-demo", enabled: false },
		});

		await expect(proxy.getAutomations()).resolves.toMatchObject({
			data: { items: [], total: 0 },
		});
		await expect(
			proxy.toggleAutomation({ id: "daily-demo", enabled: false }),
		).resolves.toMatchObject({
			data: { id: "daily-demo", enabled: false },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getAutomations).toHaveBeenCalledWith({});
		expect(mockApiClient.toggleAutomation).toHaveBeenCalledWith({
			id: "daily-demo",
			enabled: false,
		});
	});

});
