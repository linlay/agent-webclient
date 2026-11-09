/** @jest-environment jsdom */
import { VoiceSession } from "./voiceSession";
import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";
import type { VoicePlayStart } from "./voiceAudioPlayer";

const capture = { enableDetection: jest.fn(async (_detected: (pcm: Uint8Array[], candidateAtMs: number) => void, _failed: (error: unknown) => void) => undefined), disableDetection: jest.fn(), setDetecting: jest.fn(), ready: true, prepare: jest.fn(async () => undefined), start: jest.fn(), stop: jest.fn(), close: jest.fn() };
const player = { playing: false, prepare: jest.fn(async () => undefined), start: jest.fn(), append: jest.fn(), finish: jest.fn(), stop: jest.fn(), close: jest.fn(), setMuted: jest.fn() };
let drained: () => void;
let playbackFailed: (message: string) => void;
let playbackStarted: (point: VoicePlayStart) => void;
let sendPCM: (pcm: Uint8Array) => void;
jest.mock("./voiceAudioCapture", () => ({ VoiceAudioCapture: jest.fn().mockImplementation(send => { sendPCM = send; return capture; }) }));
jest.mock("./voiceAudioPlayer", () => ({ VoiceAudioPlayer: jest.fn().mockImplementation((done, failed, started) => { drained = done; playbackFailed = failed; playbackStarted = started; return player; }) }));

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
const capabilities: VoiceCapabilities = { enabled: true, version: 2, reason: "", websocketPath: "/api/voice/ws",
  input: { codecs: ["pcm_s16le"], sampleRate: 16000, channels: 1 }, output: { codecs: ["pcm_s16le"], sampleRates: [16000, 24000] },
  voices: [{ id: "voice", label: "Voice" }], defaultVoice: "voice" };
const patch = jest.fn();
const onRun = jest.fn();
function frame(message: Record<string, unknown>) { Socket.instance.onmessage?.({ data: JSON.stringify(message) }); }
function sent() { return Socket.instance.send.mock.calls.map(([message]) => typeof message === "string" ? JSON.parse(message) : message); }
async function open(confirm = true) {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "chat", voice: "voice", patch, onRun });
  await session.prepare();
  session.connect("test-token");
  Socket.instance.onopen?.();
  frame({ type: "hello", version: 2, sessionId: "session", agentKey: "agent", chatId: "chat", audio: { output: { codec: "pcm_s16le", channels: 1, sampleRate: 24000 } } });
  if (confirm) ready();
  return session;
}
function ready() {
  const request = sent().filter(value => value.type === "listen" && value.state === "start").at(-1);
  frame({ type: "listen.ready", requestId: request.requestId, turn: request.turn });
}
function speech(turn = 1, id = "speech", purpose = "final") {
  frame({ type: "tts", turn, speechId: id, purpose, state: "start", text: "answer" });
}
function speechDone(turn = 1, id = "speech", purpose = "final") {
  frame({ type: "tts", turn, speechId: id, purpose, state: "stop", reason: "done" });
}
beforeEach(() => {
  jest.clearAllMocks();
  capture.ready = true;
  player.playing = false;
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "WebSocket", { value: Socket, configurable: true });
});
afterEach(() => jest.useRealTimers());

it("asks questions one by one and only starts bound capture after local playback drains",async()=>{
  const session=await open();
  frame({type:"stt",turn:1,final:true,text:"start"});
  frame({type:"run",state:"start",chatId:"chat",runId:"owned"});
  frame({type:"awaiting",state:"ask",runId:"owned",awaitingId:"ask",mode:"question",questionId:"q1",handoff:false});
  speech(1,"question1","question");speechDone(1,"question1","question");
  expect(sent().filter(item=>item.intent==="question")).toHaveLength(0);
  drained();
  expect(sent().at(-1)).toMatchObject({type:"listen",state:"start",turn:2,intent:"question",runId:"owned",awaitingId:"ask",questionId:"q1"});ready();
  frame({type:"stt",turn:2,final:true,text:"answer one"});
  frame({type:"awaiting",state:"ask",runId:"owned",awaitingId:"ask",mode:"question",questionId:"q2"});
  speech(2,"question2","question");
  session.listen(); // Same action interrupts the question, without task abort.
  expect(sent().at(-1)).toMatchObject({intent:"question",turn:3,questionId:"q2"});ready();
  expect(sent().some(item=>item.type==="abort")).toBe(false);
  frame({type:"awaiting",state:"resolved",runId:"owned",awaitingId:"ask"});
  const count=patch.mock.calls.length;
  frame({type:"stt",turn:3,final:true,text:"late answer"});
  expect(patch).toHaveBeenCalledTimes(count);
  session.close();
});

