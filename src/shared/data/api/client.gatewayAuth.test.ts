import {
	ApiError,
	createQueryStream,
	downloadResource,
	setAccessToken,
	uploadFile,
} from "@/shared/data/api/client";
import {
	resetAuthCoordinatorForTests,
	setAuthCoordinatorNavigationForTests,
} from "@/shared/data/auth/authCoordinator";
import {
	initializeGatewaySession,
	resetGatewaySessionForTests,
} from "@/shared/data/auth/gatewaySession";

const runtime = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("API client backend authentication modes", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		resetAuthCoordinatorForTests();
		resetGatewaySessionForTests();
		setAccessToken("");
	});

	afterEach(() => {
		global.fetch = originalFetch;
		delete runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
		resetAuthCoordinatorForTests();
		resetGatewaySessionForTests();
		setAccessToken("");
	});

	it("uses cookies and CSRF without Authorization for gateway uploads", async () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					code: 0,
					data: {
						authenticated: false,
						tenant: { displayName: "Gateway" },
						csrfToken: "csrf-upload",
						auth: { mode: "local", loginUrl: "/login" },
						features: { upload: true },
					},
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({ code: 0, msg: "success", data: { accepted: true } }),
			);
		global.fetch = fetchMock as typeof fetch;
		await initializeGatewaySession();

		await uploadFile({
			file: new Blob(["hello"], { type: "text/plain" }),
			filename: "hello.txt",
			chatId: "chat-1",
		});

		const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(options.credentials).toBe("same-origin");
		expect(options.headers).toEqual(
			expect.objectContaining({ "X-CSRF-Token": "csrf-upload" }),
		);
		expect(options.headers).not.toHaveProperty("Authorization");
		expect(options.body).toBeInstanceOf(FormData);
	});

	it("routes a gateway SSE handshake 401 through the coordinator", async () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);
		global.fetch = jest.fn().mockResolvedValue(
			jsonResponse({ code: 401, msg: "Unauthorized" }, 401),
		) as typeof fetch;

		const response = await createQueryStream({
			requestId: "req-1",
			owner: { kind: "agent", agentKey: "public-agent" },
			message: "hello",
		});

		expect(response.status).toBe(401);
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	it("keeps platform download token 401 as an error without navigation", async () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "platform" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);
		setAccessToken("platform-token");
		const fetchMock = jest.fn().mockResolvedValue(
			jsonResponse({ error: "unauthorized" }, 401),
		);
		global.fetch = fetchMock as typeof fetch;

		await expect(downloadResource("/api/resource?file=chat/a.txt")).rejects.toBeInstanceOf(
			ApiError,
		);
		const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(options.headers).toEqual(
			expect.objectContaining({ Authorization: "Bearer platform-token" }),
		);
		expect(navigate).not.toHaveBeenCalled();
	});
});
