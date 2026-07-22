import {
	buildGatewayLoginUrl,
	handleFinalUnauthorized,
	resetAuthCoordinatorForTests,
	sanitizeRelativeReturnTo,
	setAuthCoordinatorNavigationForTests,
} from "@/shared/data/auth/authCoordinator";

const runtime = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("authCoordinator", () => {
	const originalWindow = global.window;
	const originalCustomEvent = global.CustomEvent;

	beforeEach(() => {
		resetAuthCoordinatorForTests();
		Object.defineProperty(global, "CustomEvent", {
			configurable: true,
			value: class<T> {
				type: string;
				detail: T;
				constructor(type: string, init?: { detail?: T }) {
					this.type = type;
					this.detail = init?.detail as T;
				}
			},
		});
		Object.defineProperty(global, "window", {
			configurable: true,
			value: {
				location: {
					origin: "https://agent.example.com",
					pathname: "/agent/public-key",
					search: "?chat=one",
					hash: "#latest",
					assign: jest.fn(),
				},
				dispatchEvent: jest.fn(),
			},
		});
	});

	afterEach(() => {
		resetAuthCoordinatorForTests();
		delete runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
		Object.defineProperty(global, "window", {
			configurable: true,
			value: originalWindow,
		});
		Object.defineProperty(global, "CustomEvent", {
			configurable: true,
			value: originalCustomEvent,
		});
	});

	it("rejects schemes, protocol-relative routes and foreign login URLs", () => {
		expect(sanitizeRelativeReturnTo("//evil.example/path")).toBe("/");
		expect(sanitizeRelativeReturnTo("https://evil.example/path")).toBe("/");
		expect(sanitizeRelativeReturnTo("/safe?q=1#two")).toBe("/safe?q=1#two");
		expect(buildGatewayLoginUrl("https://evil.example/login", "/safe")).toBe(
			"/auth/login?return_to=%2Fsafe",
		);
	});

	it("turns a mixed burst of gateway 401s into one navigation", () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);

		expect(handleFinalUnauthorized("json")).toBe(true);
		expect(handleFinalUnauthorized("sse")).toBe(false);
		expect(handleFinalUnauthorized("ws")).toBe(false);
		expect(handleFinalUnauthorized("download")).toBe(false);

		expect(navigate).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledWith(
			"/auth/login?return_to=%2Fagent%2Fpublic-key%3Fchat%3Done%23latest",
		);
	});

	it("never navigates for a platform token 401", () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "platform" };
		const navigate = jest.fn();
		setAuthCoordinatorNavigationForTests(navigate);
		for (const source of ["json", "sse", "ws", "download"] as const) {
			expect(handleFinalUnauthorized(source)).toBe(false);
		}
		expect(navigate).not.toHaveBeenCalled();
	});
});
