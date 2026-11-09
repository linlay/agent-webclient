import { getVoiceCapabilities } from "./voice";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("voice capabilities", () => {
  const { fetchMock } = setupRequestHarness();
  it("reads the ordinary API envelope, including disabled state and configured voices", async () => {
    const data = { enabled: false, version: 2, websocketPath: "/api/voice/ws", voices: [{ id: "voice", label: "Voice" }] };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ code: 0, msg: "ok", data }) });
    await expect(getVoiceCapabilities()).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/capabilities", expect.anything());
  });
  it("rejects the retired bare response instead of falling back", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"enabled":true}' });
    await expect(getVoiceCapabilities()).rejects.toThrow("ApiResponse");
  });
});