it("does not capture during password handoff and handles UI winning an in-flight question listen",async()=>{
  const session=await open();
  frame({type:"stt",turn:1,final:true,text:"start"});frame({type:"run",state:"start",chatId:"chat",runId:"owned"});
  frame({type:"awaiting",state:"ask",runId:"owned",awaitingId:"ask",mode:"question",questionId:"q1"});
  session.listen();
  frame({type:"error",turn:2,code:"input_changed",msg:"Question resolved"});
  frame({type:"awaiting",state:"resolved",runId:"owned",awaitingId:"ask"});
  expect(Socket.instance.close).not.toHaveBeenCalled();
  frame({type:"awaiting",state:"ask",runId:"owned",awaitingId:"password",mode:"question",questionId:"",handoff:true});
  speech(2,"handoff","notice");speechDone(2,"handoff","notice");drained();session.listen();
  expect(sent().filter(item=>item.type==="listen"&&item.state==="start")).toHaveLength(2);
  expect(patch).toHaveBeenCalledWith({awaiting:true,canAnswerQuestion:false});session.close();
});

it("records client audio evidence and terminal outcomes without logging content or confusing drain with interruption", async () => {
  const events: Record<string, unknown>[] = [];
  const receive = (event: Event) => events.push((event as CustomEvent).detail);
  window.addEventListener("agent:voice-timing", receive);
  const session = await open();
  try {
    jest.advanceTimersByTime(100);
    session.stopListening();
    frame({ type: "stt", turn: 1, final: true, text: "private question" });
    frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
    frame({ type: "run", state: "end", runId: "owned", finishReason: "complete" });
    speech();
    expect(events.some(event => event.stage === "playStart")).toBe(false);
    playbackStarted({ atMs: 90, audioTime: .14, clockSource: "output_timestamp" });
    speechDone(); drained(); ready();
    expect(events.find(event => event.stage === "playStart")).toMatchObject({ atMs: 90, turn: 1, runId: "owned", speechId: "speech", purpose: "final", clock: "client_performance" });
    expect(events.filter(event => event.stage === "turnEnd")).toEqual([expect.objectContaining({ turn: 1, outcome: "complete" })]);
    expect(events.some(event => event.stage === "interruptRequested")).toBe(false);
    frame({ type: "error", turn: 2, code: "asr_failed", msg: "secret diagnostic" });
    session.close();
    expect(events.filter(event => event.stage === "turnEnd")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ turn: 2, outcome: "error" });
    expect(JSON.stringify(events)).not.toMatch(/private question|secret diagnostic|test-token|answer/);
    expect(events.some(event => event.stage === "speechEnd")).toBe(false); // ASR is not a speech-end measurement.
  } finally { session.close(); window.removeEventListener("agent:voice-timing", receive); }
});

it("measures local interruption on the old turn and keeps the interrupted sample", async () => {
  const events: Record<string, unknown>[] = [];
  const receive = (event: Event) => events.push((event as CustomEvent).detail);
  window.addEventListener("agent:voice-timing", receive);
  const session = await open();
  try {
    frame({ type: "stt", turn: 1, final: true, text: "question" });
    speech(); session.listen(); ready(); session.abort(); session.close();
    expect(events.filter(event => ["interruptRequested", "localSilenced", "turnEnd"].includes(String(event.stage)))).toEqual([
      expect.objectContaining({ turn: 1, stage: "interruptRequested" }),
      expect.objectContaining({ turn: 1, stage: "localSilenced" }),
      expect.objectContaining({ turn: 1, stage: "turnEnd", outcome: "superseded" }),
      expect.objectContaining({ turn: 2, stage: "turnEnd", outcome: "aborted" }),
    ]);
  } finally { session.close(); window.removeEventListener("agent:voice-timing", receive); }
});

