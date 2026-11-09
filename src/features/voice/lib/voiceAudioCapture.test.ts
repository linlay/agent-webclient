/** @jest-environment jsdom */
import { VoiceAudioCapture } from "./voiceAudioCapture";
import { VoiceVad } from "./voiceVad";
jest.mock("./voiceVad", () => ({ VoiceVad: { create: jest.fn() } }));

const trackStop = jest.fn();
const track = { stop: trackStop, readyState: "live", onended: null as (() => void) | null };
const media = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = jest.fn();
class Context {
  static current: Context;
  state = "running";
  onstatechange: (() => void) | null = null;
  sampleRate = 48000; // The browser may ignore the requested 16kHz.
  resume = jest.fn(async () => undefined);
  close = jest.fn(async () => undefined);
  destination = {};
  processor = { onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null, connect: jest.fn(), disconnect: jest.fn() };
  source = { connect: jest.fn(), disconnect: jest.fn() };
  constructor() { Context.current = this; }
  createMediaStreamSource() { return this.source; }
  createScriptProcessor() { return this.processor; }
}
beforeEach(() => {
  jest.clearAllMocks();
  track.readyState = "live"; track.onended = null;
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
});

it("uses actual sampling rate, emits 20ms frames, then flushes the even tail once", async () => {
  getUserMedia.mockResolvedValue(media);
  const send = jest.fn(); const capture = new VoiceAudioCapture(send, jest.fn());
  await capture.prepare(); capture.start();
  Context.current.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(.5) } });
  expect(send.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([640]);
  capture.stop(true); capture.stop(true);
  expect(send.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([640, 42]);
  capture.close();
  expect(trackStop).toHaveBeenCalledTimes(1);
  expect(Context.current.close).toHaveBeenCalledTimes(1);
  expect(Context.current.processor.onaudioprocess).toBeNull();
});

it("releases a late microphone grant after the session was closed", async () => {
  let grant!: (media: MediaStream) => void;
  getUserMedia.mockReturnValue(new Promise<MediaStream>(resolve => { grant = resolve; }));
  const capture = new VoiceAudioCapture(jest.fn(), jest.fn());
  const preparing = capture.prepare(); capture.close(); grant(media); await preparing;
  expect(trackStop).toHaveBeenCalledTimes(1);
  expect(Context.current.source.connect).not.toHaveBeenCalled();
});

it("falls back to the default context rate when the microphone rejects a 16kHz context", async () => {
  getUserMedia.mockResolvedValue(media);
  const contexts: Rejecting[] = [];
  class Rejecting extends Context {
    constructor(readonly options?: AudioContextOptions) { super(); contexts.push(this); }
    createMediaStreamSource() {
      if (this.options?.sampleRate) throw new DOMException("different sample-rate", "NotSupportedError");
      return this.source;
    }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Rejecting });
  const send = jest.fn(); const capture = new VoiceAudioCapture(send, jest.fn());
  await capture.prepare(); capture.start();
  expect(contexts.map(context => context.options?.sampleRate)).toEqual([16000, undefined]);
  expect(contexts[0].close).toHaveBeenCalledTimes(1);
  expect(contexts[1].resume).toHaveBeenCalledTimes(1);
  contexts[1].processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(.5) } });
  expect(send.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([640]);
  capture.close();
  expect(contexts[1].close).toHaveBeenCalledTimes(1);
});

it("resumes a suspended context and replaces an ended track without leaking its old graph", async () => {
  getUserMedia.mockResolvedValue(media);
  const capture = new VoiceAudioCapture(jest.fn(), jest.fn());
  await capture.prepare();
  const original = Context.current;
  original.state = "suspended";
  original.resume.mockImplementation(async () => { original.state = "running"; });
  await capture.prepare(); capture.start(); capture.stop();
  expect(original.resume).toHaveBeenCalledTimes(2);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  track.readyState = "ended";
  const replacement = { ...track, readyState: "live" };
  getUserMedia.mockResolvedValue({ getTracks: () => [replacement], getAudioTracks: () => [replacement] });
  await capture.prepare(); capture.start();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(original.source.disconnect).toHaveBeenCalledTimes(1);
  expect(original.close).toHaveBeenCalledTimes(1);
  expect(capture.ready).toBe(true);
  capture.close();
});

