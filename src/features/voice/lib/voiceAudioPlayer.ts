// Covers Platform's largest downlink lead (1000ms) plus the local start buffer.
const MAX_SCHEDULED_SECONDS = 1.5;
const MAX_BUFFERED_SECONDS = 10;
const RECOVERY_TIMEOUT_MS = 10000;

export type VoicePlayStart = { atMs: number; audioTime: number; clockSource: "output_timestamp" | "context_clock" };

export class VoiceAudioPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private cursor = 0;
  private sampleRate = 24000;
  private ended = false;
  private muted = false;
  private pending: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastClock = 0;
  private lastProgress = 0;
  private resumeAt = 0;
  private resuming = false;
  private firstStart: number | null = null;
  private startReported = false;

  constructor(private readonly drained: () => void, private readonly failed: (message: string) => void,
    private readonly started?: (point: VoicePlayStart) => void) {}

  get playing(): boolean { return this.pending.length > 0 || this.sources.size > 0; }

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
    if (!context) return;
    if (!bytes.byteLength || bytes.byteLength % 2 || bytes.byteLength > this.sampleRate * .04) throw new Error("Invalid PCM frame");
    if (this.muted) return;
    const buffered = (this.pendingBytes + bytes.byteLength) / (this.sampleRate * 2) + Math.max(0, this.cursor - context.currentTime);
    if (buffered > MAX_BUFFERED_SECONDS) { this.fail("Audio playback recovery buffer exceeded"); return; }
    this.pending.push(bytes);
    this.pendingBytes += bytes.byteLength;
    if (!this.timer) {
      this.lastClock = context.currentTime;
      this.lastProgress = performance.now();
      this.timer = setInterval(() => this.pump(), 100);
    }
    this.pump();
  }

  // Keep one context and all unplayed PCM through a short device interruption.
  // Progress polling also covers headphone jacks that emit no devicechange.
  private pump(): void {
    const context = this.context;
    if (!context || !this.playing) return;
    try {
      this.observeStart(context);
      const now = performance.now();
      if (context.currentTime > this.lastClock) {
        this.lastClock = context.currentTime;
        this.lastProgress = now;
      }
      if (context.state === "closed" || now - this.lastProgress >= RECOVERY_TIMEOUT_MS) {
        this.fail("Audio playback could not resume");
        return;
      }
      if (context.state !== "running") {
        if (!this.resuming && now >= this.resumeAt) {
          this.resuming = true;
          this.resumeAt = now + 1000;
          void context.resume().catch(() => undefined).finally(() => {
            this.resuming = false;
            if (this.context === context) this.pump();
          });
        }
        return;
      }
      while (this.pending.length && this.cursor - context.currentTime < MAX_SCHEDULED_SECONDS) {
        const bytes = this.pending.shift()!;
        this.pendingBytes -= bytes.byteLength;
        this.schedule(context, bytes);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private schedule(context: AudioContext, bytes: ArrayBuffer): void {
    const view = new DataView(bytes);
    const buffer = context.createBuffer(1, bytes.byteLength / 2, this.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.sources.add(source);
    source.onended = () => {
      if (!this.sources.has(source)) return;
      this.observeStart(context);
      this.sources.delete(source);
      source.disconnect();
      this.pump();
      this.checkDrained();
    };
    // 140ms initial local buffer; tts.stop still waits for actual source endings.
    const startAt = Math.max(context.currentTime + (this.cursor ? .005 : .14), this.cursor);
    this.cursor = startAt + buffer.duration;
    source.start(startAt);
    if (this.firstStart === null) this.firstStart = startAt;
  }

  // A scheduled future source is not playback. Observe the audio clock crossing
  // its start, then map that instant onto this page's performance clock.
  private observeStart(context: AudioContext): void {
    if (!this.started || this.startReported || this.firstStart === null || context.state !== "running" || context.currentTime < this.firstStart) return;
    const now = performance.now();
    let atMs: number;
    let clockSource: VoicePlayStart["clockSource"];
    if (typeof context.getOutputTimestamp === "function") {
      let stamp: AudioTimestamp;
      try { stamp = context.getOutputTimestamp(); } catch { return; }
      if (!Number.isFinite(stamp.contextTime) || !Number.isFinite(stamp.performanceTime) || stamp.contextTime! < this.firstStart || stamp.performanceTime! <= 0) return;
      atMs = stamp.performanceTime! + (this.firstStart - stamp.contextTime!) * 1000;
      clockSource = "output_timestamp";
    } else {
      atMs = now - (context.currentTime - this.firstStart) * 1000;
      clockSource = "context_clock";
    }
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > now) return;
    this.startReported = true;
    this.started({ atMs, audioTime: this.firstStart, clockSource });
  }

  finish(): void {
    this.ended = true;
    this.checkDrained();
  }

  private checkDrained(): void {
    if (this.playing) return;
    this.clearTimer();
    if (this.ended) {
      this.ended = false;
      this.drained();
    }
  }

  stop(): void {
    this.firstStart = null;
    this.startReported = false;
    this.clearTimer();
    this.pending = [];
    this.pendingBytes = 0;
    this.ended = false;
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.cursor = 0;
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private fail(message: string): void {
    this.stop();
    this.failed(message);
  }

  close(): void {
    this.stop();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
