/** @jest-environment jsdom */
import { VoiceSession } from "./voiceSession";
import { VoiceVad } from "./voiceVad";
jest.mock("./voiceVad", () => ({ VoiceVad: { create: jest.fn() } }));
import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";

// Only browser boundaries are replaced: Session, Capture, Player and PCM encoder are real.
class Track {
  readyState = "live";
  onended: (() => void) | null = null;
  stop = jest.fn(() => { this.readyState = "ended"; });
}
class AudioContextStub {
  static instances: AudioContextStub[] = [];
  state = "running";
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  resume = jest.fn(async () => { this.state = "running"; });
  close = jest.fn(async () => { this.state = "closed"; });
  processor = { connect: jest.fn(), disconnect: jest.fn(), onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null };
  sources: Array<{ connect: () => void; disconnect: () => void; start: () => void; stop: () => void; buffer: unknown; onended: (() => void) | null }> = [];
  constructor() { AudioContextStub.instances.push(this); }
  createMediaStreamSource() { return { connect: jest.fn(), disconnect: jest.fn() }; }
  createScriptProcessor() { return this.processor; }
  createBuffer(_channels: number, size: number, rate: number) { return { duration: size / rate, getChannelData: () => new Float32Array(size) }; }
  createBufferSource() {
    const source = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn(), buffer: null, onended: null };
    this.sources.push(source); return source;
  }
}
class Socket {
  static OPEN = 1;
  static instance: Socket;
  readyState = 1; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn(); close = jest.fn();
  constructor() { Socket.instance = this; }
}
const capabilities: VoiceCapabilities = { enabled: true, reason: "", version: 2, websocketPath: "/api/voice/ws", input: { codecs: ["pcm_s16le"], sampleRate: 16000, channels: 1 }, output: { codecs: ["pcm_s16le"], sampleRates: [16000, 24000] }, defaultVoice: "voice", voices: [] };
const patch = jest.fn(), onRun = jest.fn(), getUserMedia = jest.fn();
let track: Track;
let session: VoiceSession;
const frame = (message: Record<string, unknown>) => Socket.instance.onmessage?.({ data: JSON.stringify(message) });
const controls = () => Socket.instance.send.mock.calls.filter(([data]) => typeof data === "string").map(([data]) => JSON.parse(data));
const captureContext = () => AudioContextStub.instances.at(-1)!;
const sample = () => captureContext().processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(.5) } });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
async function open() {
  session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "chat", voice: "voice", patch, onRun });
  await session.prepare(); session.connect(""); Socket.instance.onopen?.();
  frame({ type: "hello", version: 2, sessionId: "session", agentKey: "agent", chatId: "chat", audio: { output: { codec: "pcm_s16le", channels: 1, sampleRate: 24000 } } });
  frame({ type: "listen.ready", requestId: "voice:session:1", turn: 1 });
}
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); AudioContextStub.instances = []; track = new Track();
  const initialTrack = track;
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [initialTrack], getAudioTracks: () => [initialTrack] });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: AudioContextStub });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: Socket });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
});
afterEach(() => { session?.close(); jest.useRealTimers(); });

it("deduplicates repeated listen pulses while listening and while confirmation is pending", async () => {
  await open();
  for (let i = 0; i < 8; i++) session.listen();
  expect(controls()).toHaveLength(2);
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  for (let i = 0; i < 8; i++) session.listen();
  expect(controls()).toHaveLength(3);
  expect(controls().at(-1)).toMatchObject({ type: "listen", state: "start", turn: 2 });
  expect(session.isClosed).toBe(false);
  session.close(); expect(session.isClosed).toBe(true);
});

