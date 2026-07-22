import {
	getGatewaySession,
	initializeGatewaySession,
	parseGatewaySession,
	resetGatewaySessionForTests,
} from "@/shared/data/auth/gatewaySession";

const runtime = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("gatewaySession", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		resetGatewaySessionForTests();
	});

	afterEach(() => {
		global.fetch = originalFetch;
		delete runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
	});

	it("parses display-only tenant data and local login metadata", () => {
		const session = parseGatewaySession({
			code: 0,
			data: {
				authenticated: false,
				tenant: {
					tenantId: "must-not-be-consumed",
					displayName: "ZenMind",
					logoUrl: "/logo.svg",
				},
				csrfToken: "csrf-1",
				auth: {
					mode: "local",
					loginUrl: "/login",
					logoutUrl: "/api/gateway/logout",
				},
				features: { upload: true, ignored: "yes" },
			},
		});

		expect(session).toEqual({
			authenticated: false,
			user: null,
			tenant: { displayName: "ZenMind", logoUrl: "/logo.svg" },
			csrfToken: "csrf-1",
			auth: {
				mode: "local",
				loginUrl: "/login",
				logoutUrl: "/api/gateway/logout",
			},
			features: { upload: true },
		});
		expect(session.tenant).not.toHaveProperty("tenantId");
	});

	it("single-flights anonymous bootstrap and sends same-origin credentials", async () => {
		const fetchMock = jest.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: 0,
					msg: "success",
					data: {
						authenticated: false,
						user: null,
						tenant: { displayName: "Public" },
						csrfToken: "csrf-anon",
						auth: { mode: "sso", loginUrl: "/auth/login" },
						features: {},
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		global.fetch = fetchMock as typeof fetch;

		const [first, second] = await Promise.all([
			initializeGatewaySession(),
			initializeGatewaySession(),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/gateway/session",
			expect.objectContaining({ credentials: "same-origin" }),
		);
		expect(first?.authenticated).toBe(false);
		expect(second).toBe(first);
		expect(getGatewaySession()?.csrfToken).toBe("csrf-anon");
	});
});
