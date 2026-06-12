const mockGetWsClient = jest.fn();
const mockGetWsClientAccessToken = jest.fn();
const mockInitWsClient = jest.fn();

jest.mock("@/shared/api/apiClient", () => {
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
			deleteAgent: jest.fn(),
			deleteArchive: jest.fn(),
			deleteChat: jest.fn(),
			deleteAutomation: jest.fn(),
		downloadChatExport: jest.fn(),
		downloadResource: jest.fn(),
		ensureAccessToken: jest.fn(),
		getAdminAgentDetail: jest.fn(),
		getAdminAgentOrder: jest.fn(),
		getAdminAgents: jest.fn(),
		getAdminRegistries: jest.fn(),
		getAdminRegistryDetail: jest.fn(),
		getAgent: jest.fn(),
		getAgentOrder: jest.fn(),
		getAgentEditorOptions: jest.fn(),
		getModelOptions: jest.fn(),
		getAgents: jest.fn(),
		getChatRawJsonl: jest.fn(),
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
		getSkills: jest.fn(),
		getTeams: jest.fn(),
		getTool: jest.fn(),
		getTools: jest.fn(),
		getViewport: jest.fn(),
		compactChat: jest.fn(),
		interruptChat: jest.fn(),
		learnChat: jest.fn(),
		markChatRead: jest.fn(),
		openAgentWorkspace: jest.fn(),
		putAdminAgentOrder: jest.fn(),
		saveAdminRegistryDetail: jest.fn(),
		rememberChat: jest.fn(),
		renameChat: jest.fn(),
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
			updateAccessLevel: jest.fn(),
			updateAgentModelConfig: jest.fn(),
			putAgentOrder: jest.fn(),
			updateAutomation: jest.fn(),
			uploadFile: jest.fn(),
			validateAdminRegistry: jest.fn(),
			validateMemoryScope: jest.fn(),
	};
});
jest.mock("./wsClientSingleton", () => ({
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
		deleteArchive: jest.Mock;
		deleteAgent: jest.Mock;
		deleteChat: jest.Mock;
		deleteAutomation: jest.Mock;
	downloadChatExport: jest.Mock;
	downloadResource: jest.Mock;
	ensureAccessToken: jest.Mock;
	getAdminAgentDetail: jest.Mock;
	getAdminAgentOrder: jest.Mock;
	getAdminAgents: jest.Mock;
	getAdminRegistries: jest.Mock;
	getAdminRegistryDetail: jest.Mock;
	getAgent: jest.Mock;
	getAgentOrder: jest.Mock;
	getAgentEditorOptions: jest.Mock;
	getModelOptions: jest.Mock;
	getAgents: jest.Mock;
	getChatRawJsonl: jest.Mock;
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
	getSkills: jest.Mock;
	getTeams: jest.Mock;
	getTool: jest.Mock;
	getTools: jest.Mock;
	getViewport: jest.Mock;
	compactChat: jest.Mock;
	interruptChat: jest.Mock;
	learnChat: jest.Mock;
	markChatRead: jest.Mock;
	openAgentWorkspace: jest.Mock;
	putAdminAgentOrder: jest.Mock;
	saveAdminRegistryDetail: jest.Mock;
	rememberChat: jest.Mock;
	renameChat: jest.Mock;
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
		updateAccessLevel: jest.Mock;
		updateAgentModelConfig: jest.Mock;
		putAgentOrder: jest.Mock;
		updateAutomation: jest.Mock;
		uploadFile: jest.Mock;
		validateAdminRegistry: jest.Mock;
		validateMemoryScope: jest.Mock;
	};
let WsClientDisconnectedError: typeof import("./wsClient").WsClientDisconnectedError;
let WsClientRequestTimeoutError: typeof import("./wsClient").WsClientRequestTimeoutError;

describe("apiClientProxy", () => {
	beforeEach(() => {
		jest.resetModules();
		mockGetWsClient.mockReset();
		mockGetWsClientAccessToken.mockReset();
		mockInitWsClient.mockReset();
		mockApiClient = jest.requireMock("@/shared/api/apiClient") as typeof mockApiClient;
		({
			WsClientDisconnectedError,
			WsClientRequestTimeoutError,
		} = jest.requireActual("./wsClient") as typeof import("./wsClient"));
		Object.values(mockApiClient).forEach((value) => {
			if (typeof value === "function" && "mockReset" in value) {
				(value as jest.Mock).mockClear();
			}
		});
		mockApiClient.getCurrentAccessToken.mockReturnValue("");
		mockApiClient.ensureAccessToken.mockResolvedValue("");
	});

	it("routes request/response calls over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

	it("routes agents includeChats over ws payload", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

		await proxy.getAgents({ includeChats: 5 });

		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: { includeChats: 5 },
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("routes agent order reads and writes over ws", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

	it("routes admin agent management calls over ws", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest
			.fn()
			.mockResolvedValueOnce({
				status: 200,
				code: 0,
				msg: "ok",
				data: [],
			})
			.mockResolvedValueOnce({
				status: 200,
				code: 0,
				msg: "ok",
				data: { key: "bad-agent", status: "invalid", diagnostics: [] },
			})
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
				data: { version: 1, order: ["bad-agent"], updatedAt: 1 },
			});
		mockGetWsClient.mockReturnValue({
			connect,
			updateOptions: jest.fn(),
			request,
		});
		mockGetWsClientAccessToken.mockReturnValue("");

		await proxy.getAdminAgents();
		await proxy.getAdminAgentDetail("bad-agent");
		await proxy.getAdminAgentOrder();
		await proxy.putAdminAgentOrder({ order: ["bad-agent"] });

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/admin/agents",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/admin/agents/detail",
			payload: { agentKey: "bad-agent" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/admin/agents/order",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/admin/agents/order",
			payload: { order: ["bad-agent"] },
		});
		expect(mockApiClient.getAdminAgents).not.toHaveBeenCalled();
		expect(mockApiClient.getAdminAgentDetail).not.toHaveBeenCalled();
		expect(mockApiClient.getAdminAgentOrder).not.toHaveBeenCalled();
		expect(mockApiClient.putAdminAgentOrder).not.toHaveBeenCalled();
	});

	it("routes admin registry management calls over ws", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

		await proxy.getAdminRegistries();
		await proxy.getAdminRegistryDetail("models", "openai.yml");
		await proxy.saveAdminRegistryDetail({
			category: "models",
			file: "openai.yml",
			content: "key: openai\n",
		});
		await proxy.validateAdminRegistry({
			category: "models",
			file: "openai.yml",
			content: "key: openai\n",
		});

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/admin/registries",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/admin/registries/detail",
			payload: { category: "models", file: "openai.yml" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/admin/registries/detail",
			payload: { category: "models", file: "openai.yml", content: "key: openai\n" },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/admin/registries/validate",
			payload: { category: "models", file: "openai.yml", content: "key: openai\n" },
		});
		expect(mockApiClient.getAdminRegistries).not.toHaveBeenCalled();
		expect(mockApiClient.getAdminRegistryDetail).not.toHaveBeenCalled();
		expect(mockApiClient.saveAdminRegistryDetail).not.toHaveBeenCalled();
		expect(mockApiClient.validateAdminRegistry).not.toHaveBeenCalled();
	});

	it("routes automation management calls over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

		await proxy.getAutomations();
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

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/automations",
			payload: {},
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/automation/create",
			payload: {
				name: "Daily Demo",
				description: "Demo",
				cron: "0 9 * * *",
				agentKey: "demo-agent",
				query: { message: "hello" },
			},
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/automation/update",
			payload: { id: "daily-demo", cron: "0 18 * * 1-5" },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/automation/toggle",
			payload: { id: "daily-demo", enabled: false },
		});
		expect(request).toHaveBeenNthCalledWith(5, {
			type: "/api/automation/executions",
			payload: { id: "daily-demo", limit: 20 },
		});
		expect(request).toHaveBeenNthCalledWith(6, {
			type: "/api/automation/delete",
			payload: { id: "daily-demo" },
		});
		expect(mockApiClient.getAutomations).not.toHaveBeenCalled();
	});

	it("routes agent management calls over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		await proxy.getAgentEditorOptions();
		await proxy.getModelOptions();

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/agent/create",
			payload: {
				key: "editable-agent",
				definition: { key: "editable-agent", name: "Editable Agent" },
			},
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/agent/update",
			payload: {
				key: "editable-agent",
				definition: { key: "editable-agent", name: "Updated Agent" },
			},
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/agent/model-config",
			payload: {
				agentKey: "editable-agent",
				modelKey: "coder-model",
				reasoningEffort: "HIGH",
			},
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/agent/delete",
			payload: { key: "editable-agent" },
		});
		expect(request).toHaveBeenNthCalledWith(5, {
			type: "/api/agent/editor-options",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(6, {
			type: "/api/model-options",
			payload: undefined,
		});
		expect(mockApiClient.createAgent).not.toHaveBeenCalled();
	});

	it("routes agent console option lookups over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

		await proxy.getAgentEditorOptions();
		await proxy.getTools();
		await proxy.getSkills();

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/agent/editor-options",
			payload: undefined,
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/tools",
			payload: {},
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/skills",
			payload: undefined,
		});
		expect(mockApiClient.getAgentEditorOptions).not.toHaveBeenCalled();
		expect(mockApiClient.getTools).not.toHaveBeenCalled();
		expect(mockApiClient.getSkills).not.toHaveBeenCalled();
	});

	it("routes memory console calls over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [
				{
					chatId: "chat_1",
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

		await expect(proxy.getChats({ agentKey: "agent-a" })).resolves.toMatchObject({
			data: [
				{
					chatId: "chat_1",
					hasPendingAwaiting: true,
				},
			],
		});
		expect(request).toHaveBeenCalledWith({
			type: "/api/chats",
			payload: { agentKey: "agent-a" },
		});
		expect(mockApiClient.normalizeChatSummariesPayload).toHaveBeenCalledWith([
			{
				chatId: "chat_1",
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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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

	it("routes markChatRead over ws without falling back to http", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
				agentKey: "agent_a",
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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		await proxy.deleteChat({ chatId: "chat_1" });
		await proxy.renameChat({ chatId: "chat_1", chatName: "Renamed chat" });
		await proxy.searchGlobal({ query: "needle", agentKey: "agent_a", limit: 5 });
		await proxy.markChatRead({ agentKey: "agent_a" });
		await proxy.archiveChats({ chatIds: ["chat_1"] });
		await proxy.getArchives({ agentKey: "agent_a", limit: 10, offset: 20 });
		await proxy.getArchive("chat_1", true);
		await proxy.searchArchives({ query: "old", agentKey: "agent_a", limit: 6 });
		await proxy.deleteArchive({ chatId: "chat_1" });

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/feedback",
			payload: { chatId: "chat_1", runId: "run_1", type: "thumbs_down" },
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/chat/delete",
			payload: { chatId: "chat_1" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/chat/rename",
			payload: { chatId: "chat_1", chatName: "Renamed chat" },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/search",
			payload: { query: "needle", agentKey: "agent_a", limit: 5 },
		});
		expect(request).toHaveBeenNthCalledWith(5, {
			type: "/api/read",
			payload: { agentKey: "agent_a" },
		});
		expect(request).toHaveBeenNthCalledWith(6, {
			type: "/api/chat/archive",
			payload: { chatIds: ["chat_1"] },
		});
		expect(request).toHaveBeenNthCalledWith(7, {
			type: "/api/archives",
			payload: { agentKey: "agent_a", limit: 10, offset: 20 },
		});
		expect(request).toHaveBeenNthCalledWith(8, {
			type: "/api/archive",
			payload: { chatId: "chat_1", includeRawMessages: true },
		});
		expect(request).toHaveBeenNthCalledWith(9, {
			type: "/api/archive/search",
			payload: { query: "old", agentKey: "agent_a", limit: 6 },
		});
		expect(request).toHaveBeenNthCalledWith(10, {
			type: "/api/archive/delete",
			payload: { chatId: "chat_1" },
		});
		expect(mockApiClient.submitFeedback).not.toHaveBeenCalled();
		expect(mockApiClient.deleteChat).not.toHaveBeenCalled();
		expect(mockApiClient.renameChat).not.toHaveBeenCalled();
		expect(mockApiClient.searchGlobal).not.toHaveBeenCalled();
		expect(mockApiClient.archiveChats).not.toHaveBeenCalled();
		expect(mockApiClient.deleteArchive).not.toHaveBeenCalled();
	});

	it("falls back to http when a read-only ws request times out", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

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
				message: "stop",
			}),
		).rejects.toBe(error);
		expect(mockApiClient.interruptChat).not.toHaveBeenCalled();
	});

	it("ignores the legacy transport override and keeps routing over ws", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");
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
		const proxy = await import("./apiClientProxy");

		expect(proxy.buildResourceUrl("demo.txt")).toBe("/api/resource?file=demo.txt");
		expect(proxy.uploadFile).toBe(mockApiClient.uploadFile);
		expect(proxy.downloadResource).toBe(mockApiClient.downloadResource);
	});

	it("routes ordinary api requests over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.getAgents.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["http"],
		});

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["http"],
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getAgents).toHaveBeenCalledTimes(1);
	});

	it("routes getAgent over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.getAgent.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { agentKey: "agent_1" },
		});

		await expect(proxy.getAgent("agent_1")).resolves.toMatchObject({
			data: { agentKey: "agent_1" },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getAgent).toHaveBeenCalledWith("agent_1");
	});

	it("routes admin agent management calls over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.getAdminAgents.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [{ key: "bad-agent", status: "invalid" }],
		});
		mockApiClient.getAdminAgentDetail.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { key: "bad-agent", status: "invalid" },
		});
		mockApiClient.getAdminAgentOrder.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { version: 1, order: ["bad-agent"], updatedAt: 0 },
		});
		mockApiClient.putAdminAgentOrder.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { version: 2, order: ["bad-agent"], updatedAt: 1 },
		});

		await expect(proxy.getAdminAgents()).resolves.toMatchObject({
			data: [{ key: "bad-agent", status: "invalid" }],
		});
		await expect(proxy.getAdminAgentDetail("bad-agent")).resolves.toMatchObject({
			data: { key: "bad-agent", status: "invalid" },
		});
		await expect(proxy.getAdminAgentOrder()).resolves.toMatchObject({
			data: { order: ["bad-agent"] },
		});
		await expect(proxy.putAdminAgentOrder({ order: ["bad-agent"] })).resolves.toMatchObject({
			data: { version: 2 },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getAdminAgents).toHaveBeenCalledTimes(1);
		expect(mockApiClient.getAdminAgentDetail).toHaveBeenCalledWith("bad-agent");
		expect(mockApiClient.getAdminAgentOrder).toHaveBeenCalledTimes(1);
		expect(mockApiClient.putAdminAgentOrder).toHaveBeenCalledWith({ order: ["bad-agent"] });
	});

	it("routes getChat over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.getChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", events: [] },
		});

		await expect(proxy.getChat("chat_1", false)).resolves.toMatchObject({
			data: { chatId: "chat_1", events: [] },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getChat).toHaveBeenCalledWith("chat_1", false);
	});

	it("routes raw chat jsonl over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.getChatRawJsonl.mockResolvedValue('{"_type":"query"}\n');

		await expect(proxy.getChatRawJsonl("chat_1")).resolves.toBe(
			'{"_type":"query"}\n',
		);

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.getChatRawJsonl).toHaveBeenCalledWith("chat_1");
	});

	it("routes automation management over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
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

	it("routes agent management over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.createAgent.mockResolvedValue({
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
		mockApiClient.getAgentEditorOptions.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { modes: [{ key: "PROXY", label: "ACP-PROXY" }] },
		});
		mockApiClient.getModelOptions.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { models: [{ key: "coder-model" }], reasoningEfforts: [] },
		});

		await expect(
			proxy.createAgent({
				key: "editable-agent",
				definition: { key: "editable-agent", name: "Editable Agent" },
			}),
		).resolves.toMatchObject({
			data: { key: "editable-agent" },
		});
		await expect(
			proxy.deleteAgent({ key: "editable-agent" }),
		).resolves.toMatchObject({
			data: { key: "editable-agent", deleted: true },
		});
		await expect(proxy.getAgentEditorOptions()).resolves.toMatchObject({
			data: { modes: [{ key: "PROXY", label: "ACP-PROXY" }] },
		});
		await expect(proxy.getModelOptions()).resolves.toMatchObject({
			data: { models: [{ key: "coder-model" }] },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.createAgent).toHaveBeenCalledWith({
			key: "editable-agent",
			definition: { key: "editable-agent", name: "Editable Agent" },
		});
		expect(mockApiClient.deleteAgent).toHaveBeenCalledWith({
			key: "editable-agent",
		});
		expect(mockApiClient.getAgentEditorOptions).toHaveBeenCalledTimes(1);
		expect(mockApiClient.getModelOptions).toHaveBeenCalledWith();
	});

	it("routes submit requests over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.submitTool.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { accepted: true },
		});
		mockApiClient.submitAwaiting.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { accepted: true },
		});

		await expect(
			proxy.submitTool({
				runId: "run_1",
				agentKey: "demo-agent",
				toolId: "tool_1",
				params: { city: "beijing" },
			}),
		).resolves.toMatchObject({ data: { accepted: true } });
		await expect(
			proxy.submitAwaiting({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo-agent",
				awaitingId: "await_1",
				submitId: "submit_1",
				params: [],
			}),
		).resolves.toMatchObject({ data: { accepted: true } });

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.submitTool).toHaveBeenCalledWith({
			runId: "run_1",
			agentKey: "demo-agent",
			toolId: "tool_1",
			params: { city: "beijing" },
		});
		expect(mockApiClient.submitAwaiting).toHaveBeenCalledWith({
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo-agent",
			awaitingId: "await_1",
			submitId: "submit_1",
			params: [],
		});
	});

	it("routes interrupt and steer over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.interruptChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { stopped: true },
		});
		mockApiClient.steerChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { steered: true },
		});

		const interruptParams = {
			requestId: "req_1",
			chatId: "chat_1",
			message: "stop",
		};
		const steerParams = {
			requestId: "req_2",
			chatId: "chat_1",
			message: "change direction",
		};

		await expect(proxy.interruptChat(interruptParams)).resolves.toMatchObject({
			data: { stopped: true },
		});
		await expect(proxy.steerChat(steerParams)).resolves.toMatchObject({
			data: { steered: true },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.interruptChat).toHaveBeenCalledWith(interruptParams);
		expect(mockApiClient.steerChat).toHaveBeenCalledWith(steerParams);
	});

	it("routes background commands over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.rememberChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { remembered: true },
		});
		mockApiClient.learnChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { learned: true },
		});
		mockApiClient.compactChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { compacted: true },
		});

		const commandParams = {
			requestId: "req_bg",
			chatId: "chat_1",
		};

		await expect(proxy.rememberChat(commandParams)).resolves.toMatchObject({
			data: { remembered: true },
		});
		await expect(proxy.learnChat(commandParams)).resolves.toMatchObject({
			data: { learned: true },
		});
		await expect(proxy.compactChat(commandParams)).resolves.toMatchObject({
			data: { compacted: true },
		});

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.rememberChat).toHaveBeenCalledWith(commandParams);
		expect(mockApiClient.learnChat).toHaveBeenCalledWith(commandParams);
		expect(mockApiClient.compactChat).toHaveBeenCalledWith(commandParams);
	});

	it("routes archive requests over http when sse mode is selected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "sse");
		mockApiClient.archiveChats.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { results: [{ chatId: "chat_1", success: true }] },
		});
		mockApiClient.getArchives.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { total: 0, items: [] },
		});
		mockApiClient.getArchive.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", events: [] },
		});
		mockApiClient.searchArchives.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { query: "old", count: 0, results: [] },
		});
		mockApiClient.deleteArchive.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", deleted: true },
		});

		await proxy.archiveChats({ chatIds: ["chat_1"] });
		await proxy.getArchives({ agentKey: "agent_a", limit: 10 });
		await proxy.getArchive("chat_1", true);
		await proxy.searchArchives({ query: "old", limit: 6 });
		await proxy.deleteArchive({ chatId: "chat_1" });

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.archiveChats).toHaveBeenCalledWith({
			chatIds: ["chat_1"],
		});
		expect(mockApiClient.getArchives).toHaveBeenCalledWith({
			agentKey: "agent_a",
			limit: 10,
		});
		expect(mockApiClient.getArchive).toHaveBeenCalledWith("chat_1", true);
		expect(mockApiClient.searchArchives).toHaveBeenCalledWith({
			query: "old",
			limit: 6,
		});
		expect(mockApiClient.deleteArchive).toHaveBeenCalledWith({
			chatId: "chat_1",
		});
	});
});
