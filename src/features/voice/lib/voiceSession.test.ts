/** @jest-environment jsdom */
import { VoiceSession } from "./voiceSession";
import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";

const capture = { ready: true, prepare: jest.fn(async () => undefined), start: jest.fn(), stop: jest.fn(), close: jest.fn() };
const player = { playing: false, prepare: jest.fn(async () => undefined), start: jest.fn(), append: jest.fn(), finish: jest.fn(), stop: jest.fn(), close: jest.fn(), setMuted: jest.fn() };
let drained: () => void;
let playbackFailed: (message: string) => void;
let sendPCM: (pcm: Uint8Array) => void;
jest.mock("./voiceAudioCapture", () => ({ VoiceAudioCapture: jest.fn().mockImplementation(send => { sendPCM = send; return capture; }) }));
jest.mock("./voiceAudioPlayer", () => ({ VoiceAudioPlayer: jest.fn().mockImplementation((done, failed) => { drained = done; playbackFailed = failed; return player; }) }));

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
  player.playing = false;
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
it.each([false, true])("sends explicit creation in hello (primary=%s) without changing media controls", async primary => {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "", newChat: true, primary, voice: "voice", mode: "auto", patch, onRun });
  await session.prepare(); session.connect("test-token"); Socket.instance.onopen?.();
  expect(sent()[0]).toMatchObject({ type: "hello", newChat: true });
  expect(sent()[0].chatId).toBeUndefined();
  expect(sent()[0].primary).toBe(primary ? true : undefined);
  frame({ type: "hello", version: 1, agentKey: "agent", chatId: "fresh-chat", audio: { output: { codec: "pcm_s16le", channels: 1, sampleRate: 24000 } } });
  expect(sent()[1]).toEqual({ type: "listen", state: "start", mode: "auto" });
  frame({ type: "run", turn: 1, state: "start", chatId: "fresh-chat", runId: "fresh-run" });
  expect(onRun).toHaveBeenCalledWith("fresh-chat", "fresh-run");
  session.close();
});
it("does not retry a rejected creation handshake without its new-Chat intent", async () => {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "", newChat: true, voice: "voice", mode: "auto", patch, onRun });
  await session.prepare(); session.connect("test-token"); Socket.instance.onopen?.();
  frame({ type: "error", code: "invalid_request", msg: "unsupported hello" });
  jest.advanceTimersByTime(20000);
  expect(sent()).toHaveLength(1);
  expect(sent()[0].newChat).toBe(true);
  expect(capture.start).not.toHaveBeenCalled();
  expect(onRun).not.toHaveBeenCalled();
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);
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

it("ends only the current turn on a server error and listens again on request", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "awaiting", turn: 1, awaitingId: "ask" });
  frame({ type: "error", turn: 1, code: "chat_busy", msg: "聊天忙" });
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "聊天忙", awaiting: false });
  expect(Socket.instance.close).not.toHaveBeenCalled();
  expect(capture.close).not.toHaveBeenCalled();
  expect(player.stop).toHaveBeenCalledTimes(1);
  session.listen();
  expect(sent().at(-1)).toEqual({ type: "listen", state: "start", mode: "auto" });
  frame({ type: "stt", turn: 2, final: false, text: "again" });
  expect(patch).toHaveBeenLastCalledWith({ partialUserText: "again", partialAssistantText: "" });
  session.close();
});

it("fails the session for a handshake error and explains a close after a turn error", async () => {
  const early = new VoiceSession({ capabilities, agentKey: "agent", chatId: "", voice: "voice", mode: "auto", patch, onRun });
  await early.prepare(); early.connect("test-token"); Socket.instance.onopen?.();
  frame({ type: "error", code: "invalid_request", msg: "agent unavailable" });
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "agent unavailable", sessionActive: false });
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);

  const session = await open();
  frame({ type: "error", turn: 1, code: "run_busy_timeout", msg: "任务收尾超时，请重新连接语音" });
  Socket.instance.onclose?.();
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "任务收尾超时，请重新连接语音", sessionActive: false });
  session.close();
});

