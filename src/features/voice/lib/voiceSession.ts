import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";
import type { VoiceChatState } from "./voiceState";
import { VoiceAudioCapture } from "./voiceAudioCapture";
import { VoiceAudioPlayer } from "./voiceAudioPlayer";

type SessionOptions = {
  capabilities: VoiceCapabilities;
  agentKey: string;
  chatId: string;
  newChat?: boolean;
  primary?: boolean;
  voice: string;
  mode: "auto" | "manual";
  patch: (patch: Partial<VoiceChatState>) => void;
  onRun: (chatId: string, runId: string) => void;
};

// One connection owns only its microphone, playback and current media controls.
export class VoiceSession {
  private socket: WebSocket | null = null;
  private readonly capture = new VoiceAudioCapture(pcm => this.sendPCM(pcm), message => this.fail(message));
  private readonly player = new VoiceAudioPlayer(() => this.playbackDrained(), message => {
    this.playbackFailed = true;
    this.lastError = message;
    this.options.patch({ status: "error", error: message });
  });
  private closed = false;
  private ready = false;
  private listening = false;
  private recognizing = false;
  private aborting = false;
  private controlTimer: ReturnType<typeof setTimeout> | null = null;
  private turn = 0;
  private sampleRate = 24000;
  private awaiting = false;
  private runComplete = false;
  private speech: { final: boolean; done: boolean } | null = null;
  private preparingCapture: object | null = null;
  private receivingAudio = false;
  private playbackFailed = false;
  private lastError = "";

  constructor(private readonly options: SessionOptions) {}