it("sends v2 with timezone and buffers short recording until matching ready", async () => {
  const session = await open(false);
  expect(Socket.instance.url).toBe("ws://localhost/api/voice/ws");
  expect(Socket.instance.protocols).toEqual(["bearer.test-token"]);
  expect(sent()[0]).toMatchObject({ type: "hello", version: 2, agentKey: "agent", timeZone: expect.any(String) });
  expect(sent()[1]).toEqual({ type: "listen", state: "start", requestId: "voice:session:1", turn: 1, intent: "conversation" });
  sendPCM(new Uint8Array([1, 2]));
  capture.stop.mockImplementationOnce(flush => { if (flush) sendPCM(new Uint8Array([3, 4])); });
  session.stopListening(); session.stopListening();
  expect(sent()).toHaveLength(2);
  ready();
  expect(sent().slice(-3)).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4]), { type: "listen", state: "stop", requestId: "voice:session:1", turn: 1 }]);
  session.close();
});
it.each([false, true])("preserves explicit new Chat intent (primary=%s)", async primary => {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "", newChat: true, primary, voice: "voice", patch, onRun });
  await session.prepare(); session.connect(""); Socket.instance.onopen?.();
  expect(sent()[0]).toMatchObject({ type: "hello", newChat: true });
  expect(sent()[0].chatId).toBeUndefined();
  expect(sent()[0].primary).toBe(primary ? true : undefined);
  session.close();
});
it("stops playback before listen, drops old audio across ready and never aborts the Run", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  speech();
  session.listen(); session.listen();
  expect(player.stop).toHaveBeenCalledTimes(1);
  expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 });
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  speechDone(); drained();
  expect(player.append).not.toHaveBeenCalled();
  ready();
  speech(); Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  expect(player.append).not.toHaveBeenCalled();
  speech(2, "new"); Socket.instance.onmessage?.({ data: new ArrayBuffer(2) });
  expect(player.append).toHaveBeenCalledTimes(1);
  expect(sent().some(value => value.type === "abort")).toBe(false);
  session.close();
});
it("filters speech identity within a turn and waits for final local drain", async () => {
  const session = await open();
  speech(1, "new");
  speechDone(1, "old");
  expect(player.finish).not.toHaveBeenCalled();
  speechDone(1, "new");
  expect(sent()).toHaveLength(2);
  drained();
  expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 });
  session.close();
});
it("processes Run and awaiting by identity while a new media turn is pending", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  session.listen();
  frame({ type: "run", turn: 1, state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask", mode: "approval" });
  expect(onRun).toHaveBeenCalledWith("chat", "owned");
  expect(patch).toHaveBeenLastCalledWith({ awaiting: true, canAnswerQuestion: false });
  frame({ type: "awaiting", state: "resolved", runId: "foreign", awaitingId: "ask" });
  expect(patch).toHaveBeenLastCalledWith({ awaiting: true, canAnswerQuestion: false });
  frame({ type: "awaiting", state: "resolved", runId: "owned", awaitingId: "ask" });
  expect(patch).toHaveBeenLastCalledWith({ awaiting: false, canAnswerQuestion: false, status: "thinking" });
  session.close();
});
it("does not confuse notice drain with final answer even after Run completion", async () => {
  const session = await open();
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask", mode: "question" });
  speech(1, "hint", "notice"); speechDone(1, "hint", "notice");
  frame({ type: "run", state: "end", runId: "owned", finishReason: "complete" });
  drained(); expect(sent()).toHaveLength(2);
  speech(1, "final"); speechDone(1, "final"); drained();
  expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 });
  session.close();
});
it("waits for a retained result on empty input instead of racing a new listen", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "", pendingResult: true });
  expect(sent()).toHaveLength(2);
  speech(); speechDone(); drained();
  expect(sent()).toHaveLength(3);
  session.close();
});
it("continues automatically after ordinary empty input", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "" });
  expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 });
  expect(onRun).not.toHaveBeenCalled();
  session.close();
});
it("explicit task stop aborts once and does not automatically start new input", async () => {
  const session = await open();
  speech(); session.abort(); session.abort();
  expect(player.stop).toHaveBeenCalledTimes(1);
  frame({ type: "abort", turn: 1 });
  expect(sent().filter(value => value.type === "abort")).toHaveLength(1);
  expect(sent().filter(value => value.type === "listen")).toHaveLength(1);
  session.listen(); ready();
  expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 });
  session.close();
});
it.each(["timeout", "wrong ready", "overflow", "protocol"])("closes only media after %s without retry or abort", async scenario => {
  const session = await open(false);
  if (scenario === "timeout") jest.advanceTimersByTime(5000);
  if (scenario === "wrong ready") frame({ type: "listen.ready", requestId: "other", turn: 1 });
  if (scenario === "overflow") for (let i = 0; i < 26; i++) sendPCM(new Uint8Array(640));
  if (scenario === "protocol") frame({ type: "error", turn: 0, code: "invalid_request", msg: "invalid control" });
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);
  expect(sent()).toHaveLength(2);
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error", sessionActive: false }));
  session.close();
});
it("rejects v1 without downgrade or another hello", async () => {
  const session = new VoiceSession({ capabilities, agentKey: "agent", chatId: "chat", voice: "voice", patch, onRun });
  await session.prepare(); session.connect(""); Socket.instance.onopen?.();
  frame({ type: "hello", version: 1, agentKey: "agent", chatId: "chat" });
  expect(Socket.instance.close).toHaveBeenCalledTimes(1);
  expect(sent()).toHaveLength(1);
  session.close();
});
it("disconnects without automatic reconnect, abort or retransmission", async () => {
  const session = await open();
  Socket.instance.onclose?.(); jest.advanceTimersByTime(20000);
  expect(capture.close).toHaveBeenCalledTimes(1);
  expect(player.close).toHaveBeenCalledTimes(1);
  expect(sent()).toHaveLength(2);
  session.close();
});
it("keeps a recoverable media error local and ignores late ASR during playback", async () => {
  const session = await open();
  speech();
  frame({ type: "error", turn: 0, code: "asr_failed", msg: "old" });
  frame({ type: "error", turn: 1, code: "asr_failed", msg: "late" });
  expect(player.stop).not.toHaveBeenCalled();
  playbackFailed("output unavailable");
  Socket.instance.onmessage?.({ data: new ArrayBuffer(960) });
  expect(player.append).not.toHaveBeenCalled();
  session.listen(); ready();
  frame({ type: "error", turn: 2, code: "asr_failed", msg: "recognition failed" });
  expect(patch).toHaveBeenLastCalledWith({ status: "error", error: "recognition failed", awaiting: false, supplementAccepted: false });
  expect(Socket.instance.close).not.toHaveBeenCalled();
  session.close();
});

