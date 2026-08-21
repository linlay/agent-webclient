import { requestPlatformData } from "@/features/transport/lib/platformDataRequestTransport";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import { getWsClient } from "@/features/transport/lib/wsClientSingleton";
import { isDesktopAppMode } from "@/shared/utils/routing";

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: jest.fn(),
}));

jest.mock("@/features/transport/lib/wsClientSingleton", () => ({
  getWsClient: jest.fn(),
}));

jest.mock("@/shared/utils/routing", () => ({
  isDesktopAppMode: jest.fn(),
}));

describe("platformDataRequestTransport", () => {
  const ensureStandaloneWsClientMock = ensureStandaloneWsClient as jest.MockedFunction<
    typeof ensureStandaloneWsClient
  >;
  const getWsClientMock = getWsClient as jest.MockedFunction<typeof getWsClient>;
  const isDesktopAppModeMock = isDesktopAppMode as jest.MockedFunction<
    typeof isDesktopAppMode
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    isDesktopAppModeMock.mockReturnValue(false);
  });

  it("uses the single Standalone client and sends a strict WS request", async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      request: jest.fn().mockResolvedValue({
        status: 200,
        code: 0,
        msg: "success",
        data: [{ key: "agent-1" }],
      }),
    };
    ensureStandaloneWsClientMock.mockResolvedValue(client as never);

    await expect(requestPlatformData("/api/agents", { includeChats: 5 }))
      .resolves.toMatchObject({ data: [{ key: "agent-1" }] });

    expect(ensureStandaloneWsClientMock).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith({
      type: "/api/agents",
      payload: { includeChats: 5 },
    });
  });

  it("reuses the Desktop Broker client without initializing Standalone WS", async () => {
    isDesktopAppModeMock.mockReturnValue(true);
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      request: jest.fn().mockResolvedValue({
        status: 200,
        code: 0,
        msg: "success",
        data: { key: "agent-1" },
      }),
    };
    getWsClientMock.mockReturnValue(client as never);

    await requestPlatformData("/api/agent", { agentKey: "agent-1" });

    expect(ensureStandaloneWsClientMock).not.toHaveBeenCalled();
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith({
      type: "/api/agent",
      payload: { agentKey: "agent-1" },
    });
  });

  it("fails in Desktop mode when the Broker client is unavailable", async () => {
    isDesktopAppModeMock.mockReturnValue(true);
    getWsClientMock.mockReturnValue(null);

    await expect(requestPlatformData("/api/agents", undefined)).rejects.toMatchObject({
      name: "WsClientDisconnectedError",
      code: "WS_DISCONNECTED",
    });

    expect(ensureStandaloneWsClientMock).not.toHaveBeenCalled();
  });

  it("propagates connection failures without an alternate transport", async () => {
    const connectionError = new Error("connect failed");
    const client = {
      connect: jest.fn().mockRejectedValue(connectionError),
      request: jest.fn(),
    };
    ensureStandaloneWsClientMock.mockResolvedValue(client as never);

    await expect(requestPlatformData("/api/agents", undefined)).rejects.toBe(
      connectionError,
    );
    expect(client.request).not.toHaveBeenCalled();
  });

  it("propagates request failures without an alternate transport", async () => {
    const requestError = Object.assign(new Error("WebSocket request timeout"), {
      code: "WS_REQUEST_TIMEOUT",
    });
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      request: jest.fn().mockRejectedValue(requestError),
    };
    ensureStandaloneWsClientMock.mockResolvedValue(client as never);

    await expect(requestPlatformData("/api/agents", undefined)).rejects.toBe(
      requestError,
    );
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});
