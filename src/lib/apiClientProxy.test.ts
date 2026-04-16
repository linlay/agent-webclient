const mockGetWsClient = jest.fn();

jest.mock("./apiClient", () => {
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
		downloadResource: jest.fn(),
		ensureAccessToken: jest.fn(),
		getAgent: jest.fn(),
		getAgents: jest.fn(),
		getChat: jest.fn(),
		getChats: jest.fn(),
		getCurrentAccessToken: jest.fn(),
		getResourceText: jest.fn(),
		getSkills: jest.fn(),
		getTeams: jest.fn(),
		getTool: jest.fn(),
		getTools: jest.fn(),
		getViewport: jest.fn(),
		interruptChat: jest.fn(),
		learnChat: jest.fn(),
		rememberChat: jest.fn(),
		setAccessToken: jest.fn(),
		steerChat: jest.fn(),
		submitAwaiting: jest.fn(),
		submitTool: jest.fn(),
		uploadFile: jest.fn(),
	};
});
jest.mock("./wsClientSingleton", () => ({
	getWsClient: () => mockGetWsClient(),
}));

let mockApiClient: {
	ApiError: new (
		message: string,
		options?: { status?: number | null; code?: number | string | null; data?: unknown },
	) => Error;
	buildResourceUrl: jest.Mock;
	createQueryStream: jest.Mock;
	downloadResource: jest.Mock;
	ensureAccessToken: jest.Mock;
	getAgent: jest.Mock;
	getAgents: jest.Mock;
	getChat: jest.Mock;
	getChats: jest.Mock;
	getCurrentAccessToken: jest.Mock;
	getResourceText: jest.Mock;
	getSkills: jest.Mock;
	getTeams: jest.Mock;
	getTool: jest.Mock;
	getTools: jest.Mock;
	getViewport: jest.Mock;
	interruptChat: jest.Mock;
	learnChat: jest.Mock;
	rememberChat: jest.Mock;
	setAccessToken: jest.Mock;
	steerChat: jest.Mock;
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
		mockApiClient = jest.requireMock("./apiClient") as typeof mockApiClient;
		({
			WsClientDisconnectedError,
			WsClientRequestTimeoutError,
		} = jest.requireActual("./wsClient") as typeof import("./wsClient"));
		Object.values(mockApiClient).forEach((value) => {
			if (typeof value === "function" && "mockReset" in value) {
				(value as jest.Mock).mockClear();
			}
		});
	});

	it("routes request/response calls over ws when connected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

		const request = jest.fn().mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: [],
		});
		mockGetWsClient.mockReturnValue({
			getStatus: () => "connected",
			request,
		});

		await proxy.getAgents();

		expect(request).toHaveBeenCalledWith({
			type: "/api/agents",
			payload: undefined,
		});
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("falls back to http when ws mode is selected but disconnected", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");
		mockGetWsClient.mockReturnValue({
			getStatus: () => "disconnected",
		});
		mockApiClient.getAgents.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: ["http"],
		});

		await expect(proxy.getAgents()).resolves.toMatchObject({
			data: ["http"],
		});
		expect(mockApiClient.getAgents).toHaveBeenCalledTimes(1);
	});

	it("falls back to http for read-only requests when ws transport fails", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const proxy = await import("./apiClientProxy");
			proxy.setTransportModeProvider(() => "ws");

			const request = jest
				.fn()
				.mockRejectedValue(
					new WsClientRequestTimeoutError(
						"WebSocket request timeout: /api/agents",
					),
				);
			mockGetWsClient.mockReturnValue({
				getStatus: () => "connected",
				request,
			});
			mockApiClient.getAgents.mockResolvedValue({
				status: 200,
				code: 0,
				msg: "ok",
				data: ["http-fallback"],
			});

			await expect(proxy.getAgents()).resolves.toMatchObject({
				data: ["http-fallback"],
			});

			expect(mockApiClient.getAgents).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				"[apiClientProxy] WS request failed for /api/agents, falling back to HTTP:",
				expect.any(WsClientRequestTimeoutError),
			);
		} finally {
			warnSpy.mockRestore();
		}
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
			getStatus: () => "connected",
			request,
		});

		await expect(proxy.getAgents()).rejects.toBe(error);
		expect(mockApiClient.getAgents).not.toHaveBeenCalled();
	});

	it("does not fall back for side-effect requests when ws transport fails", async () => {
		const proxy = await import("./apiClientProxy");
		proxy.setTransportModeProvider(() => "ws");

		const error = new WsClientDisconnectedError();
		const request = jest.fn().mockRejectedValue(error);
		mockGetWsClient.mockReturnValue({
			getStatus: () => "connected",
			request,
		});

		await expect(
			proxy.interruptChat({
				requestId: "req_1",
				chatId: "chat_1",
				message: "stop",
			}),
		).rejects.toBe(error);
		expect(mockApiClient.interruptChat).not.toHaveBeenCalled();
	});

	it("keeps upload/download/resource helpers on the original http exports", async () => {
		const proxy = await import("./apiClientProxy");

		expect(proxy.buildResourceUrl("demo.txt")).toBe("/api/resource?file=demo.txt");
		expect(proxy.uploadFile).toBe(mockApiClient.uploadFile);
		expect(proxy.downloadResource).toBe(mockApiClient.downloadResource);
	});
});