  async prepare(): Promise<void> {
    try {
      await Promise.all([this.player.prepare(), this.capture.prepare()]);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  connect(token: string): void {
    if (this.closed) return;
    const { capabilities, agentKey, chatId, newChat, primary, voice } = this.options;
    const url = new URL(capabilities.websocketPath, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/voice/ws" || url.search || url.hash) {
      throw new Error("Invalid voice WebSocket path");
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.href, token ? [`bearer.${token}`] : []);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    this.controlTimer = setTimeout(() => this.fail("Voice handshake timed out"), 10000);
    socket.onopen = () => this.send({ type: "hello", version: 1, agentKey,
      ...(chatId ? { chatId } : {}), voice,
      ...(newChat ? { newChat: true } : {}),
      ...(primary ? { primary: true } : {}),
      audio: {
        input: { codec: "pcm_s16le", sampleRate: 16000, channels: 1, frameMs: 20 },
        output: { codec: "pcm_s16le", sampleRate: this.sampleRate },
      },
    });
    socket.onmessage = event => {
      if (this.closed) return;
      try {
        if (event.data instanceof ArrayBuffer) {
          if (!this.aborting && this.receivingAudio && !this.playbackFailed) this.player.append(event.data);
          return;
        }
        if (typeof event.data !== "string") throw new Error("Invalid voice message");
        this.receive(JSON.parse(event.data) as Record<string, unknown>);
      } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
    };
    socket.onerror = () => this.fail("Voice connection failed");
    socket.onclose = () => {
      // A server error just before close explains the disconnect better.
      if (!this.closed) this.fail(this.lastError || "Voice disconnected. Reconnect to start a new session.");
    };
  }

  private send(message: Record<string, unknown>): void {
    if (!this.closed && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private sendPCM(pcm: Uint8Array): void {
    if (!this.listening || this.aborting || this.closed || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 64000) { this.fail("Microphone send buffer exceeded"); return; }
    this.socket.send(pcm);
  }

  listen(): void {
    if (!this.ready || this.closed || this.aborting || this.recognizing || this.awaiting || this.receivingAudio || this.player.playing) return;
    if (this.preparingCapture) return;
    if (!this.capture.ready) {
      const preparation = {};
      this.preparingCapture = preparation;
      this.controlTimer = setTimeout(() => this.fail("Microphone recovery timed out"), 10000);
      this.options.patch({ status: "connecting" });
      void this.capture.prepare().then(() => {
        if (this.preparingCapture !== preparation) return;
        this.preparingCapture = null;
        this.clearTimer();
        this.listen();
      }).catch(error => {
        if (this.preparingCapture === preparation) this.fail(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    this.turn++;
    this.runComplete = false;
    this.speech = null;
    this.lastError = "";
    this.send({ type: "listen", state: "start", mode: this.options.mode });
    this.listening = true;
    this.recognizing = true;
    this.capture.start();
    this.options.patch({ status: "listening", error: "", awaiting: false });
  }

  stopListening(): void {
    if (!this.listening) return;
    this.capture.stop(true); // Keep the even short tail ahead of listen(stop).
    this.listening = false;
    this.send({ type: "listen", state: "stop", mode: this.options.mode });
    this.options.patch({ status: "thinking" });
  }

  abort(): void {
    if (!this.ready || this.closed || this.aborting) return;
    this.aborting = true;
    this.clearTimer();
    this.preparingCapture = null;
    this.listening = false;
    this.recognizing = false;
    this.receivingAudio = false;
    this.capture.stop();
    this.player.stop();
    this.options.patch({ status: "thinking", awaiting: false });
    this.send({ type: "abort", reason: "user_stop" });
    this.controlTimer = setTimeout(() => this.fail("Voice abort timed out"), 5000);
  }

  setMuted(muted: boolean): void { this.player.setMuted(muted); }

  private receive(message: Record<string, unknown>): void {
    const type = message.type;
    if (type === "hello") {
      if (this.ready || message.version !== 1 || message.agentKey !== this.options.agentKey || typeof message.chatId !== "string") throw new Error("Invalid voice hello");
      const audio = message.audio as { output?: { codec?: string; sampleRate?: number; channels?: number } } | undefined;
      if (audio?.output?.codec !== "pcm_s16le" || audio.output.channels !== 1 || ![16000, 24000].includes(audio.output.sampleRate || 0)) throw new Error("Unsupported voice output");
      this.sampleRate = audio.output.sampleRate!;
      this.ready = true;
      this.clearTimer();
      this.options.patch({ sessionActive: true, error: "" });
      this.listen();
      return;
    }
    if (type === "error") {
      const error = String(message.msg || message.code || "Voice failed");
      if (!this.ready) { this.fail(error); return; }
      if (this.aborting) return;
      // A rejected listen reports the server's previous turn, not our new one.
      if (message.code === "turn_busy") { this.fail(error); return; }
      if (message.turn !== this.turn) return;
      if (message.code === "invalid_request") {
        this.options.patch({ error }); // Only this control request was rejected.
        return;
      }
      // Recognition can finish after capture stopped, but never owns playback.
      if (["asr_failed", "recording_limit", "transcript_limit", "invalid_audio", "audio_overflow"].includes(String(message.code)) && !this.recognizing) return;
      this.endTurn(error, message.code === "tts_failed");
      return;
    }
    if (type === "abort") {
      if (!this.aborting) return;
      if (!Number.isSafeInteger(message.turn) || (message.turn as number) < 0) throw new Error("Invalid abort turn");
      this.turn = message.turn as number;
      this.clearTimer();
      this.aborting = false;
      this.awaiting = false;
      this.runComplete = false;
      this.speech = null;
      this.listen();
      return;
    }
    if (!this.ready || this.aborting || message.turn !== this.turn) return;
    if (type === "stt") {
      if (!this.recognizing) return;
      const text = String(message.text || "");
      if (text) this.options.patch({ partialUserText: text, partialAssistantText: "" });
      if (message.final === true) {
        this.capture.stop();
        this.listening = false;
        this.recognizing = false;
        if (text) this.options.patch({ status: "thinking" });
        else this.listen(); // Empty input ends no Run and needs no reconnect.
      }
    } else if (type === "run") {
      if (message.state === "start" && typeof message.chatId === "string" && typeof message.runId === "string") {
        this.options.onRun(message.chatId, message.runId);
      } else if (message.state === "end") {
        this.runComplete = message.finishReason === "complete";
        if (this.runComplete) { this.awaiting = false; this.options.patch({ awaiting: false }); }
      }
    } else if (type === "awaiting") {
      this.awaiting = true;
      this.capture.stop();
      this.listening = false;
      this.options.patch({ awaiting: true, status: "thinking" });
    } else if (type === "tts") {
      if (message.state === "start") {
        this.capture.stop();
        this.listening = false;
        this.recognizing = false;
        this.speech = { final: this.runComplete, done: false };
        this.receivingAudio = true;
        this.playbackFailed = false;
        this.player.start(this.sampleRate);
        this.options.patch({ status: "speaking", partialAssistantText: String(message.text || "") });
      } else if (message.state === "stop") {
        this.receivingAudio = false;
        if (this.speech) this.speech.done = message.reason === "done";
        if (!this.playbackFailed) this.player.finish();
      }
    }
  }

  // Keeps the connection so the user can speak again without a new hello.
  private endTurn(error: string, keepAudio = false): void {
    this.lastError = error;
    this.preparingCapture = null;
    this.clearTimer();
    this.capture.stop();
    if (!keepAudio) this.player.stop();
    this.listening = false;
    this.recognizing = false;
    this.receivingAudio = false;
    this.awaiting = false;
    this.runComplete = false;
    this.speech = null;
    this.options.patch({ status: "error", error, awaiting: false });
  }

  private playbackDrained(): void {
    if (this.closed || this.aborting || this.playbackFailed) return;
    if (this.runComplete && this.speech?.final && this.speech.done && !this.awaiting) this.listen();
    else if (this.awaiting) this.options.patch({ status: "thinking" });
  }

  private clearTimer(): void {
    if (this.controlTimer) clearTimeout(this.controlTimer);
    this.controlTimer = null;
  }

  private fail(message: string): void {
    if (this.closed) return;
    this.close();
    this.options.patch({ status: "error", error: message, sessionActive: false });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.preparingCapture = null;
    this.clearTimer();
    this.capture.close();
    this.player.close();
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }
}