it.each(["track", "context"])("reports a lost %s during capture and removes listeners on close", async kind => {
  getUserMedia.mockResolvedValue(media);
  const failed = jest.fn();
  const capture = new VoiceAudioCapture(jest.fn(), failed);
  await capture.prepare(); capture.start();
  if (kind === "track") { track.readyState = "ended"; track.onended?.(); }
  else { Context.current.state = "suspended"; Context.current.onstatechange?.(); }
  expect(failed).toHaveBeenCalledTimes(1);
  capture.close();
  expect(track.onended).toBeNull();
  expect(Context.current.onstatechange).toBeNull();
});

it("coalesces preparation and rejects a context that could not resume", async () => {
  getUserMedia.mockResolvedValue(media);
  const capture = new VoiceAudioCapture(jest.fn(), jest.fn());
  const first = capture.prepare();
  expect(capture.prepare()).toBe(first);
  await first;
  Context.current.state = "suspended";
  await expect(capture.prepare()).rejects.toThrow("could not resume");
  expect(() => capture.start()).toThrow("not ready");
  capture.close();
});


it("detects on the existing microphone, keeps only 480ms locally and never uploads playback monitoring", async () => {
  let detected!: (candidate: number) => void;
  const vad = { push: jest.fn(), setActive: jest.fn(), close: jest.fn(async () => undefined) };
  jest.mocked(VoiceVad.create).mockImplementation(async callback => { detected = callback; return vad as unknown as VoiceVad; });
  getUserMedia.mockResolvedValue(media);
  const send = jest.fn(), onset = jest.fn(); const capture = new VoiceAudioCapture(send, jest.fn());
  await capture.prepare(); await capture.enableDetection(onset, jest.fn()); capture.setDetecting(true);
  for (let i = 0; i < 60; i++) Context.current.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(.5) } });
  expect(send).not.toHaveBeenCalled(); expect(vad.push).toHaveBeenCalled();
  detected(1);
  const buffered = onset.mock.calls[0][0] as Uint8Array[];
  expect(buffered.reduce((sum, frame) => sum + frame.length, 0)).toBeLessThanOrEqual(15360);
  expect(buffered[0][1]).not.toBe(0);
  capture.setDetecting(false); detected(2); expect(onset).toHaveBeenCalledTimes(1);
  capture.start(); Context.current.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024) } });
  expect(send).toHaveBeenCalled(); capture.disableDetection();
  expect(trackStop).not.toHaveBeenCalled(); expect(Context.current.close).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  capture.close(); expect(vad.close).toHaveBeenCalledTimes(1); expect(trackStop).toHaveBeenCalledTimes(1);
});

it("drops stale pre-recording after the tab's audio callbacks stall", async () => {
  let detected!: (candidate: number) => void;
  const vad = { push: jest.fn(), setActive: jest.fn(), close: jest.fn(async () => undefined) };
  jest.mocked(VoiceVad.create).mockImplementation(async callback => { detected = callback; return vad as unknown as VoiceVad; });
  getUserMedia.mockResolvedValue(media);
  const now = jest.spyOn(performance, "now").mockReturnValue(1000);
  const onset = jest.fn(), capture = new VoiceAudioCapture(jest.fn(), jest.fn());
  await capture.prepare(); await capture.enableDetection(onset, jest.fn()); capture.setDetecting(true);
  Context.current.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(.5) } });
  now.mockReturnValue(2000); detected(1000);
  expect(onset.mock.calls[0][0]).toEqual([]); capture.close(); now.mockRestore();
});

it("destroys late model initialization after exit without acquiring another stream", async () => {
  let finish!: (vad: VoiceVad) => void;
  const vad = { close: jest.fn(async () => undefined) };
  jest.mocked(VoiceVad.create).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  getUserMedia.mockResolvedValue(media);
  const capture = new VoiceAudioCapture(jest.fn(), jest.fn()); await capture.prepare();
  const enabling = capture.enableDetection(jest.fn(), jest.fn());
  for (let i = 0; i < 4; i++) await Promise.resolve();
  capture.close(); finish(vad as unknown as VoiceVad); await enabling;
  expect(vad.close).toHaveBeenCalledTimes(1); expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(jest.mocked(VoiceVad.create).mock.calls.at(-1)![2].aborted).toBe(true);
});
