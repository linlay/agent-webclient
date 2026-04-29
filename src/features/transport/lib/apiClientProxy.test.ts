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
		buildResourceUrl: jest.fn((file: string) => `/api/resource?file=${file}`),
		createQueryStream: jest.fn(),
		deleteChat: jest.fn(),
		downloadChatExport: jest.fn(),
		downloadResource: jest.fn(),
		ensureAccessToken: jest.fn(),
		getAgent: jest.fn(),
		getAgents: jest.fn(),
		getChat: jest.fn(),
		getChats: jest.fn(),
		getCurrentAccessToken: jest.fn(),
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
		interruptChat: jest.fn(),
		learnChat: jest.fn(),
		markChatRead: jest.fn(),
		rememberChat: jest.fn(),
		searchGlobal: jest.fn(),
		setAccessToken: jest.fn(),
		steerChat: jest.fn(),
		submitFeedback: jest.fn(),
		submitAwaiting: jest.fn(),
		submitTool: jest.fn(),
	uploadFile: jest.fn(),
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
	buildResourceUrl: jest.Mock;
	createQueryStream: jest.Mock;
	deleteChat: jest.Mock;
	downloadChatExport: jest.Mock;
	downloadResource: jest.Mock;
	ensureAccessToken: jest.Mock;
	getAgent: jest.Mock;
	getAgents: jest.Mock;
	getChat: jest.Mock;
	getChats: jest.Mock;
	getCurrentAccessToken: jest.Mock;
	normalizeChatSummariesPayload: jest.Mock;
	getResourceText: jest.Mock;
	getSkills: jest.Mock;
	getTeams: jest.Mock;
	getTool: jest.Mock;
	getTools: jest.Mock;
	getViewport: jest.Mock;
	interruptChat: jest.Mock;
	learnChat: jest.Mock;
	markChatRead: jest.Mock;
	rememberChat: jest.Mock;
	searchGlobal: jest.Mock;
	setAccessToken: jest.Mock;
	steerChat: jest.Mock;
	submitFeedback: jest.Mock;
	submitAwaiting: jest.Mock;
	submitTool: jest.Mock;
	uploadFile: jest.Mock;
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

		expect(mockInitWsClient).toHaveBeenCalledWith({ accessToken: "token_1" });
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

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["http-agents"],
		});
		expect(mockApiClient.getAgents).toHaveBeenCalledTimes(1);
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

		await expect(proxy.getChats()).resolves.toMatchObject({
			data: [{ chatId: "chat_http", hasPendingAwaiting: true }],
		});
		expect(mockApiClient.getChats).toHaveBeenCalledTimes(1);
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

		await expect(proxy.getChats()).resolves.toMatchObject({
			data: [
				{
					chatId: "chat_1",
					hasPendingAwaiting: true,
				},
			],
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
		await proxy.searchGlobal({ query: "needle", agentKey: "agent_a", limit: 5 });
		await proxy.markChatRead({ agentKey: "agent_a" });

		expect(request).toHaveBeenNthCalledWith(1, {
			type: "/api/feedback",
			payload: { chatId: "chat_1", runId: "run_1", type: "thumbs_down" },
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			type: "/api/chat-delete",
			payload: { chatId: "chat_1" },
		});
		expect(request).toHaveBeenNthCalledWith(3, {
			type: "/api/search",
			payload: { query: "needle", agentKey: "agent_a", limit: 5 },
		});
		expect(request).toHaveBeenNthCalledWith(4, {
			type: "/api/read",
			payload: { agentKey: "agent_a" },
		});
		expect(mockApiClient.submitFeedback).not.toHaveBeenCalled();
		expect(mockApiClient.deleteChat).not.toHaveBeenCalled();
		expect(mockApiClient.searchGlobal).not.toHaveBeenCalled();
	});

	it("does not fall back to http when ws request times out", async () => {
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

		await expect(proxy.getAgents()).rejects.toBe(error);
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
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
				toolId: "tool_1",
				params: { city: "beijing" },
			}),
		).resolves.toMatchObject({ data: { accepted: true } });
		await expect(
			proxy.submitAwaiting({
				runId: "run_1",
				awaitingId: "await_1",
				params: [],
			}),
		).resolves.toMatchObject({ data: { accepted: true } });

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.submitTool).toHaveBeenCalledWith({
			runId: "run_1",
			toolId: "tool_1",
			params: { city: "beijing" },
		});
		expect(mockApiClient.submitAwaiting).toHaveBeenCalledWith({
			runId: "run_1",
			awaitingId: "await_1",
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

		expect(mockInitWsClient).not.toHaveBeenCalled();
		expect(mockApiClient.rememberChat).toHaveBeenCalledWith(commandParams);
		expect(mockApiClient.learnChat).toHaveBeenCalledWith(commandParams);
	});
});
