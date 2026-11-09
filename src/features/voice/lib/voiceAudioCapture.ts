import { Pcm16Encoder, VOICE_CHAT_FRAME_BYTES } from "./voiceChatAudio";
import type { VoiceVad } from "./voiceVad";

const PRE_ROLL_MS = 480;
const PRE_ROLL_BYTES = 16000 * 2 * PRE_ROLL_MS / 1000;

export class VoiceAudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private encoder: Pcm16Encoder | null = null;
  private remain = new Uint8Array(0);
  private lastPCMAtMs = 0;
  private listening = false;
  private disposed = false;
  private preparing: Promise<void> | null = null;
  private vad: VoiceVad | null = null;
  private vadGeneration = 0;
  private vadLoading: AbortController | null = null;
  private detecting = false;
  private preRoll: { pcm: Uint8Array; atMs: number }[] = [];

  constructor(private readonly send: (pcm: Uint8Array) => void, private readonly failed: (message: string) => void) {}

  get ready(): boolean {
    return !this.disposed && this.context?.state === "running" && this.liveTrack;
  }

  private get liveTrack(): boolean {
    return this.stream?.getAudioTracks().some(track => track.readyState === "live") === true;
  }

  prepare(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Microphone closed"));
    if (!this.preparing) this.preparing = this.prepareMedia().finally(() => { this.preparing = null; });
    return this.preparing;
  }

  private async prepareMedia(): Promise<void> {
    if (this.ready) return;
    if (this.context && this.context.state !== "closed" && this.liveTrack) {
      await this.context.resume();
      if (!this.disposed && !this.ready) throw new Error("Microphone could not resume");
      return;
    }
    this.releaseMedia();
    // Called from the user's gesture, before the permission await.
    this.context = new AudioContext({ sampleRate: 16000 });
    const resumed = this.context.resume().then(() => null, (error: unknown) => error);
    const permission = navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } });
    const stream = await permission;
    if (this.disposed) {
      stream.getTracks().forEach(track => track.stop());
      await resumed;
      return;
    }
    this.stream = stream;
    const resumeError = await resumed;
    if (resumeError) throw resumeError;
    let context = this.context;
    if (!context || this.disposed) return;
    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(stream);
    } catch (error) {
      // Firefox cannot connect a microphone to a context at another sample
      // rate; the encoder resamples from the default context's rate instead.
      if (!(error instanceof DOMException) || error.name !== "NotSupportedError") throw error;
      void context.close().catch(() => undefined);
      context = new AudioContext();
      this.context = context;
      await context.resume();
      if (this.disposed) return;
      source = context.createMediaStreamSource(stream);
    }
    this.source = source;
    this.processor = context.createScriptProcessor(1024, 1, 1);
    this.processor.onaudioprocess = event => {
      if ((!this.listening && !this.detecting) || !this.encoder) return;
      const bytes = this.encoder.encode(event.inputBuffer.getChannelData(0));
      this.lastPCMAtMs = performance.now();
      const merged = new Uint8Array(this.remain.length + bytes.length);
      merged.set(this.remain);
      merged.set(bytes, this.remain.length);
      let offset = 0;
      while (offset + VOICE_CHAT_FRAME_BYTES <= merged.length) {
        const pcm = merged.slice(offset, offset + VOICE_CHAT_FRAME_BYTES);
        if (this.listening) this.send(pcm);
        else if (this.detecting) {
          const atMs = performance.now();
          this.preRoll.push({ pcm, atMs });
          while (this.preRoll.length * VOICE_CHAT_FRAME_BYTES > PRE_ROLL_BYTES || this.preRoll[0]?.atMs < atMs - PRE_ROLL_MS) this.preRoll.shift();
          this.vad?.push(pcm, atMs);
        }
        offset += VOICE_CHAT_FRAME_BYTES;
      }
      this.remain = merged.slice(offset);
    };
    this.source.connect(this.processor);
    this.processor.connect(context.destination);
    const unavailable = () => {
      if ((this.listening || this.detecting) && !this.ready) this.failed("Microphone unavailable. Reconnect to speak again.");
    };
    context.onstatechange = unavailable;
    stream.getAudioTracks().forEach(track => { track.onended = unavailable; });
    if (!this.ready) throw new Error("Microphone could not start");
  }

  start(preRollTail?: Uint8Array): void {
    if (!this.ready || !this.context) throw new Error("Microphone is not ready");
    if (!preRollTail || !this.encoder) this.encoder = new Pcm16Encoder(this.context.sampleRate);
    this.remain = preRollTail?.slice() || new Uint8Array(0);
    this.listening = true;
  }

  async enableDetection(detected: (preRoll: Uint8Array[], candidateAtMs: number) => void, failed: (error: unknown) => void): Promise<void> {
    const generation = ++this.vadGeneration;
    const loading = new AbortController();
    this.vadLoading = loading;
    const { VoiceVad } = await import(/* webpackChunkName: "voice-vad" */ "./voiceVad");
    if (this.disposed || generation !== this.vadGeneration) return;
    const vad = await VoiceVad.create(candidateAtMs => {
      if (!this.detecting || this.disposed || generation !== this.vadGeneration) return;
      const cutoff = performance.now() - PRE_ROLL_MS;
      const pcm = this.preRoll.filter(frame => frame.atMs >= cutoff).map(frame => frame.pcm);
      // Include the unsent even tail, while preserving the byte cap.
      if (this.remain.length && this.lastPCMAtMs >= cutoff) pcm.push(this.remain.slice());
      while (pcm.reduce((sum, frame) => sum + frame.length, 0) > PRE_ROLL_BYTES) pcm.shift();
      detected(pcm, candidateAtMs);
    }, error => {
      if (!this.disposed && generation === this.vadGeneration) failed(error);
    }, loading.signal);
    if (this.disposed || generation !== this.vadGeneration) { await vad.close(); return; }
    this.vadLoading = null;
    if (!this.ready) { await vad.close(); throw new Error("Microphone is not ready for voice detection"); }
    this.vad = vad;
  }

  setDetecting(active: boolean): void {
    active = active && Boolean(this.vad) && !this.disposed;
    if (active === this.detecting) return;
    this.detecting = active;
    this.preRoll = [];
    this.vad?.setActive(active);
    if (active && !this.listening && this.context) {
      this.encoder = new Pcm16Encoder(this.context.sampleRate);
      this.remain = new Uint8Array(0);
    }
  }

  disableDetection(): void {
    this.vadGeneration++;
    this.vadLoading?.abort();
    this.vadLoading = null;
    this.setDetecting(false);
    const vad = this.vad;
    this.vad = null;
    void vad?.close().catch(() => undefined);
  }

  stop(flush = false): void {
    this.listening = false;
    if (flush && this.remain.length) this.send(this.remain);
    this.remain = new Uint8Array(0);
  }

  close(): void {
    this.disposed = true;
    this.releaseMedia();
  }

  private releaseMedia(): void {
    this.disableDetection();
    this.stop();
    if (this.context) this.context.onstatechange = null;
    this.stream?.getAudioTracks().forEach(track => { track.onended = null; });
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    void this.context?.close().catch(() => undefined);
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}