it("ignores stale awaiting resolution and late ready superseded by task stop", async () => {
  const session = await open();
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "new", mode: "question" });
  frame({ type: "awaiting", state: "resolved", runId: "owned", awaitingId: "old" });
  expect(patch).toHaveBeenLastCalledWith({ awaiting: true, canAnswerQuestion: false });
  session.abort(); frame({ type: "abort", turn: 1 });
  session.listen(); sendPCM(new Uint8Array(640)); session.abort();
  ready();
  frame({ type: "abort", turn: 2 });
  expect(Socket.instance.close).not.toHaveBeenCalled();
  expect(sent().filter(value => value instanceof Uint8Array)).toHaveLength(0);
  session.close();
});

it("shows supplement acceptance only for the current finalized input and clears it on new input", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "question" });
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  session.listen(); ready();
  frame({ type: "stt", turn: 2, final: true, text: "additional instruction" });
  frame({ type: "run", state: "end", runId: "owned", finishReason: "complete" });
  const accepted = { type: "steer", state: "accepted", turn: 2, requestId: "voice:session:2", steerId: "voice:session:2", runId: "owned" };
  frame(accepted);
  expect(patch).toHaveBeenLastCalledWith({ supplementAccepted: true });
  expect(sent().filter(value => value.type === "listen")).toHaveLength(2);
  session.listen(); ready();
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ supplementAccepted: false, status: "listening" }));
  const count = patch.mock.calls.length;
  frame(accepted);
  expect(patch).toHaveBeenCalledTimes(count);
  expect(sent().some(value => value.type === "abort")).toBe(false);
  session.close();
});

it("does not resend or start a Query when supplement outcome is unknown", async () => {
  const session = await open();
  frame({ type: "stt", turn: 1, final: true, text: "additional instruction" });
  const count = sent().length;
  frame({ type: "error", turn: 1, code: "steer_outcome_unknown", msg: "Check the chat; this input will not be resent" });
  jest.advanceTimersByTime(10000);
  expect(sent()).toHaveLength(count);
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error", supplementAccepted: false }));
  session.close();
});

