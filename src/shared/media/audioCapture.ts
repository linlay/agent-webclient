import { Pcm16Encoder, PCM_FRAME_BYTES } from "./pcmAudio";

export class AudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private encoder: Pcm16Encoder | null = null;
  private remain = new Uint8Array(0);
  private listening = false;
  private disposed = false;

  constructor(private readonly send: (pcm: Uint8Array) => void) {}

  async prepare(): Promise<void> {
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
      if (!this.listening || !this.encoder) return;
      const bytes = this.encoder.encode(event.inputBuffer.getChannelData(0));
      const merged = new Uint8Array(this.remain.length + bytes.length);
      merged.set(this.remain);
      merged.set(bytes, this.remain.length);
      let offset = 0;
      while (offset + PCM_FRAME_BYTES <= merged.length) {
        this.send(merged.slice(offset, offset + PCM_FRAME_BYTES));
        offset += PCM_FRAME_BYTES;
      }
      this.remain = merged.slice(offset);
    };
    this.source.connect(this.processor);
    this.processor.connect(context.destination);
  }

  start(): void {
    if (!this.context || this.disposed) return;
    this.encoder = new Pcm16Encoder(this.context.sampleRate);
    this.remain = new Uint8Array(0);
    this.listening = true;
  }

  stop(flush = false): void {
    this.listening = false;
    if (flush && this.remain.length) this.send(this.remain);
    this.remain = new Uint8Array(0);
  }

  close(): void {
    this.disposed = true;
    this.stop();
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
