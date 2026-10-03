import { getVoiceCapabilitiesFlexible, getVoiceVoicesFlexible } from "@/shared/data/api/requests/voice";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("voice response compatibility", () => {
  const { fetchMock } = setupRequestHarness();

  it.each([
    {
      name: "capabilities from ApiResponse",
      request: getVoiceCapabilitiesFlexible,
      wrapped: true,
      data: { websocketPath: "/api/voice/ws", asr: { configured: true } },
    },
    {
      name: "capabilities from bare JSON",
      request: getVoiceCapabilitiesFlexible,
      wrapped: false,
      data: { websocketPath: "/api/voice/ws", asr: { defaults: { sampleRate: 16000 } } },
    },
    {
      name: "voices from ApiResponse",
      request: getVoiceVoicesFlexible,
      wrapped: true,
      data: { defaultVoice: "jarvis", voices: [{ id: "jarvis", displayName: "Jarvis" }] },
    },
    {
      name: "voices from bare JSON",
      request: getVoiceVoicesFlexible,
      wrapped: false,
      data: { defaultVoice: "jarvis", voices: [{ id: "jarvis", displayName: "Jarvis" }] },
    },
  ])("parses $name", async ({ request, wrapped, data }) => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(wrapped ? { code: 0, msg: "ok", data } : data),
    });
    await expect(request()).resolves.toEqual(data);
  });
});
