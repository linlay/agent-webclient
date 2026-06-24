import { createTransportClient } from "@/features/transport/lib/transportClient";
import {
	ensureAccessToken,
	getCurrentAccessToken,
} from "@/shared/api/apiClient";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
} from "@/features/transport/lib/wsClientSingleton";
import { WsClientDisconnectedError } from "@/features/transport/lib/wsClient";
import { isAppMode } from "@/shared/utils/routing";

jest.mock("@/shared/api/apiClient", () => ({
	ensureAccessToken: jest.fn(),
	getCurrentAccessToken: jest.fn(),
}));

jest.mock("./wsClientSingleton", () => ({
	getWsClient: jest.fn(),
	getWsClientAccessToken: jest.fn(),
	initWsClient: jest.fn(),
}));

jest.mock("@/shared/utils/routing", () => ({
	isAppMode: jest.fn(),
}));

describe("TransportClient", () => {
	const ensureAccessTokenMock = ensureAccessToken as jest.MockedFunction<typeof ensureAccessToken>;
	const getCurrentAccessTokenMock = getCurrentAccessToken as jest.MockedFunction<typeof getCurrentAccessToken>;
	const getWsClientMock = getWsClient as jest.MockedFunction<typeof getWsClient>;
	const getWsClientAccessTokenMock = getWsClientAccessToken as jest.MockedFunction<typeof getWsClientAccessToken>;
	const initWsClientMock = initWsClient as jest.MockedFunction<typeof initWsClient>;
	const isAppModeMock = isAppMode as jest.MockedFunction<typeof isAppMode>;

	beforeEach(() => {
		ensureAccessTokenMock.mockReset();
		getCurrentAccessTokenMock.mockReset();
		getWsClientMock.mockReset();
		getWsClientAccessTokenMock.mockReset();
		initWsClientMock.mockReset();
		isAppModeMock.mockReset();
		ensureAccessTokenMock.mockResolvedValue("");
		getCurrentAccessTokenMock.mockReturnValue("");
		getWsClientAccessTokenMock.mockReturnValue("");
		isAppModeMock.mockReturnValue(false);
	});

	it("uses the HTTP fallback when the active mode is not ws", async () => {
		const fallback = jest.fn().mockResolvedValue({ code: 0, data: "http" });
		const client = createTransportClient({ getMode: () => "sse" });

		await expect(
			client.request("/api/example", undefined, { fallback }),
		).resolves.toEqual({ code: 0, data: "http" });

		expect(fallback).toHaveBeenCalledTimes(1);
		expect(getWsClientMock).not.toHaveBeenCalled();
	});

	it("routes request/response calls through the active ws client", async () => {
		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest.fn().mockResolvedValue({ code: 0, data: "ws" });
		getWsClientMock.mockReturnValue({ connect, request } as never);
		const fallback = jest.fn().mockResolvedValue({ code: 0, data: "http" });
		const client = createTransportClient({ getMode: () => "ws" });

		await expect(
			client.request("/api/example", { id: "1" }, { fallback }),
		).resolves.toEqual({ code: 0, data: "ws" });

		expect(connect).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({
			type: "/api/example",
			payload: { id: "1" },
		});
		expect(fallback).not.toHaveBeenCalled();
	});

	it("creates an anonymous ws client for standalone requests without a token", async () => {
		let activeClient: { connect: jest.Mock; request: jest.Mock } | null = null;
		const wsClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			request: jest.fn().mockResolvedValue({ code: 0, data: "ws" }),
		};
		getWsClientMock.mockImplementation(() => activeClient as never);
		initWsClientMock.mockImplementation(() => {
			activeClient = wsClient;
			return wsClient as never;
		});
		const fallback = jest.fn().mockResolvedValue({ code: 0, data: "http" });
		const client = createTransportClient({ getMode: () => "ws" });

		await expect(
			client.request("/api/example", undefined, { fallback }),
		).resolves.toEqual({ code: 0, data: "ws" });

		expect(initWsClientMock).toHaveBeenCalledWith(
			expect.objectContaining({
				accessToken: "",
				allowAnonymous: true,
			}),
		);
		expect(wsClient.connect).toHaveBeenCalledTimes(1);
		expect(wsClient.request).toHaveBeenCalledTimes(1);
		expect(fallback).not.toHaveBeenCalled();
	});

	it("falls back when a ws request fails with a transport error", async () => {
		const connect = jest.fn().mockResolvedValue(undefined);
		const request = jest
			.fn()
			.mockRejectedValue(new WsClientDisconnectedError());
		getWsClientMock.mockReturnValue({ connect, request } as never);
		const fallback = jest.fn().mockResolvedValue({ code: 0, data: "http" });
		const client = createTransportClient({ getMode: () => "ws" });

		await expect(
			client.request("/api/example", undefined, { fallback }),
		).resolves.toEqual({ code: 0, data: "http" });

		expect(fallback).toHaveBeenCalledTimes(1);
	});

	it("does not fall back for transport errors when request fallback is disabled", async () => {
		const connect = jest.fn().mockResolvedValue(undefined);
		const requestError = new WsClientDisconnectedError();
		const request = jest.fn().mockRejectedValue(requestError);
		getWsClientMock.mockReturnValue({ connect, request } as never);
		const fallback = jest.fn().mockResolvedValue({ code: 0, data: "http" });
		const client = createTransportClient({ getMode: () => "ws" });

		await expect(
			client.request("/api/example", undefined, {
				fallback,
				fallbackOnRequestFailure: false,
			}),
		).rejects.toBe(requestError);

		expect(fallback).not.toHaveBeenCalled();
	});
});
