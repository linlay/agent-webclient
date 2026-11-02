/** @jest-environment jsdom */
import { VoiceSession } from "./voiceSession";
import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";

const capture = { prepare: jest.fn(async () => undefined), start: jest.fn(), stop: jest.fn(), close: jest.fn() };
const player = { prepare: jest.fn(async () => undefined), start: jest.fn(), append: jest.fn(), finish: jest.fn(), stop: jest.fn(), close: jest.fn(), setMuted: jest.fn() };
let drained: () => void;
let sendPCM: (pcm: Uint8Array) => void;
jest.mock("./voiceAudioCapture", () => ({ VoiceAudioCapture: jest.fn().mockImplementation(send => { sendPCM = send; return capture; }) }));
jest.mock("./voiceAudioPlayer", () => ({ VoiceAudioPlayer: jest.fn().mockImplementation(done => { drained = done; return player; }) }));

class Socket {
  static OPEN = 1;
  static instance: Socket;
  readyState = 1;
  bufferedAmount = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn();
  constructor(readonly url: string, readonly protocols: string[]) { Socket.instance = this; }
}
const capabilities: VoiceCapabilities = { enabled: true, version: 1, reason: "", websocketPath: "/api/voice/ws",
  input: { codecs: ["pcm_s16le"], sampleRate: 16000, channels: 1 }, output: { codecs: ["pcm_s16le"], sampleRates: [16000, 24000] },
  voices: [{ id: "voice", label: "Voice" }], defaultVoice: "voice" };
const patch = jest.fn();
const onRun = jest.fn();
function frame(message: Record<string, unknown>) { Socket.instance.onmessage?.({ data: JSON.stringify(message) }); }
function sent() { return Socket.instance.send.mock.calls.map(([message]) => typeof message === "string" ? JSON.parse(message) : message); }
async function open(mode: "auto" | "manual" = "auto") {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "chat", voice: "voice", mode, patch, onRun });
  await session.prepare();
  session.connect("test-token");
  Socket.instance.onopen?.();
  frame({ type: "hello", version: 1, agentKey: "agent", chatId: "chat", audio: { output: { codec: "pcm_s16le", channels: 1, sampleRate: 24000 } } });
  return session;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "WebSocket", { value: Socket, configurable: true });
});
afterEach(() => jest.useRealTimers());

it("sends v1 media controls and uses the bearer subprotocol without URL credentials", async () => {
  const session = await open("manual");
  expect(Socket.instance.url).toBe("ws://localhost/api/voice/ws");
  expect(Socket.instance.protocols).toEqual(["bearer.test-token"]);
  expect(sent()[0]).toMatchObject({ type: "hello", version: 1, agentKey: "agent", chatId: "chat" });
  expect(sent()[1]).toEqual({ type: "listen", state: "start", mode: "manual" });
  capture.stop.mockImplementationOnce(flush => { if (flush) sendPCM(new Uint8Array([0, 0])); });
  session.stopListening();
  session.stopListening();
  expect(sent().slice(-2)).toEqual([new Uint8Array([0, 0]), { type: "listen", state: "stop", mode: "manual" }]);
  frame({ type: "stt", turn: 1, final: true, text: "complete original question" });
  frame({ type: "run", turn: 1, state: "start", chatId: "chat", runId: "real-run" });
  expect(onRun).toHaveBeenCalledWith("chat", "real-run");
  expect(sent().filter(value => value.type).map(value => value.type)).toEqual(["hello", "listen", "listen"]);
  session.close();
});

it("waits for successful Run, tts.stop and actual local drain before listening again", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "hello" });
  frame({ type: "run", turn: 1, state: "end", finishReason: "complete" });
  expect(sent()).toHaveLength(2); // Run end arrives before TTS start.
  frame({ type: "tts", turn: 1, state: "start", text: "full answer" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  expect(player.append).toHaveBeenCalledTimes(1);
  expect(sent()).toHaveLength(2);
  drained();
  expect(sent().at(-1)).toEqual({ type: "listen", state: "start", mode: "auto" });
  session.close();
});

it("keeps awaiting after the hint drains and resumes only after the final answer", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "awaiting", turn: 1, awaitingId: "ask" });
  frame({ type: "tts", turn: 1, state: "start", text: "confirm in UI" });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  drained();
  session.listen();
  expect(sent()).toHaveLength(2);
  frame({ type: "run", turn: 1, state: "end", finishReason: "complete" });
  frame({ type: "tts", turn: 1, state: "start", text: "final" });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  drained();
  expect(sent()).toHaveLength(3);
  session.close();
});

it("clears playback immediately, discards old media until abort confirmation, and ignores old turns", async () => {
  const session = await open();
  frame({ type: "tts", turn: 1, state: "start", text: "old" });
  session.abort(); session.abort();
  expect(player.stop).toHaveBeenCalledTimes(1);
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  drained();
  expect(player.append).not.toHaveBeenCalled();
  expect(sent().filter(value => value.type === "abort")).toHaveLength(1);
  frame({ type: "abort", turn: 1 });
  frame({ type: "tts", turn: 1, state: "start", text: "late old" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  expect(player.append).not.toHaveBeenCalled();
  frame({ type: "tts", turn: 2, state: "start", text: "new" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(2) });
  expect(player.append).toHaveBeenCalledTimes(1);
  session.close();
});

it("disconnects media without abort, automatic reconnect or retransmission", async () => {
  const session = await open();
  frame({ type: "run", turn: 1, state: "start", chatId: "chat", runId: "retained" });
  Socket.instance.onclose?.();
  jest.advanceTimersByTime(20000);
  expect(capture.close).toHaveBeenCalledTimes(1);
  expect(player.close).toHaveBeenCalledTimes(1);
  expect(sent().filter(value => value.type === "abort")).toHaveLength(0);
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error", sessionActive: false }));
  session.close();
});
