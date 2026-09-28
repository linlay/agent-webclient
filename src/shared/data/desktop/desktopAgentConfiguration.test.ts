/** @jest-environment jsdom */
import { openDesktopAgentConfiguration, DESKTOP_OPEN_AGENT_CONFIGURATION_REQUEST_TYPE, DESKTOP_OPEN_AGENT_CONFIGURATION_RESPONSE_TYPE } from "./desktopAgentConfiguration";
import { hasDesktopHostBridge, isDesktopHostMessageEvent, postDesktopHostMessage } from "./desktopHostBridge";
jest.mock("./desktopHostBridge", () => ({
  hasDesktopHostBridge: jest.fn(),
  isDesktopHostMessageEvent: jest.fn(),
  postDesktopHostMessage: jest.fn(),
}));
const post = jest.mocked(postDesktopHostMessage);
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.mocked(hasDesktopHostBridge).mockReturnValue(true);
  jest.mocked(isDesktopHostMessageEvent).mockImplementation(event => event.source === window);
  post.mockReturnValue(true);
});
afterEach(() => { jest.useRealTimers(); });
function reply(requestId: string, ok: boolean, source: MessageEventSource | null = window) {
  window.dispatchEvent(new MessageEvent("message", { source, data: {
    type: DESKTOP_OPEN_AGENT_CONFIGURATION_RESPONSE_TYPE, requestId, ok,
  } }));
}
it("accepts only the matching host acknowledgement and removes its timeout", async () => {
  const settled = jest.fn();
  const result = openDesktopAgentConfiguration("worker/a").then(settled);
  const request = post.mock.calls[0][0] as { requestId: string };
  expect(request).toEqual({ type: DESKTOP_OPEN_AGENT_CONFIGURATION_REQUEST_TYPE, requestId: expect.any(String), agentKey: "worker/a" });
  reply("other", true); reply(request.requestId, true, null);
  await Promise.resolve(); expect(settled).not.toHaveBeenCalled();
  reply(request.requestId, true); await result;
  expect(settled).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it("rejects missing bridge and failed delivery immediately", async () => {
  jest.mocked(hasDesktopHostBridge).mockReturnValue(false);
  await expect(openDesktopAgentConfiguration("demo")).rejects.toThrow("unavailable");
  expect(post).not.toHaveBeenCalled();
  jest.mocked(hasDesktopHostBridge).mockReturnValue(true);
  post.mockReturnValue(false);
  await expect(openDesktopAgentConfiguration("demo")).rejects.toThrow("request failed");
  expect(jest.getTimerCount()).toBe(0);
});
it("rejects a denied request and cleans up", async () => {
  const result = openDesktopAgentConfiguration("demo");
  const request = post.mock.calls[0][0] as { requestId: string };
  reply(request.requestId, false);
  await expect(result).rejects.toThrow("navigation failed");
  expect(jest.getTimerCount()).toBe(0);
});
it("times out on an older host that does not support the request", async () => {
  const result = openDesktopAgentConfiguration("demo");
  const assertion = expect(result).rejects.toThrow("timed out");
  jest.advanceTimersByTime(5_000);
  await assertion;
  expect(jest.getTimerCount()).toBe(0);
});
