export class VoiceAudioPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private cursor = 0;
  private sampleRate = 24000;
  private ended = false;
  private muted = false;

  constructor(private readonly drained: () => void) {}

  async prepare(): Promise<void> {
    const context = new AudioContext();
    this.context = context;
    await context.resume();
    if (context.state !== "running") throw new Error("Audio playback requires a user gesture");
  }

  start(sampleRate: number): void {
    this.stop();
    this.sampleRate = sampleRate;
    this.ended = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      // Discard scheduled sound, but let the protocol's tts.stop close the task.
      const ended = this.ended;
      this.stop();
      if (ended) this.drained();
    }
  }

  append(bytes: ArrayBuffer): void {
    const context = this.context;
    if (!context || context.state !== "running") throw new Error("Audio playback is suspended");
    if (!bytes.byteLength || bytes.byteLength % 2 || bytes.byteLength > this.sampleRate * .04) throw new Error("Invalid PCM frame");
    if (this.muted) return;
    if (this.cursor - context.currentTime > 1) throw new Error("Audio playback buffer exceeded");
    const view = new DataView(bytes);
    const buffer = context.createBuffer(1, bytes.byteLength / 2, this.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      this.checkDrained();
    };
    // 140ms initial local buffer; tts.stop still waits for actual source endings.
    const startAt = Math.max(context.currentTime + (this.cursor ? .005 : .14), this.cursor);
    this.cursor = startAt + buffer.duration;
    source.start(startAt);
  }

  finish(): void {
    this.ended = true;
    this.checkDrained();
  }

  private checkDrained(): void {
    if (this.ended && !this.sources.size) {
      this.ended = false;
      this.drained();
    }
  }

  stop(): void {
    this.ended = false;
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.cursor = 0;
  }

  close(): void {
    this.stop();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
