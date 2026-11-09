import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";
import type { VoiceChatState, VoiceInterruptionMode } from "./voiceState";
import { VoiceAudioCapture } from "./voiceAudioCapture";
import { VoiceAudioPlayer } from "./voiceAudioPlayer";
import { VOICE_CHAT_FRAME_BYTES } from "./voiceChatAudio";
import { emitVoiceTiming } from "./voiceTiming";
import type { VoiceTimingPoint, VoiceTimingStage } from "./voiceTiming";

type SessionOptions = {
  capabilities: VoiceCapabilities;
  agentKey: string;
  chatId: string;
  newChat?: boolean;
  primary?: boolean;
  voice: string;
  interruptionMode?: VoiceInterruptionMode;
  patch: (patch: Partial<VoiceChatState>) => void;
  onRun: (chatId: string, runId: string) => void;
};

// One connection owns only its microphone, playback and current media controls.
export class VoiceSession {
  private socket: WebSocket | null = null;
  private readonly capture = new VoiceAudioCapture(pcm => this.sendPCM(pcm), message => this.fail(message));
  private readonly player = new VoiceAudioPlayer(() => this.playbackDrained(), message => {
    this.playbackFailed = true;
    this.capture.setDetecting(false);
    this.lastError = message;
    this.endTiming("error");
    this.options.patch({ status: "error", error: message });
  }, point => {
    if (this.closed || this.aborting || !this.speech) return;
    this.timing("playStart", point.atMs, { clockSource: point.clockSource });
  });
  private closed = false;
  private ready = false;
  private listening = false;
  private recognizing = false;
  private aborting = false;
  private controlTimer: ReturnType<typeof setTimeout> | null = null;
  private turn = 0;
  private sessionId = "";
  private runId = "";
  private listenRequestId = "";
  private pendingListen: { pcm: Uint8Array[]; bytes: number; limit: number; stop: boolean } | null = null;
  private sampleRate = 24000;
  private awaiting = false;
  private awaitingId = "";
  private questionId = "";
  private inputAwaitingId = "";
  private speech: { id: string; purpose: "final" | "question" | "notice"; done: boolean; awaitingId: string } | null = null;
  private preparingCapture: object | null = null;
  private receivingAudio = false;
  private playbackFailed = false;
  private lastError = "";
  private timingOpen = false;
  private timingRunId = "";
  private interruptionMode: VoiceInterruptionMode = "button";
  private duplexReady = false;
  private modeGeneration = 0;
  private modeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SessionOptions) {}

  get isClosed(): boolean { return this.closed; }

  async prepare(): Promise<void> {
    try {
      await Promise.all([this.player.prepare(), this.capture.prepare()]);
      // Detection loading does not block ordinary capture or the handshake.
      void this.setInterruptionMode(this.options.interruptionMode || "button");
    } catch (error) {
      this.close();
      throw error;
    }
  }

  connect(token: string): void {
    if (this.closed) return;
    const { capabilities, agentKey, chatId, newChat, primary, voice } = this.options;
    if (capabilities.version !== 2) throw new Error("Unsupported voice protocol version");
    const url = new URL(capabilities.websocketPath, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/voice/ws" || url.search || url.hash) {
      throw new Error("Invalid voice WebSocket path");
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.href, token ? [`bearer.${token}`] : []);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    this.controlTimer = setTimeout(() => this.fail("Voice handshake timed out"), 10000);
    socket.onopen = () => this.send({ type: "hello", version: 2, agentKey, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    if (this.pendingListen) {
      // At most 500ms on this connection while waiting for the media boundary.
      if (this.pendingListen.bytes + pcm.byteLength > this.pendingListen.limit) { this.fail("Voice listen confirmation buffer exceeded"); return; }
      this.pendingListen.pcm.push(pcm.slice());
      this.pendingListen.bytes += pcm.byteLength;
      return;
    }
    if (this.socket.bufferedAmount > 64000) { this.fail("Microphone send buffer exceeded"); return; }
    this.socket.send(pcm);
  }

  listen(preRoll: Uint8Array[] = []): void {
    if (!this.ready || this.closed || this.aborting || (this.awaiting && !this.questionId) || this.listening || this.pendingListen || this.preparingCapture) return;
    // Buttons and local detection share this action. Stop locally before any
    // network roundtrip; abort remains an explicit task cancellation only.
    if (this.receivingAudio || this.speech || this.player.playing) {
      const interrupted = this.timingOpen && (this.receivingAudio || this.player.playing);
      if (interrupted) this.timing("interruptRequested");
      this.player.stop();
      if (interrupted) this.timing("localSilenced");
    }
    this.endTiming("superseded");
    this.receivingAudio = false;
    this.speech = null;
    this.capture.setDetecting(false);
    this.capture.stop();
    this.recognizing = false;
    if (!this.capture.ready) {
      const preparation = {};
      this.preparingCapture = preparation;
      this.controlTimer = setTimeout(() => this.fail("Microphone recovery timed out"), 10000);
      this.options.patch({ status: "connecting" });
      void this.capture.prepare().then(() => {
        if (this.preparingCapture !== preparation) return;
        this.preparingCapture = null;
        this.clearTimer();
        if (this.interruptionMode === "duplex") void this.setInterruptionMode("duplex");
        this.listen();
      }).catch(error => {
        if (this.preparingCapture === preparation) this.fail(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    this.turn++;
    this.timingRunId = this.runId;
    this.timingOpen = true;
    this.timing("listenStart");
    this.speech = null;
    this.lastError = "";
    this.listenRequestId = `voice:${this.sessionId}:${this.turn}`;
    const preRollBytes = preRoll.reduce((sum, pcm) => sum + pcm.byteLength, 0);
    if (preRollBytes > 15360) { this.fail("Voice detection pre-recording buffer exceeded"); return; }
    // A short PCM frame means end-of-input to the server. Carry the pre-roll
    // tail into the live encoder so it cannot precede subsequent full frames.
    const recorded = new Uint8Array(preRollBytes);
    let offset = 0;
    for (const pcm of preRoll) { recorded.set(pcm, offset); offset += pcm.byteLength; }
    const frames: Uint8Array[] = [];
    for (offset = 0; offset + VOICE_CHAT_FRAME_BYTES <= recorded.length; offset += VOICE_CHAT_FRAME_BYTES) {
      frames.push(recorded.slice(offset, offset + VOICE_CHAT_FRAME_BYTES));
    }
    this.pendingListen = { pcm: frames, bytes: offset, limit: offset + 16000, stop: false };
    this.clearTimer();
    this.controlTimer = setTimeout(() => this.fail("Voice listen confirmation timed out"), 5000);
    this.inputAwaitingId = this.questionId ? this.awaitingId : "";
    this.send({ type: "listen", state: "start", requestId: this.listenRequestId, turn: this.turn,
      ...(this.questionId ? { intent: "question", runId: this.runId, awaitingId: this.awaitingId, questionId: this.questionId } : { intent: "conversation" }) });
    this.listening = true;
    this.recognizing = true;
    this.capture.start(preRoll.length ? recorded.slice(offset) : undefined);
    this.options.patch({ status: "listening", error: "", awaiting: this.awaiting, canAnswerQuestion: Boolean(this.questionId), supplementAccepted: false });
  }

  stopListening(): void {
    if (!this.listening) return;
    this.timing("manualStop");
    this.capture.stop(true); // Keep the even short tail ahead of listen(stop).
    this.listening = false;
    if (this.pendingListen) this.pendingListen.stop = true;
    else this.send({ type: "listen", state: "stop", requestId: this.listenRequestId, turn: this.turn });
    this.options.patch({ status: "thinking" });
  }

  abort(): void {
    if (!this.ready || this.closed || this.aborting) return;
    this.endTiming("aborted");
    this.aborting = true;
    this.pendingListen = null;
    this.clearTimer();
    this.preparingCapture = null;
    this.listening = false;
    this.recognizing = false;
    this.receivingAudio = false;
    this.capture.stop();
    this.capture.setDetecting(false);
    this.player.stop();
    this.options.patch({ status: "thinking", awaiting: false, supplementAccepted: false });
    this.send({ type: "abort", reason: "user_stop" });
    this.controlTimer = setTimeout(() => this.fail("Voice abort timed out"), 5000);
  }

  setMuted(muted: boolean): void { this.player.setMuted(muted); }

  async setInterruptionMode(mode: VoiceInterruptionMode): Promise<void> {
    if (this.closed) return;
    const generation = ++this.modeGeneration;
    if (this.modeTimer) clearTimeout(this.modeTimer);
    this.modeTimer = null;
    this.interruptionMode = mode;
    this.duplexReady = false;
    this.capture.disableDetection();
    this.options.patch({ interruptionMode: mode, duplexStatus: mode === "duplex" ? "loading" : "off", duplexError: "" });
    if (mode === "button") return;
    const failed = (error: unknown) => {
      if (this.closed || generation !== this.modeGeneration) return;
      if (this.modeTimer) clearTimeout(this.modeTimer);
      this.modeTimer = null;
      this.modeGeneration++;
      this.duplexReady = false;
      this.capture.disableDetection();
      this.options.patch({ duplexStatus: "error", duplexError: error instanceof Error ? error.message : String(error) });
    };
    this.modeTimer = setTimeout(() => failed(new Error("Voice detection loading timed out")), 20000);
    try {
      await this.capture.enableDetection((preRoll, candidateAtMs) => {
        if (this.closed || generation !== this.modeGeneration || !this.canDetect()) return;
        this.timing("speechCandidate", candidateAtMs);
        this.timing("speechDetected");
        this.listen(preRoll);
      }, failed);
      if (this.closed || generation !== this.modeGeneration) return;
      if (this.modeTimer) clearTimeout(this.modeTimer);
      this.modeTimer = null;
      this.duplexReady = true;
      this.options.patch({ duplexStatus: "ready" });
      this.updateDetection();
    } catch (error) { failed(error); }
  }

  private canDetect(): boolean {
    return this.duplexReady && !this.closed && !this.aborting && !this.listening && !this.playbackFailed &&
      Boolean(this.speech && (this.speech.purpose === "final" || this.speech.purpose === "question" && this.questionId)) &&
      (!this.awaiting || Boolean(this.questionId));
  }

  private updateDetection(): void { this.capture.setDetecting(this.canDetect()); }

  private receive(message: Record<string, unknown>): void {
    const type = message.type;
    if (type === "hello") {
      if (this.ready || message.version !== 2 || message.agentKey !== this.options.agentKey || typeof message.chatId !== "string") throw new Error("Invalid voice hello");
      if (typeof message.sessionId !== "string" || !message.sessionId) throw new Error("Invalid voice session identity");
      this.sessionId = message.sessionId;
      const audio = message.audio as { output?: { codec?: string; sampleRate?: number; channels?: number } } | undefined;
      if (audio?.output?.codec !== "pcm_s16le" || audio.output.channels !== 1 || ![16000, 24000].includes(audio.output.sampleRate || 0)) throw new Error("Unsupported voice output");
      this.sampleRate = audio.output.sampleRate!;
      this.ready = true;
      this.clearTimer();
      this.options.patch({ sessionActive: true, error: "" });
      this.listen();
      return;
    }
    if (type === "listen.ready") {
      if (this.aborting) return; // Explicit abort supersedes the in-flight listen.
      if (!this.pendingListen || message.turn !== this.turn || message.requestId !== this.listenRequestId) throw new Error("Invalid listen confirmation");
      const pending = this.pendingListen;
      this.pendingListen = null;
      this.clearTimer();
      // Send the short pre-recording in order, including a manually flushed tail.
      for (const pcm of pending.pcm) {
        if (!this.socket || this.socket.bufferedAmount > 64000) { this.fail("Microphone send buffer exceeded"); return; }
        this.socket.send(pcm);
      }
      if (pending.stop) this.send({ type: "listen", state: "stop", requestId: this.listenRequestId, turn: this.turn });
      return;
    }
    if (type === "error") {
      const error = String(message.msg || message.code || "Voice failed");
      if (!this.ready) { this.fail(error); return; }
      if (message.code === "invalid_request") { this.fail(error); return; }
      if (this.aborting || message.turn !== this.turn) return;
      if (this.pendingListen && message.code !== "input_changed") { this.fail(error); return; }
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
      this.awaitingId = this.questionId = this.inputAwaitingId = "";
      this.speech = null;
      this.options.patch({ status: "idle", awaiting: false });
      return;
    }
    if (!this.ready || this.aborting) return;
    // Run and awaiting belong to Runtime identity, independent of media turns.
    if (type === "run") {
      if (typeof message.runId !== "string" || !message.runId) throw new Error("Invalid voice Run");
      if (message.state === "start" && typeof message.chatId === "string") {
        this.runId = message.runId;
        this.timingRunId = message.runId;
        this.timing("runStartReceived");
        this.options.onRun(message.chatId, message.runId);
      } else if (message.state === "end" && message.runId === this.runId) {
        this.timingRunId = message.runId;
        this.timing("runEndReceived");
        this.runId = "";
        if (message.finishReason === "complete") { this.awaiting = false; this.awaitingId = this.questionId = ""; this.options.patch({ awaiting: false, canAnswerQuestion: false }); }
      }
      return;
    }
    if (type === "awaiting") {
      if (message.runId !== this.runId || typeof message.awaitingId !== "string") return;
      if (message.state === "resolved") {
        if (message.awaitingId !== this.awaitingId) return;
        if (this.inputAwaitingId === this.awaitingId || this.speech?.awaitingId === this.awaitingId) {
          this.capture.stop();
          this.player.stop();
          this.listening = this.recognizing = this.receivingAudio = false;
          this.speech = null;
          this.endTiming("superseded");
        }
        this.questionId = this.inputAwaitingId = "";
        this.awaitingId = "";
        this.awaiting = false;
        this.updateDetection();
        this.options.patch({ awaiting: false, canAnswerQuestion: false, status: "thinking" });
      } else if (message.state === "ask" || message.state === "updated") {
        this.awaitingId = message.awaitingId;
        this.awaiting = true;
        this.questionId = message.mode === "question" && message.handoff !== true && typeof message.questionId === "string" ? message.questionId : "";
        this.options.patch({ awaiting: true, canAnswerQuestion: Boolean(this.questionId) });
        this.updateDetection();
      } else throw new Error("Invalid voice awaiting state");
      return;
    }
    if (this.pendingListen || message.turn !== this.turn) return;
    if (type === "steer") {
      if (message.requestId !== this.listenRequestId || message.steerId !== `voice:${this.sessionId}:${this.turn}` || message.state !== "accepted") throw new Error("Invalid voice supplement confirmation");
      if (typeof message.runId !== "string" || !message.runId || (this.runId && message.runId !== this.runId)) throw new Error("Invalid voice supplement Run");
      this.options.patch({ supplementAccepted: true });
    } else if (type === "stt") {
      if (!this.recognizing) return;
      const text = String(message.text || "");
      if (text) this.options.patch({ partialUserText: text, partialAssistantText: "" });
      if (message.final === true) {
        this.timing("asrFinalReceived");
        this.capture.stop();
        this.listening = false;
        this.recognizing = false;
        if (text) this.options.patch({ status: "thinking" });
        else if (message.pendingResult !== true) { this.endTiming("empty"); this.listen(); } // A retained final owns playback after empty input.
      }
    } else if (type === "tts") {
      if (message.state === "start") {
        if (typeof message.speechId !== "string" || !message.speechId || !["final", "question", "notice"].includes(String(message.purpose))) throw new Error("Invalid voice speech");
        this.capture.stop();
        this.listening = false;
        this.recognizing = false;
        this.speech = { id: message.speechId, purpose: message.purpose as "final" | "question" | "notice", done: false, awaitingId: message.purpose === "final" ? "" : this.awaitingId };
        this.timing("speechStartReceived");
        this.receivingAudio = true;
        this.playbackFailed = false;
        this.player.start(this.sampleRate);
        this.updateDetection();
        this.options.patch({ status: "speaking", partialAssistantText: String(message.text || ""), supplementAccepted: false });
      } else if (message.state === "stop") {
        if (!this.speech || message.speechId !== this.speech.id || message.purpose !== this.speech.purpose) return;
        this.receivingAudio = false;
        if (this.speech) this.speech.done = message.reason === "done";
        if (message.reason !== "done") this.endTiming("error");
        if (!this.playbackFailed) this.player.finish();
      }
    }
  }

  // Keeps the connection so the user can speak again without a new hello.
  private endTurn(error: string, keepAudio = false): void {
    this.endTiming("error");
    this.pendingListen = null;
    this.lastError = error;
    this.preparingCapture = null;
    this.clearTimer();
    this.capture.stop();
    this.capture.setDetecting(false);
    if (!keepAudio) this.player.stop();
    this.listening = false;
    this.recognizing = false;
    this.receivingAudio = false;
    this.speech = null;
    this.options.patch({ status: "error", error, awaiting: this.awaiting, supplementAccepted: false });
  }

  private playbackDrained(): void {
    this.capture.setDetecting(false);
    if (this.closed || this.aborting || this.playbackFailed) return;
    if (this.speech?.purpose === "final" && this.speech.done && !this.awaiting) { this.endTiming("complete"); this.listen(); }
    else if (this.speech?.purpose === "question" && this.speech.done && this.questionId) { this.endTiming("complete"); this.listen(); }
    else if (this.awaiting) this.options.patch({ status: "thinking" });
  }

  private clearTimer(): void {
    if (this.controlTimer) clearTimeout(this.controlTimer);
    this.controlTimer = null;
  }

  private fail(message: string): void {
    if (this.closed) return;
    this.endTiming("error");
    this.close();
    this.options.patch({ status: "error", error: message, sessionActive: false });
  }

  close(): void {
    if (this.closed) return;
    this.endTiming("closed");
    this.closed = true;
    this.modeGeneration++;
    if (this.modeTimer) clearTimeout(this.modeTimer);
    this.modeTimer = null;
    this.pendingListen = null;
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

  private timing(stage: VoiceTimingStage, atMs = performance.now(), extra: Pick<VoiceTimingPoint, "clockSource" | "outcome"> = {}): void {
    emitVoiceTiming({ sessionId: this.sessionId, turn: this.turn, stage, atMs, mode: this.interruptionMode,
      runId: this.timingRunId || undefined, awaitingId: this.awaitingId || undefined,
      speechId: this.speech?.id, purpose: this.speech?.purpose, ...extra });
  }

  private endTiming(outcome: VoiceTimingPoint["outcome"]): void {
    if (!this.timingOpen) return;
    this.timing("turnEnd", performance.now(), { outcome });
    this.timingOpen = false;
  }
}
