const mockWsClientInstances: Array<{
	disconnect: jest.Mock;
	dispose: jest.Mock;
	updateOptions: jest.Mock;
	options: unknown;
}> = [];

const mockWsClientCtor = jest.fn().mockImplementation((options: unknown) => {
	const instance = {
		disconnect: jest.fn(),
		dispose: jest.fn(),
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

		expect(mockWsClientInstances[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(singleton.getWsClient()).toBeNull();
	});

	it("cancels a scheduled destroy when the client is re-initialized immediately", async () => {
		const singleton = await import("./wsClientSingleton");

		const firstClient = singleton.initWsClient({ accessToken: "token_1" });
		singleton.scheduleDestroyWsClient();

		const secondClient = singleton.initWsClient({ accessToken: "token_1" });
		jest.runOnlyPendingTimers();

		expect(secondClient).toBe(firstClient);
		expect(mockWsClientInstances[0]?.dispose).not.toHaveBeenCalled();
		expect(singleton.getWsClient()).toBe(firstClient);
	});

	it("cancels a scheduled destroy when another caller reads the shared client", async () => {
		const singleton = await import("./wsClientSingleton");

		const client = singleton.initWsClient({ accessToken: "token_1" });
		singleton.scheduleDestroyWsClient();

		expect(singleton.getWsClient()).toBe(client);
		jest.runOnlyPendingTimers();

		expect(mockWsClientInstances[0]?.dispose).not.toHaveBeenCalled();
		expect(singleton.getWsClient()).toBe(client);
	});

	it("disposes the old singleton when the access token changes", async () => {
		const singleton = await import("./wsClientSingleton");

		const firstClient = singleton.initWsClient({ accessToken: "token_1" });
		const secondClient = singleton.initWsClient({ accessToken: "token_2" });

		expect(secondClient).not.toBe(firstClient);
		expect(mockWsClientInstances[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(mockWsClientInstances[1]?.dispose).not.toHaveBeenCalled();
		expect(singleton.getWsClient()).toBe(secondClient);
		expect(singleton.getWsClientAccessToken()).toBe("token_2");
	});

	it("keeps the tracked singleton token in sync when the client refreshes it", async () => {
		const singleton = await import("./wsClientSingleton");
		const onAccessTokenChange = jest.fn();

		singleton.initWsClient({
			accessToken: "token_1",
			onAccessTokenChange,
		});

		const options = mockWsClientInstances[0]?.options as {
			onAccessTokenChange?: (accessToken: string) => void;
		};
		options.onAccessTokenChange?.("token_2");

		expect(singleton.getWsClientAccessToken()).toBe("token_2");
		expect(onAccessTokenChange).toHaveBeenCalledWith("token_2");
	});
});