it("plays the final answer despite a hint onended arriving after successful Run completion", async () => {
  await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask" });
  frame({ type: "tts", turn: 1, speechId: "speech", purpose: "notice", state: "start", text: "confirm" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  frame({ type: "tts", turn: 1, speechId: "speech", purpose: "notice", state: "stop", reason: "done" });
  frame({ type: "run", runId: "owned", state: "end", finishReason: "complete" });
  const output = AudioContextStub.instances[0];
  const lateHint = output.sources[0].onended!;
  lateHint();
  expect(controls()).toHaveLength(2);
  frame({ type: "tts", turn: 1, speechId: "speech", purpose: "final", state: "start", text: "final answer" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  frame({ type: "tts", turn: 1, speechId: "speech", purpose: "final", state: "stop", reason: "done" });
  lateHint();
  expect(controls()).toHaveLength(2);
  expect(output.sources).toHaveLength(2);
  output.sources[1].onended?.();
  expect(controls()).toHaveLength(3);
  expect(patch).toHaveBeenLastCalledWith({ status: "listening", error: "", awaiting: false, canAnswerQuestion: false, supplementAccepted: false });
});

it.each(["suspended", "ended"])("produces new PCM after recovering %s input", async state => {
  await open(); sample();
  frame({ type: "error", turn: 1, code: "asr_failed", msg: "retry" });
  if (state === "suspended") captureContext().state = "suspended";
  else {
    track.readyState = "ended"; track = new Track();
    getUserMedia.mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
  }
  const previous = Socket.instance.send.mock.calls.filter(([data]) => data instanceof Uint8Array).length;
  session.listen();
  expect(controls()).toHaveLength(2); // No speculative turn while preparing input.
  await flush(); frame({ type: "listen.ready", requestId: "voice:session:2", turn: 2 }); sample();
  expect(controls()).toHaveLength(3);
  expect(Socket.instance.send.mock.calls.filter(([data]) => data instanceof Uint8Array)).toHaveLength(previous + 1);
  expect(getUserMedia).toHaveBeenCalledTimes(state === "ended" ? 2 : 1);
});

it.each(["abort", "close"])("does not reopen input from a late resume after %s", async action => {
  await open();
  frame({ type: "error", turn: 1, code: "asr_failed", msg: "retry" });
  const input = captureContext(); input.state = "suspended";
  let resume!: () => void;
  input.resume.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
  session.listen(); session.listen();
  if (action === "abort") session.abort(); else session.close();
  input.state = "running"; resume(); await flush();
  expect(controls().filter(control => control.type === "listen")).toHaveLength(1);
  if (action === "abort") {
    frame({ type: "abort", turn: 1 });
    expect(controls().filter(control => control.type === "listen")).toHaveLength(1);
  } else expect(track.stop).toHaveBeenCalledTimes(1);
});

it("closes lost input without sending abort or replaying a Query", async () => {
  await open();
  track.readyState = "ended"; track.onended?.();
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error", sessionActive: false }));
  expect(controls().some(control => control.type === "abort")).toBe(false);
});

it("releases audio resources after microphone permission is denied", async () => {
  getUserMedia.mockRejectedValueOnce(new Error("permission denied"));
  await expect(open()).rejects.toThrow("permission denied");
  expect(AudioContextStub.instances.every(context => context.close.mock.calls.length === 1)).toBe(true);
});


it("bounds an unresponsive context resume and ignores its late completion", async () => {
  await open();
  frame({ type: "error", turn: 1, code: "asr_failed", msg: "retry" });
  const input = captureContext(); input.state = "suspended";
  let resume!: () => void;
  input.resume.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
  session.listen();
  jest.advanceTimersByTime(10000);
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "Microphone recovery timed out", sessionActive: false });
  resume(); await flush();
  expect(controls()).toHaveLength(2);
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);
});


it("keeps the one microphone while monitoring playback, stops locally, and forwards its bounded pre-roll after ready", async () => {
  let onset!: (candidateAtMs: number) => void;
  const vad = { push: jest.fn(), setActive: jest.fn(), close: jest.fn(async () => undefined) };
  jest.mocked(VoiceVad.create).mockImplementation(async callback => { onset = callback; return vad as unknown as VoiceVad; });
  await open(); await session.setInterruptionMode("duplex");
  frame({ type: "stt", turn: 1, final: true, text: "hello" });
  frame({ type: "tts", turn: 1, state: "start", speechId: "old", purpose: "final", text: "answer" });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) }); await flush();
  const source = AudioContextStub.instances[0].sources[0];
  for (let i = 0; i < 50; i++) sample();
  expect(vad.push).toHaveBeenCalled();
  expect(Socket.instance.send.mock.calls.some(([data]) => data instanceof Uint8Array)).toBe(false);
  onset(performance.now() - 160);
  expect(source.stop).toHaveBeenCalledTimes(1);
  expect(source.stop.mock.invocationCallOrder[0]).toBeLessThan(Socket.instance.send.mock.invocationCallOrder.at(-1)!);
  expect(controls().at(-1)).toMatchObject({ type: "listen", turn: 2, intent: "conversation" });
  frame({ type: "listen.ready", requestId: "voice:session:2", turn: 2 });
  const pre = Socket.instance.send.mock.calls.filter(([data]) => data instanceof Uint8Array).map(([data]) => data as Uint8Array);
  expect(pre.length).toBeGreaterThan(1); expect(pre.reduce((sum, data) => sum + data.length, 0)).toBeLessThanOrEqual(15360);
  expect(pre.every(data => data.length === 640)).toBe(true);
  sample(); session.stopListening();
  const packets = Socket.instance.send.mock.calls.filter(([data]) => data instanceof Uint8Array).map(([data]) => data as Uint8Array);
  expect(packets.slice(0, -1).every(data => data.length === 640)).toBe(true);
  expect(packets.at(-1)!.length % 2).toBe(0);
  expect(packets.at(-1)!.length).toBeLessThanOrEqual(640);

  expect(getUserMedia).toHaveBeenCalledTimes(1); expect(AudioContextStub.instances).toHaveLength(2); // Existing player and capture.
  expect(track.stop).not.toHaveBeenCalled(); session.close(); await flush();
  expect(vad.close).toHaveBeenCalledTimes(1); expect(track.stop).toHaveBeenCalledTimes(1);
  expect(AudioContextStub.instances.every(context => context.close.mock.calls.length === 1)).toBe(true);
});