it("keeps a newly observed awaiting visible when the supplement is rejected", async () => {
  const session = await open();
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask", mode: "approval" });
  frame({ type: "error", turn: 1, code: "input_changed", msg: "Complete the waiting item in chat" });
  expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error", awaiting: true }));
  const count = sent().length;
  session.listen();
  expect(sent()).toHaveLength(count);
  frame({ type: "awaiting", state: "resolved", runId: "owned", awaitingId: "ask" });
  session.listen();
  expect(sent()).toHaveLength(count + 1);
  session.close();
});


it("uses the same local-stop/listen boundary for duplex, uploads pre-roll only after ready, and keeps the Run", async () => {
  const session = await open(); frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  await session.setInterruptionMode("duplex"); speech();
  expect(capture.setDetecting).toHaveBeenLastCalledWith(true);
  const detect = capture.enableDetection.mock.calls.at(-1)![0];
  const pre = new Uint8Array(640).fill(1);
  detect([pre], performance.now() - 160);
  expect(player.stop.mock.invocationCallOrder.at(-1)).toBeLessThan(Socket.instance.send.mock.invocationCallOrder.at(-1)!);
  expect(sent().at(-1)).toMatchObject({ type: "listen", state: "start", intent: "conversation", turn: 2 });
  expect(sent().some(item => item instanceof Uint8Array)).toBe(false);
  detect([pre], performance.now()); // Duplicate and late model callback cannot open a third turn.
  sendPCM(new Uint8Array(640).fill(2)); ready();
  expect(sent().slice(-2)).toEqual([pre, new Uint8Array(640).fill(2)]);
  frame({ type: "stt", turn: 2, final: true, text: "", pendingResult: true });
  frame({ type: "run", runId: "owned", state: "end", finishReason: "complete" });
  speech(2, "later-final"); expect(player.start).toHaveBeenCalledTimes(2);
  expect(sent().some(item => item.type === "abort")).toBe(false); expect(onRun).toHaveBeenCalledTimes(1);
  session.close();
});

it("retains question identity on VAD onset and disables detection for UI-only handoff", async () => {
  const session = await open(); await session.setInterruptionMode("duplex");
  frame({ type: "run", state: "start", chatId: "chat", runId: "owned" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask", mode: "question", questionId: "q1" });
  speech(1, "question", "question"); const detect = capture.enableDetection.mock.calls.at(-1)![0];
  detect([], performance.now()); expect(sent().at(-1)).toMatchObject({ intent: "question", runId: "owned", awaitingId: "ask", questionId: "q1" }); ready();
  frame({ type: "stt", turn: 2, final: true, text: "answer" });
  frame({ type: "awaiting", state: "ask", runId: "owned", awaitingId: "ask", mode: "question", handoff: true });
  speech(2, "notice", "notice"); expect(capture.setDetecting).toHaveBeenLastCalledWith(false);
  const count = sent().length; detect([], performance.now()); expect(sent()).toHaveLength(count); session.close();
});

it("shows initialization timeout and ignores late success while keeping button interruption", async () => {
  let finish!: () => void;
  const session = await open(); capture.enableDetection.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const enabling = session.setInterruptionMode("duplex"); speech();
  jest.advanceTimersByTime(20000); expect(patch).toHaveBeenLastCalledWith({ duplexStatus: "error", duplexError: expect.stringContaining("timed out") });
  const count = patch.mock.calls.length; finish(); await enabling; expect(patch).toHaveBeenCalledTimes(count);
  session.listen(); expect(sent().at(-1)).toMatchObject({ type: "listen", turn: 2 }); session.close();
});

it("survives 1000 alternating onset/disable/abort/close races without duplicate listen or stale playback", async () => {
  for (let i = 0; i < 1000; i++) {
    const session = await open(); await session.setInterruptionMode("duplex"); speech();
    const detect = capture.enableDetection.mock.calls.at(-1)![0];
    if (i % 4 === 0) { await session.setInterruptionMode("button"); detect([], 1); expect(sent()).toHaveLength(2); }
    if (i % 4 === 1) { session.abort(); detect([], 1); expect(sent()).toHaveLength(3); expect(sent().at(-1).type).toBe("abort"); }
    if (i % 4 === 2) { session.close(); detect([], 1); expect(sent()).toHaveLength(2); }
    if (i % 4 === 3) {
      detect([], 1); detect([], 1); expect(sent()).toHaveLength(3); ready();
      const count = player.append.mock.calls.length;
      Socket.instance.onmessage?.({ data: new ArrayBuffer(960) }); expect(player.append).toHaveBeenCalledTimes(count);
    }
    session.close();
  }
});
