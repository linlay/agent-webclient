/** @jest-environment jsdom */
import { VoiceAudioPlayer } from "./voiceAudioPlayer";

class Source {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  connect = jest.fn(); disconnect = jest.fn(); start = jest.fn(); stop = jest.fn();
}
class Context {
  static current: Context;
  state = "running"; currentTime = 0; destination = {};
  sources: Source[] = [];
  buffers: { samples: Float32Array; rate: number }[] = [];
  constructor() { Context.current = this; }
  resume = jest.fn(async () => undefined); close = jest.fn(async () => undefined);
  createBuffer(_channels: number, frames: number, rate: number) {
    const samples = new Float32Array(frames); this.buffers.push({ samples, rate });
    return { getChannelData: () => samples, duration: frames / rate };
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
}
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
});
afterEach(() => { expect(jest.getTimerCount()).toBe(0); jest.useRealTimers(); });
it("uses the negotiated sample rate and waits for real playback drain including a short tail", async () => {
  const drained = jest.fn(), player = new VoiceAudioPlayer(drained, jest.fn());
  await player.prepare(); player.start(24000);
  const pcm = new Uint8Array(960); for (let i = 1; i < pcm.length; i += 2) pcm[i] = 64;
  player.append(pcm.buffer); player.append(new ArrayBuffer(2)); player.finish();
  const context = Context.current;
  expect(context.buffers[0].rate).toBe(24000);
  expect(context.buffers[0].samples[0]).toBe(.5);
  expect(context.sources[0].start).toHaveBeenCalledWith(.14);
  expect(context.sources[1].start).toHaveBeenCalledWith(.16);
  expect(drained).not.toHaveBeenCalled();
  context.sources[0].onended?.(); expect(drained).not.toHaveBeenCalled();
  context.sources[1].onended?.(); expect(drained).toHaveBeenCalledTimes(1);
  player.close();
});
it("stops every scheduled source immediately and suppresses old drain callbacks", async () => {
  const drained = jest.fn(), player = new VoiceAudioPlayer(drained, jest.fn());
  await player.prepare(); player.start(16000); player.append(new ArrayBuffer(640)); player.finish(); player.stop();
  expect(Context.current.sources[0].stop).toHaveBeenCalledTimes(1);
  expect(Context.current.sources[0].onended).toBeNull(); expect(drained).not.toHaveBeenCalled();
  player.close();
});
it("bounds total buffering and clears all pending audio on failure", async () => {
  const failed = jest.fn(), player = new VoiceAudioPlayer(jest.fn(), failed);
  await player.prepare(); player.start(16000);
  // 1000ms lead + 140ms start buffer + one in-flight frame stays schedulable.
  for (let i = 0; i < 58; i++) player.append(new ArrayBuffer(640));
  expect(failed).not.toHaveBeenCalled();
  for (let i = 0; i < 442 && !failed.mock.calls.length; i++) player.append(new ArrayBuffer(640));
  expect(failed).toHaveBeenCalledWith("Audio playback recovery buffer exceeded");
  expect(player.playing).toBe(false);
  player.close();
});

