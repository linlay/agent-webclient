import { AudioCapture } from "@/shared/media/audioCapture";

export type DictationStatus = "ready" | "connecting" | "listening" | "finishing" | "error";
export type DictationResult = { text: string } | { cancelled: true } | { error: string };

// One connection owns one recording. No Chat, Run, playback or reconnect state.
export class DictationSession {
  private readonly capture = new AudioCapture(pcm => this.sendPCM(pcm));
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private listening = false;
  private receivedReady = false;
  private finishRequested = false;
  private sentBytes = 0;
  private settle!: (result: DictationResult) => void;
  readonly result = new Promise<DictationResult>(resolve => { this.settle = resolve; });

  constructor(private readonly options: {
    onText: (text: string) => void;
    onStatus: (status: DictationStatus) => void;
  }) {}

  // Invoked synchronously from the user gesture, before authentication awaits.
  prepare(): Promise<void> { return this.capture.prepare(); }

  connect(token: string): void {
    if (this.closed) return;
    const url = new URL("/api/dictation/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.href, token ? [`bearer.${token}`] : []);
    this.socket = socket;
    this.deadline(15000);
    socket.onopen = () => this.sendControl("start");
    socket.onmessage = event => {
      if (this.closed) return;
      try {
        if (typeof event.data !== "string") throw new Error("invalid_response");
        const message: unknown = JSON.parse(event.data);
        if (!message || typeof message !== "object" || !("type" in message)) throw new Error("invalid_response");
        if (message.type === "ready") {
          if (this.receivedReady) throw new Error("invalid_response");
          this.receivedReady = true;
          this.listening = true;
          if (this.finishRequested) { this.stopRecording(); return; }
          this.capture.start();
          this.options.onStatus("listening");
          this.clearTimer(); this.timer = setTimeout(() => this.finish(), 60000);
        } else if ((message.type === "partial" || message.type === "final") && "text" in message && typeof message.text === "string") {
          if (!this.receivedReady) throw new Error("invalid_response");
          this.options.onText(message.text);
          if (message.type === "final") this.complete({ text: message.text });
        } else if (message.type === "error") {
          this.fail("recognition_failed");
        } else throw new Error("invalid_response");
      } catch { this.fail("invalid_response"); }
    };
    socket.onerror = () => this.fail("connection_failed");
    socket.onclose = () => this.fail("disconnected");
  }

  finish(): Promise<DictationResult> {
    if (!this.closed && !this.finishRequested) {
      this.finishRequested = true;
      this.options.onStatus("finishing");
      if (this.listening) this.stopRecording();
    }
    return this.result;
  }

  cancel(): void { this.complete({ cancelled: true }); }
  fail(error: string): void { this.complete({ error }); }

  private stopRecording(): void {
    this.capture.stop(true); // Tail must precede stop and resource disposal.
    this.listening = false;
    this.capture.close();
    this.sendControl("stop");
    if (!this.closed) this.deadline(15000);
  }

  private sendPCM(pcm: Uint8Array): void {
    if (this.closed || !this.listening || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 64000) { this.fail("audio_overflow"); return; }
    const remaining = 1920000 - this.sentBytes;
    if (remaining > 0) {
      const frame = pcm.subarray(0, remaining);
      try { this.socket.send(frame); this.sentBytes += frame.length; }
      catch { this.fail("connection_failed"); return; }
    }
    // Finish outside the capture callback to avoid flushing its old tail twice.
    if (this.sentBytes === 1920000 && !this.finishRequested) queueMicrotask(() => this.finish());
  }

  private sendControl(type: "start" | "stop"): void {
    if (!this.closed && this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({ type })); }
      catch { this.fail("connection_failed"); }
    }
  }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private deadline(ms: number): void { this.clearTimer(); this.timer = setTimeout(() => this.fail("timeout"), ms); }
  private complete(result: DictationResult): void {
    if (this.closed) return;
    this.closed = true; this.clearTimer(); this.capture.close();
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close(); this.socket = null;
    }
    this.options.onStatus("error" in result ? "error" : "ready");
    this.settle(result);
  }
}
