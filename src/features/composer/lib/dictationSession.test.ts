/** @jest-environment jsdom */
import { AudioCapture } from "@/shared/media/audioCapture";
import { DictationSession } from "./dictationSession";

jest.mock("@/shared/media/audioCapture", () => ({ AudioCapture: jest.fn().mockImplementation((send: (pcm: Uint8Array) => void) => ({
  prepare: jest.fn(async () => undefined), start: jest.fn(), close: jest.fn(),
  stop: jest.fn((flush: boolean) => { if (flush) send(new Uint8Array(42)); }),
})) }));

class Socket {
  static OPEN = 1;
  static current: Socket;
  readyState = 1;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn(); close = jest.fn();
  constructor(readonly url: string, readonly protocols: string[]) { Socket.current = this; }
  event(type: string, text?: string) { this.onmessage?.({ data: JSON.stringify({ type, text }) }); }
}

function setup() {
  const onText = jest.fn(), onStatus = jest.fn();
  const session = new DictationSession({ onText, onStatus });
  const capture = (AudioCapture as jest.Mock).mock.results.at(-1).value;
  session.connect("secret"); Socket.current.onopen?.();
  return { session, socket: Socket.current, capture, onText, onStatus };
}
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: Socket }); });
afterEach(() => { expect(jest.getTimerCount()).toBe(0); jest.useRealTimers(); });

it("waits for ready, emits tail before stop, and shares one finalization result", async () => {
  const { session, socket, capture, onText } = setup();
  expect(socket.url).not.toContain("secret"); expect(socket.protocols).toEqual(["bearer.secret"]);
  expect(capture.start).not.toHaveBeenCalled();
  socket.event("ready"); socket.event("partial", "hello"); socket.event("partial", "hello world");
  const result = session.finish(); expect(session.finish()).toBe(result);
  expect(socket.send.mock.calls.map(([value]) => typeof value === "string" ? JSON.parse(value).type : value.byteLength)).toEqual(["start", 42, "stop"]);
  expect(capture.close).toHaveBeenCalled(); socket.event("final", "hello world!");
  expect(await result).toEqual({ text: "hello world!" });
  expect(onText.mock.calls.map(([text]) => text)).toEqual(["hello", "hello world", "hello world!"]);
  expect(socket.close).toHaveBeenCalledTimes(1);
});

it("60 seconds ends normally and still permits bounded finalization", async () => {
  const { session, socket, onStatus } = setup(); socket.event("ready");
  jest.advanceTimersByTime(60000);
  expect(onStatus).toHaveBeenLastCalledWith("finishing");
  jest.advanceTimersByTime(5000); socket.event("final", "done");
  expect(await session.result).toEqual({ text: "done" });
});

it("finish while connecting waits for ready and never starts capture", async () => {
  const { session, socket, capture } = setup(); const result = session.finish();
  socket.event("ready"); expect(capture.start).not.toHaveBeenCalled();
  socket.event("final", "done"); expect(await result).toEqual({ text: "done" });
});

it.each(["cancel", "disconnect", "timeout"])("%s releases resources and ignores late results", async action => {
  const { session, socket, capture, onText } = setup(); socket.event("ready");
  const late = socket.onmessage;
  if (action === "cancel") session.cancel();
  if (action === "disconnect") socket.onclose?.();
  if (action === "timeout") { session.finish(); jest.advanceTimersByTime(15000); }
  late?.({ data: '{"type":"final","text":"late"}' });
  expect(await session.result).not.toHaveProperty("text");
  expect(onText).not.toHaveBeenCalled(); expect(capture.close).toHaveBeenCalled();
});
