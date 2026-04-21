const mockWsClientInstances: Array<{
	disconnect: jest.Mock;
	updateOptions: jest.Mock;
	options: unknown;
}> = [];

const mockWsClientCtor = jest.fn().mockImplementation((options: unknown) => {
	const instance = {
		disconnect: jest.fn(),
		updateOptions: jest.fn(),
		options,
	};
	mockWsClientInstances.push(instance);
	return instance;
});

jest.mock("@/features/transport/lib/wsClient", () => ({
	WsClient: mockWsClientCtor,
}));

describe("wsClientSingleton", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();
		mockWsClientCtor.mockClear();
		mockWsClientInstances.length = 0;
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it("destroys the singleton on the next tick when not reused", async () => {
		const singleton = await import("./wsClientSingleton");

		const client = singleton.initWsClient({ accessToken: "token_1" });
		expect(client).toBeTruthy();

		singleton.scheduleDestroyWsClient();
		jest.runOnlyPendingTimers();

		expect(mockWsClientInstances[0]?.disconnect).toHaveBeenCalledTimes(1);
		expect(singleton.getWsClient()).toBeNull();
	});

	it("cancels a scheduled destroy when the client is re-initialized immediately", async () => {
		const singleton = await import("./wsClientSingleton");

		const firstClient = singleton.initWsClient({ accessToken: "token_1" });
		singleton.scheduleDestroyWsClient();

		const secondClient = singleton.initWsClient({ accessToken: "token_1" });
		jest.runOnlyPendingTimers();

		expect(secondClient).toBe(firstClient);
		expect(mockWsClientInstances[0]?.disconnect).not.toHaveBeenCalled();
		expect(singleton.getWsClient()).toBe(firstClient);
	});

	it("cancels a scheduled destroy when another caller reads the shared client", async () => {
		const singleton = await import("./wsClientSingleton");

		const client = singleton.initWsClient({ accessToken: "token_1" });
		singleton.scheduleDestroyWsClient();

		expect(singleton.getWsClient()).toBe(client);
		jest.runOnlyPendingTimers();

		expect(mockWsClientInstances[0]?.disconnect).not.toHaveBeenCalled();
		expect(singleton.getWsClient()).toBe(client);
	});
});
