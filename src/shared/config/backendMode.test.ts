import {
	getBackendMode,
	isGatewayBackendMode,
	isPlatformBackendMode,
} from "@/shared/config/backendMode";

const runtime = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("backendMode", () => {
	afterEach(() => {
		delete runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
	});

	it("defaults to platform for backwards compatibility", () => {
		expect(getBackendMode()).toBe("platform");
		expect(isPlatformBackendMode()).toBe(true);
	});

	it("selects gateway explicitly", () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
		expect(getBackendMode()).toBe("gateway");
		expect(isGatewayBackendMode()).toBe(true);
	});

	it("rejects unknown modes instead of guessing", () => {
		runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "auto" };
		expect(() => getBackendMode()).toThrow("Invalid BACKEND_MODE");
	});
});
