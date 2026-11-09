import * as ort from "onnxruntime-web/wasm";
import { FrameProcessor, defaultFrameProcessorOptions } from "@ricky0123/vad-web/dist/frame-processor";
import { Silero } from "@ricky0123/vad-web/dist/models/silero";
import type { Model } from "@ricky0123/vad-web/dist/models/common";
import { Message } from "@ricky0123/vad-web/dist/messages";

// Versioned, same-origin assets; no CDN, microphone, AudioContext or worker here.
const ASSET_PATH = "/assets/voice-vad/0.0.31-1.22.0/";
const FRAME_SAMPLES = 512; // Silero v5: 32ms at 16kHz.
const MAX_PENDING_SAMPLES = 4096; // 256ms, also bounds inference latency.

export class VoiceVad {
  private readonly processor: FrameProcessor;
  private active = false;
  private closed = false;
  private generation = 0;
  private samples: number[] = [];
  private processing: Promise<void> | null = null;
  private candidateAtMs = 0;
  private lastFrameAtMs = 0;

  static async create(detected: (candidateAtMs: number) => void, failed: (error: unknown) => void, signal: AbortSignal): Promise<VoiceVad> {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL(ASSET_PATH, window.location.origin).href;
    const model = await Silero.new(ort, async () => {
      const response = await fetch(`${ASSET_PATH}silero_vad_v5.onnx`, { signal });
      if (!response.ok) throw new Error(`Voice detection model unavailable (${response.status})`);
      return response.arrayBuffer();
    });
    if (signal.aborted) { await model.release(); throw new Error("Voice detection loading cancelled"); }
    return new VoiceVad(model, detected, failed);
  }

  private constructor(private readonly model: Model, private readonly detected: (candidateAtMs: number) => void,
    private readonly failed: (error: unknown) => void) {
    this.processor = new FrameProcessor(model.process, model.reset_state, {
      ...defaultFrameProcessorOptions, minSpeechMs: 160, preSpeechPadMs: 0,
      positiveSpeechThreshold: .6, negativeSpeechThreshold: .35,
      redemptionMs: 320, submitUserSpeechOnPause: false,
    }, 32);
  }

  setActive(active: boolean): void {
    if (this.closed || active === this.active) return;
    this.active = active;
    this.generation++;
    this.samples = [];
    // The model state is reset by the pump, after any in-flight inference.
    if (active && !this.processing) this.reset();
  }

  push(pcm: Uint8Array, atMs: number): void {
    if (!this.active || this.closed) return;
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    if (this.samples.length + pcm.length / 2 > MAX_PENDING_SAMPLES) {
      this.setActive(false);
      this.failed(new Error("Voice detection could not keep up. Switch to button mode."));
      return;
    }
    for (let offset = 0; offset < pcm.length; offset += 2) this.samples.push(view.getInt16(offset, true) / 32768);
    this.lastFrameAtMs = atMs;
    if (!this.processing) this.processing = this.pump().finally(() => { this.processing = null; });
  }

  private reset(): void {
    this.processor.pause(() => undefined);
    this.processor.resume();
    this.candidateAtMs = 0;
  }

  private async pump(): Promise<void> {
    let generation = this.generation;
    try {
      while (this.active && !this.closed && this.samples.length >= FRAME_SAMPLES) {
        const atMs = this.lastFrameAtMs - this.samples.length / 16;
        const frame = Float32Array.from(this.samples.splice(0, FRAME_SAMPLES));
        await this.processor.process(frame, event => {
          if (!this.active || this.closed || generation !== this.generation) return;
          if (event.msg === Message.SpeechStart) this.candidateAtMs = atMs;
          if (event.msg === Message.SpeechRealStart) this.detected(this.candidateAtMs);
        });
        if (generation !== this.generation) { this.reset(); generation = this.generation; }
        // Only onset matters. Never retain a whole utterance or speaker echo.
        this.processor.audioBuffer = [];
      }
    } catch (error) {
      if (!this.closed && generation === this.generation) { this.setActive(false); this.failed(error); }
    } finally {
      if (generation !== this.generation && !this.closed) this.reset();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    await this.processing;
    this.processor.pause(() => undefined);
    await this.model.release();
  }
}