it.each(["running", "suspended"])("preserves every frame through a 2s %s interruption and drains only after recovery", async state => {
  const drained = jest.fn(), failed = jest.fn();
  const player = new VoiceAudioPlayer(drained, failed);
  await player.prepare(); player.start(24000);
  const context = Context.current;
  context.state = state;
  // A frozen audio clock may still report running and emit no device event.
  for (let i = 0; i < 100; i++) {
    const pcm = new ArrayBuffer(960); new DataView(pcm).setInt16(0, i, true);
    player.append(pcm); jest.advanceTimersByTime(20);
  }
  player.append(new ArrayBuffer(2)); player.finish();
  expect(failed).not.toHaveBeenCalled(); expect(drained).not.toHaveBeenCalled();
  if (state === "suspended") expect(context.resume).toHaveBeenCalledTimes(2); // initial preparation + recovery
  context.state = "running";
  for (let i = 0; i < 120; i++) {
    context.currentTime += .02;
    jest.advanceTimersByTime(20);
    for (const source of context.sources) {
      const start = source.start.mock.calls[0]?.[0] as number | undefined;
      if (start !== undefined && start + source.buffer!.duration <= context.currentTime) source.onended?.();
    }
  }
  expect(context.buffers).toHaveLength(101);
  expect(context.buffers.slice(0, 100).map(b => b.samples[0] * 32768)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  expect(drained).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
  expect(player.playing).toBe(false);
  player.close();
  await Promise.resolve(); await Promise.resolve();
});

it("bounds recovery even after tts.stop, and releases its timer and sources", async () => {
  const failed = jest.fn(), drained = jest.fn(), player = new VoiceAudioPlayer(drained, failed);
  await player.prepare(); player.start(16000); player.append(new ArrayBuffer(640)); player.finish();
  jest.advanceTimersByTime(10000);
  expect(failed).toHaveBeenCalledTimes(1); expect(drained).not.toHaveBeenCalled();
  expect(Context.current.sources[0].stop).toHaveBeenCalledTimes(1);
  player.close();
});

it("does not resurrect buffered audio when resume completes after close", async () => {
  const failed = jest.fn(), drained = jest.fn(), player = new VoiceAudioPlayer(drained, failed);
  await player.prepare(); player.start(16000);
  const context = Context.current;
  let resumed!: () => void;
  context.state = "suspended";
  context.resume.mockImplementationOnce(() => new Promise(resolve => { resumed = resolve; }));
  player.append(new ArrayBuffer(640)); player.finish(); player.close();
  context.state = "running"; resumed();
  await Promise.resolve(); await Promise.resolve();
  expect(context.sources).toHaveLength(0); expect(drained).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
});

it("schedules the final buffered frame as soon as resume resolves, without another network frame", async () => {
  const drained = jest.fn(), player = new VoiceAudioPlayer(drained, jest.fn());
  await player.prepare(); player.start(16000);
  const context = Context.current;
  context.state = "suspended";
  context.resume.mockImplementationOnce(async () => { context.state = "running"; });
  player.append(new ArrayBuffer(2)); player.finish();
  expect(drained).not.toHaveBeenCalled();
  await Promise.resolve(); await Promise.resolve();
  expect(context.sources).toHaveLength(1);
  context.sources[0].onended?.();
  expect(drained).toHaveBeenCalledTimes(1);
  player.close();
});

it("reports the first output clock crossing once, without treating scheduling as playback", async () => {
  const started = jest.fn(), player = new VoiceAudioPlayer(jest.fn(), jest.fn(), started);
  await player.prepare(); player.start(24000); player.append(new ArrayBuffer(960));
  const context = Context.current;
  const timestamp = jest.fn(() => ({ contextTime: .13, performanceTime: 180 }));
  Object.assign(context, { getOutputTimestamp: timestamp });
  expect(started).not.toHaveBeenCalled();
  context.currentTime = .18;
  jest.advanceTimersByTime(200);
  expect(started).not.toHaveBeenCalled(); // Render clock passed start; output clock has not.
  timestamp.mockReturnValue({ contextTime: .16, performanceTime: 280 });
  jest.advanceTimersByTime(100);
  expect(started).toHaveBeenCalledTimes(1);
  expect(started.mock.calls[0][0]).toMatchObject({ audioTime: .14, clockSource: "output_timestamp" });
  expect(started.mock.calls[0][0].atMs).toBeCloseTo(260);
  context.sources[0].onended?.();
  expect(started).toHaveBeenCalledTimes(1);
  player.close();
});

it("labels the context-clock fallback and waits through suspension", async () => {
  const started = jest.fn(), player = new VoiceAudioPlayer(jest.fn(), jest.fn(), started);
  await player.prepare(); player.start(16000); player.append(new ArrayBuffer(640));
  const context = Context.current;
  context.state = "suspended"; context.currentTime = .15;
  jest.advanceTimersByTime(1000);
  expect(started).not.toHaveBeenCalled();
  context.state = "running";
  jest.advanceTimersByTime(100);
  expect(started.mock.calls[0][0]).toMatchObject({ audioTime: .14, clockSource: "context_clock" });
  expect(started.mock.calls[0][0].atMs).toBeCloseTo(1090);
  player.close();
  await Promise.resolve(); await Promise.resolve();
});

it.each(["stop", "mute"])("does not report a cancelled first source after %s", async action => {
  const started = jest.fn(), player = new VoiceAudioPlayer(jest.fn(), jest.fn(), started);
  await player.prepare(); player.start(16000); player.append(new ArrayBuffer(640));
  const context = Context.current, lateEnd = context.sources[0].onended!;
  if (action === "stop") player.stop(); else player.setMuted(true);
  context.currentTime = 1;
  jest.advanceTimersByTime(1000); lateEnd();
  expect(started).not.toHaveBeenCalled();
  player.close();
});
