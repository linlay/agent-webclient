/** @jest-environment jsdom */
import { AudioCapture } from "./audioCapture";

const trackStop = jest.fn();
const media = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
const getUserMedia = jest.fn();
class Context {
  static current: Context;
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
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
});

it("uses actual sampling rate, emits 20ms frames, then flushes the even tail once", async () => {
  getUserMedia.mockResolvedValue(media);
  const send = jest.fn(); const capture = new AudioCapture(send);
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
  const capture = new AudioCapture(jest.fn());
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
  const send = jest.fn(); const capture = new AudioCapture(send);
  await capture.prepare(); capture.start();
  expect(contexts.map(context => context.options?.sampleRate)).toEqual([16000, undefined]);
  expect(contexts[0].close).toHaveBeenCalledTimes(1);
  expect(contexts[1].resume).toHaveBeenCalledTimes(1);
  contexts[1].processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(.5) } });
  expect(send.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([640]);
  capture.close();
  expect(contexts[1].close).toHaveBeenCalledTimes(1);
});
