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
beforeEach(() => Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context }));
it("uses the negotiated sample rate and waits for real playback drain including a short tail", async () => {
  const drained = jest.fn(), player = new VoiceAudioPlayer(drained);
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
  const drained = jest.fn(), player = new VoiceAudioPlayer(drained);
  await player.prepare(); player.start(16000); player.append(new ArrayBuffer(640)); player.finish(); player.stop();
  expect(Context.current.sources[0].stop).toHaveBeenCalledTimes(1);
  expect(Context.current.sources[0].onended).toBeNull(); expect(drained).not.toHaveBeenCalled();
  player.close();
});
it("accepts the largest Platform downlink lead but rejects a runaway sender", async () => {
  const player = new VoiceAudioPlayer(jest.fn());
  await player.prepare(); player.start(16000);
  // 1000ms lead + 140ms start buffer + one in-flight frame stays schedulable.
  for (let i = 0; i < 58; i++) player.append(new ArrayBuffer(640));
  expect(() => { for (let i = 0; i < 20; i++) player.append(new ArrayBuffer(640)); }).toThrow("Audio playback buffer exceeded");
  player.close();
});
