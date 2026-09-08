import { canUseStandaloneFileActions, getStandaloneFileCapabilities, requestStandaloneFileAction } from "./standaloneFileActions";
import { isAppMode } from "@/shared/utils/routing";
jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn() }));

describe("standalone file action client", () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const capabilities = { token: "a".repeat(64), platform: "darwin" as const, maxBytes: 1024 };
  beforeEach(() => {
    (globalThis as any).window = { location: { hostname: "localhost" } };
    jest.mocked(isAppMode).mockReturnValue(false);
    globalThis.fetch = fetchMock;
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true, available: true, ...capabilities }) });
  });
  afterEach(() => {
    (globalThis as any).window = originalWindow;
    globalThis.fetch = originalFetch;
  });

  it("gets local capabilities without going through Desktop or sending API credentials", async () => {
    expect(canUseStandaloneFileActions()).toBe(true);
    await expect(getStandaloneFileCapabilities()).resolves.toEqual(capabilities);
    expect(fetchMock).toHaveBeenCalledWith("/__webclient_local__/files", expect.objectContaining({
      headers: { "X-Webclient-Local": "1" }, credentials: "same-origin", cache: "no-store",
    }));
  });

  it("does not contact a local service in Desktop or from a remote browser", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    await expect(getStandaloneFileCapabilities()).resolves.toBeNull();
    jest.mocked(isAppMode).mockReturnValue(false);
    (globalThis as any).window.location.hostname = "example.com";
    await expect(getStandaloneFileCapabilities()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an old server's HTML fallback or network failure as unavailable", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("HTML"); } });
    await expect(getStandaloneFileCapabilities()).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(getStandaloneFileCapabilities()).resolves.toBeNull();
  });

  it("posts exact bytes with the action, encoded filename and local token", async () => {
    const blob = new Blob(["file bytes"], { type: "application/pdf" });
    await requestStandaloneFileAction("open-default", "客户.pdf", blob, capabilities);
    expect(fetchMock).toHaveBeenCalledWith("/__webclient_local__/files", expect.objectContaining({
      method: "POST", body: blob,
      headers: {
        "Content-Type": "application/octet-stream", "X-Webclient-Local": "1",
        "X-Webclient-Token": capabilities.token, "X-File-Action": "open-default",
        "X-File-Name": encodeURIComponent("客户.pdf"),
      },
    }));
  });

  it("rejects oversized files before uploading and surfaces service failures", async () => {
    await expect(requestStandaloneFileAction("reveal", "big.pdf", new Blob([new Uint8Array(1025)]), capabilities)).rejects.toThrow("大小限制");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, code: "unsupported_type" }) });
    await expect(requestStandaloneFileAction("open-default", "script.command", new Blob(["bytes"]), capabilities)).rejects.toThrow("文件类型");
  });
});
