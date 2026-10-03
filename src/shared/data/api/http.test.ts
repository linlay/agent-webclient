import { ACCESS_TOKEN_STORAGE_KEY } from "@/shared/data/auth/accessTokenStorage";
import { APP_AUTH_RESPONSE_TYPE } from "@/shared/data/auth/appAuth";
import { getAdminAgents, getAgents } from "@/shared/data/api/requests/agents";
import { createRequestId, setAccessToken } from "@/shared/data/api/http";
import { getAdminRegistries } from "@/shared/data/api/requests/admin";
import { setupRequestHarness, installWindow, installStandaloneLocalStorage } from "@/shared/data/__testUtils__/requestHarness";

describe("http request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("creates compact request ids from second-plus-counter", () => {
    const second = 1_776_474_697;
    const baseMs = second * 1000;
    jest.spyOn(Date, "now").mockReturnValue(baseMs + 581);

    expect(createRequestId("req")).toBe(`req_${(second * 1000).toString(36)}`);
    expect(createRequestId("upload")).toBe(
      `upload_${(second * 1000 + 1).toString(36)}`,
    );
  });

  it("normalizes request id prefixes before generation", () => {
    jest.spyOn(Date, "now").mockReturnValue(2_500);

    expect(createRequestId(" req__ ")).toBe(`req_${(2_000).toString(36)}`);
  });

  it("keeps a non-JSON proxy failure readable to the user", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 504,
      text: async () =>
        "Error occurred while trying to proxy: 127.0.0.1:11948/api/admin/agents/skills/import",
    });

    await expect(getAdminAgents()).rejects.toMatchObject({
      status: 504,
      message:
        "Error occurred while trying to proxy: 127.0.0.1:11948/api/admin/agents/skills/import",
    });
  });

  it("injects a bridge token into app mode api requests", async () => {
    installWindow({ storedToken: "bridge-token-1" });

    await getAgents();

    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer bridge-token-1",
    });
  });

  it("injects a stored standalone token into the first registry request", async () => {
    installStandaloneLocalStorage({
      [ACCESS_TOKEN_STORAGE_KEY]: "stored-browser-token",
    });

    await getAdminRegistries();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/registries",
    );
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer stored-browser-token",
    });
  });

  it("prefers an explicit token over the stored standalone token", async () => {
    installStandaloneLocalStorage({
      [ACCESS_TOKEN_STORAGE_KEY]: "stored-browser-token",
    });
    setAccessToken("manual-token");

    await getAdminRegistries();

    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer manual-token",
    });
  });

  it("requests a bridge token when app mode starts without one", async () => {
    const { parent, dispatchMessage } = installWindow();

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: APP_AUTH_RESPONSE_TYPE,
            requestId: payload.requestId,
            token: "bridge-token-2",
            desktopAuthContext: "desktop-auth-current",
          },
        } as MessageEvent);
      });
    });

    await getAgents();

    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "getAccessToken",
        reason: "missing",
      }),
      "*",
    );
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer bridge-token-2",
    });
  });

  it("refreshes the bridge token once after a 401 response", async () => {
    const { parent, dispatchMessage } = installWindow({
      storedToken: "stale-token",
    });

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: APP_AUTH_RESPONSE_TYPE,
            requestId: payload.requestId,
            token: "fresh-token",
            desktopAuthContext: "desktop-auth-current",
          },
        } as MessageEvent);
      });
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({ code: 401, msg: "expired", data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: 0, msg: "ok", data: [] }),
      });

    await expect(getAgents()).resolves.toMatchObject({
      status: 200,
      data: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer stale-token",
    });
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer fresh-token",
    });
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refreshAccessToken",
        reason: "unauthorized",
      }),
      "*",
    );
  });

  it("keeps regular endpoints on strict ApiResponse parsing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ agents: [] }),
    });

    await expect(getAgents()).rejects.toThrow(
      "Response is not ApiResponse shape",
    );
  });
});