it("continues listening after empty input without an error, Query or transcript reset", async () => {
  const session = await open();
  patch.mockClear();
  frame({ type: "stt", turn: 1, final: true, text: "" });
  expect(sent().filter(value => value.type === "listen")).toHaveLength(2);
  expect(patch).toHaveBeenLastCalledWith({ status: "listening", error: "", awaiting: false });
  expect(onRun).not.toHaveBeenCalled(); expect(Socket.instance.close).not.toHaveBeenCalled();
  session.close();
});

it("isolates old errors and recognition events from playback and waits for its entire tail", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "run", turn: 1, state: "end", finishReason: "complete" });
  frame({ type: "tts", turn: 1, state: "start", text: "answer" });
  player.playing = true;
  const count = sent().length;
  sendPCM(new Uint8Array(640)); // Environmental sound cannot upload during playback.
  frame({ type: "stt", turn: 1, final: true, text: "background sound" });
  frame({ type: "error", turn: 0, code: "tts_failed", msg: "old" });
  for (const code of ["asr_failed", "recording_limit", "transcript_limit", "invalid_audio", "audio_overflow"]) {
    frame({ type: "error", turn: 1, code, msg: "late recognition" });
  }
  expect(player.stop).not.toHaveBeenCalled(); expect(sent()).toHaveLength(count);
  expect(patch).toHaveBeenLastCalledWith({ status: "speaking", partialAssistantText: "answer" });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  session.listen(); expect(sent()).toHaveLength(count);
  player.playing = false; drained();
  expect(sent()).toHaveLength(count + 1);
  session.close();
});

it("reports an actual ASR failure during manual finalization without starting another task", async () => {
  const session = await open("manual");
  session.stopListening();
  frame({ type: "error", turn: 1, code: "asr_failed", msg: "recognition failed" });
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "recognition failed", awaiting: false });
  expect(sent()).toHaveLength(3); expect(onRun).not.toHaveBeenCalled();
  session.close();
});

it("keeps the session after exhausted local recovery without aborting or retrying the Run", async () => {
  const session = await open();
  frame({ type: "tts", turn: 1, state: "start", text: "answer" });
  playbackFailed("output unavailable");
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  expect(player.append).not.toHaveBeenCalled(); expect(Socket.instance.close).not.toHaveBeenCalled();
  session.listen(); expect(sent()).toHaveLength(2);
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  expect(player.finish).not.toHaveBeenCalled();
  session.listen(); expect(sent()).toHaveLength(3);
  expect(sent().some(value => value.type === "abort")).toBe(false);
  session.close();
});

it("lets already received audio finish on a TTS error without starting another listen", async () => {
  const session = await open();
  frame({ type: "tts", turn: 1, state: "start", text: "answer" });
  player.playing = true;
  frame({ type: "tts", turn: 1, state: "stop", reason: "error" });
  frame({ type: "error", turn: 1, code: "tts_failed", msg: "provider stopped" });
  expect(player.stop).not.toHaveBeenCalled();
  session.listen(); expect(sent()).toHaveLength(2);
  player.playing = false; drained(); expect(sent()).toHaveLength(2);
  session.close();
});

it("does not count an awaiting hint drain as final playback after run.end", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "awaiting", turn: 1, awaitingId: "ask" });
  frame({ type: "tts", turn: 1, state: "start", text: "confirm in UI" });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  frame({ type: "run", turn: 1, state: "end", finishReason: "complete" });
  drained();
  expect(sent()).toHaveLength(2);
  frame({ type: "tts", turn: 1, state: "start", text: "final answer" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  frame({ type: "tts", turn: 1, state: "stop", reason: "done" });
  drained();
  expect(player.append).toHaveBeenCalledTimes(1);
  expect(sent()).toHaveLength(3);
  session.close();
});

it("reports a rejected listen even when the server reports its preceding turn", async () => {
  const session = await open();
  frame({ type: "error", turn: 0, code: "turn_busy", msg: "turn not released" });
  expect(capture.close).toHaveBeenCalledTimes(1);
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "turn not released", sessionActive: false });
  expect(sent().some(value => value.type === "abort")).toBe(false);
});

it("uses the abort barrier's turn to resume instead of carrying a divergent counter", async () => {
  const session = await open();
  session.abort();
  frame({ type: "abort", turn: 0 });
  frame({ type: "stt", turn: 1, final: false, text: "resynchronized" });
  expect(patch).toHaveBeenLastCalledWith({ partialUserText: "resynchronized", partialAssistantText: "" });
  session.close();
});
