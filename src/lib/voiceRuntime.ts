import type { AppState, TtsVoiceBlock } from '../context/types';
import { parseContentSegments } from './contentSegments';

const VOICE_WS_PATH = '/api/ap/ws/voice';
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;

interface VoiceSession {
  key: string;
  contentId: string;
  signature: string;
  requestId: string;
  started: boolean;
  committed: boolean;
  seq: number;
  sentChars: number;
  pendingChars: string;
}

interface RuntimeOptions {
  getState: () => AppState;
  onPatchBlock: (contentId: string, signature: string, patch: Partial<TtsVoiceBlock>) => void;
  onRemoveInactiveBlocks: (contentId: string, activeSignatures: Set<string>) => void;
  onDebug?: (line: string) => void;
  onDebugStatus?: (status: string) => void;
}

class VoiceRuntime {
  private sessionsByKey = new Map<string, VoiceSession>();
  private sessionKeyByRequestId = new Map<string, string>();
  private outboundQueue: string[] = [];
  private socket: WebSocket | null = null;
  private socketConnectingPromise: Promise<WebSocket> | null = null;
  private socketClosingExpected = false;
  private audioContext: AudioContext | null = null;
  private playbackCursor = 0;
  private activeAudioRequestId = '';
  private activeSampleRate = DEFAULT_SAMPLE_RATE;
  private activeChannels = DEFAULT_CHANNELS;
  private options: RuntimeOptions;

  constructor(options: RuntimeOptions) {
    this.options = options;
  }

  private appendDebug(message: string): void {
    this.options.onDebug?.(message);
  }

  private setDebugStatus(status: string): void {
    this.options.onDebugStatus?.(String(status || '').trim() || 'idle');
  }

  private getAccessToken(): string {
    return String(this.options.getState().accessToken || '').trim();
  }

  private getVoiceWsUrl(accessToken: string): string {
    const location = globalThis.window?.location;
    const base = (!location || !location.host)
      ? 'ws://localhost'
      : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const url = new URL(VOICE_WS_PATH, base);
    url.searchParams.set('access_token', accessToken);
    return url.toString();
  }

  private sessionKeyOf(contentId: string, signature: string): string {
    return `${contentId}::${signature}`;
  }

  private createRequestId(): string {
    return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private pickChunkSize(length: number, forceFlush: boolean): number {
    if (length <= 0) return 0;
    if (length >= 5) return 5;
    if (length >= 3) return 3;
    if (length >= 2) return 2;
    return forceFlush ? length : 0;
  }

  private isArrayBufferView(value: unknown): value is ArrayBufferView {
    return Boolean(value && typeof value === 'object' && ArrayBuffer.isView(value as ArrayBufferView));
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    const Ctor = globalThis.window?.AudioContext || (globalThis.window as unknown as { webkitAudioContext?: typeof AudioContext })?.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.audioContext = new Ctor();
      this.playbackCursor = 0;
      return this.audioContext;
    } catch (error) {
      this.appendDebug(`voice audio context create failed: ${(error as Error).message}`);
      return null;
    }
  }

  private resetPlayback(): void {
    this.playbackCursor = 0;
    if (!this.audioContext) return;
    try {
      const closePromise = this.audioContext.close?.();
      if (closePromise && typeof closePromise.catch === 'function') closePromise.catch(() => undefined);
    } catch {
      // no-op
    } finally {
      this.audioContext = null;
    }
  }

  private playPcm(bufferLike: ArrayBuffer | ArrayBufferView): void {
    const context = this.ensureAudioContext();
    if (!context) return;

    if (context.state === 'suspended' && typeof context.resume === 'function') {
      Promise.resolve(context.resume()).catch(() => undefined);
    }

    const bytes = this.isArrayBufferView(bufferLike)
      ? new Uint8Array(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength)
      : new Uint8Array(bufferLike);
    const sampleRate = Math.max(8000, Number(this.activeSampleRate) || DEFAULT_SAMPLE_RATE);
    const channels = Math.max(1, Number(this.activeChannels) || DEFAULT_CHANNELS);
    if (bytes.length < 2) return;

    const sampleCount = Math.floor(bytes.length / 2);
    const frameCount = Math.floor(sampleCount / channels);
    if (frameCount <= 0) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const audioBuffer = context.createBuffer(channels, frameCount, sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const output = audioBuffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i += 1) {
        const sampleIndex = (i * channels + channel) * 2;
        const sample = view.getInt16(sampleIndex, true) / 32768;
        output[i] = Math.max(-1, Math.min(1, sample));
      }
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const now = context.currentTime + 0.01;
    const startAt = Math.max(now, this.playbackCursor || 0);
    source.start(startAt);
    this.playbackCursor = startAt + audioBuffer.duration;

    if (this.activeAudioRequestId) {
      this.updateBlockByRequestId(this.activeAudioRequestId, { status: 'playing', error: '' });
    }
  }

  private handleSocketBinary(data: unknown): void {
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.arrayBuffer()
        .then((buffer) => this.playPcm(buffer))
        .catch((error) => this.appendDebug(`voice blob decode failed: ${(error as Error).message}`));
      return;
    }
    if (data instanceof ArrayBuffer || this.isArrayBufferView(data)) {
      this.playPcm(data);
    }
  }

  private updateBlock(contentId: string, signature: string, patch: Partial<TtsVoiceBlock>): void {
    this.options.onPatchBlock(contentId, signature, patch);
  }

  private updateBlockByRequestId(requestId: string, patch: Partial<TtsVoiceBlock>): void {
    const key = this.sessionKeyByRequestId.get(String(requestId || '').trim());
    if (!key) return;
    const session = this.sessionsByKey.get(key);
    if (!session) return;
    this.updateBlock(session.contentId, session.signature, patch);
  }

  private handleSocketText(rawText: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      this.appendDebug(`voice ws text parse failed: ${(error as Error).message}`);
      return;
    }

    const type = String(payload?.type || '').trim();
    const requestId = String(payload?.requestId || '').trim();

    if (type === 'tts.started') {
      if (requestId) {
        this.activeAudioRequestId = requestId;
        this.activeSampleRate = Number(payload.sampleRate) || DEFAULT_SAMPLE_RATE;
        this.activeChannels = Number(payload.channels) || DEFAULT_CHANNELS;
        this.updateBlockByRequestId(requestId, {
          status: 'playing',
          error: '',
          sampleRate: this.activeSampleRate,
          channels: this.activeChannels,
        });
        if (requestId.startsWith('debug_')) this.setDebugStatus('playing');
      }
      return;
    }

    if (type === 'tts.done') {
      if (requestId) {
        this.updateBlockByRequestId(requestId, { status: 'done', error: '' });
        if (requestId.startsWith('debug_')) this.setDebugStatus('done');
      }
      return;
    }

    if (type === 'tts.interrupted') {
      if (requestId) {
        this.updateBlockByRequestId(requestId, { status: 'stopped' });
        if (requestId.startsWith('debug_')) this.setDebugStatus('stopped');
      }
      return;
    }

    if (type === 'error') {
      const message = String(payload?.message || 'voice websocket error');
      if (requestId) {
        this.updateBlockByRequestId(requestId, { status: 'error', error: message });
        if (requestId.startsWith('debug_')) this.setDebugStatus(`error: ${message}`);
      } else {
        for (const session of this.sessionsByKey.values()) {
          if (!session.committed) {
            this.updateBlock(session.contentId, session.signature, { status: 'error', error: message });
          }
        }
        this.setDebugStatus(`error: ${message}`);
      }
      this.appendDebug(`voice ws error: ${message}`);
    }
  }

  private flushOutboundQueue(): void {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) return;
    while (this.outboundQueue.length > 0) {
      const frame = this.outboundQueue.shift();
      if (frame) this.socket.send(frame);
    }
  }

  private markUncommittedSessionsError(message: string): void {
    const errorMessage = String(message || 'voice websocket closed');
    for (const session of this.sessionsByKey.values()) {
      if (!session.committed) {
        this.updateBlock(session.contentId, session.signature, {
          status: 'error',
          error: errorMessage,
        });
      }
    }
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === this.socket.OPEN) {
      return Promise.resolve(this.socket);
    }
    if (this.socketConnectingPromise) return this.socketConnectingPromise;

    const accessToken = this.getAccessToken();
    if (!accessToken) {
      const errorMessage = 'voice access_token is required';
      this.outboundQueue.length = 0;
      this.markUncommittedSessionsError(errorMessage);
      this.setDebugStatus(`error: ${errorMessage}`);
      return Promise.reject(new Error(errorMessage));
    }

    const WsCtor = globalThis.window?.WebSocket || globalThis.WebSocket;
    if (!WsCtor) return Promise.reject(new Error('WebSocket is not available'));

    this.socketClosingExpected = false;
    this.socketConnectingPromise = new Promise((resolve, reject) => {
      let connected = false;
      let settled = false;

      const failPendingConnect = (message: string): void => {
        if (settled) return;
        settled = true;
        this.socketConnectingPromise = null;
        const failedSocket = this.socket;
        this.socket = null;
        this.markUncommittedSessionsError(message);
        reject(new Error(message));
        if (failedSocket && failedSocket.readyState === failedSocket.CONNECTING) {
          this.socketClosingExpected = true;
          try { failedSocket.close(1000, 'voice connect failed'); } catch { /* no-op */ }
        }
      };

      try {
        this.socket = new WsCtor(this.getVoiceWsUrl(accessToken));
      } catch (error) {
        this.socketConnectingPromise = null;
        reject(error as Error);
        return;
      }

      this.socket.binaryType = 'arraybuffer';
      this.socket.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        connected = true;
        this.socketConnectingPromise = null;
        this.flushOutboundQueue();
        resolve(this.socket as WebSocket);
      });

      this.socket.addEventListener('message', (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          this.handleSocketText(event.data);
          return;
        }
        this.handleSocketBinary(event.data);
      });

      this.socket.addEventListener('error', () => {
        this.appendDebug('voice ws error event');
        failPendingConnect('voice websocket handshake failed');
      });

      this.socket.addEventListener('close', (event: CloseEvent) => {
        const expected = this.socketClosingExpected;
        this.socketClosingExpected = false;
        const closeCode = typeof event?.code === 'number' ? event.code : 1006;
        const closeReason = String(event?.reason || '').trim();
        if (!connected && !expected) {
          const detail = closeReason
            ? `voice websocket closed before open (code=${closeCode}, reason=${closeReason})`
            : `voice websocket closed before open (code=${closeCode})`;
          this.appendDebug(detail);
          failPendingConnect(detail);
          return;
        }
        this.socketConnectingPromise = null;
        this.socket = null;
        if (!expected) {
          this.markUncommittedSessionsError('voice websocket closed');
          this.setDebugStatus('error: voice websocket closed');
        }
      });
    });

    return this.socketConnectingPromise;
  }

  private sendJsonFrame(payload: Record<string, unknown>): void {
    const frame = JSON.stringify(payload);
    if (this.socket && this.socket.readyState === this.socket.OPEN) {
      this.socket.send(frame);
      return;
    }
    this.outboundQueue.push(frame);
    this.ensureSocket().catch((error) => {
      this.appendDebug(`voice socket connect failed: ${(error as Error).message}`);
      this.setDebugStatus(`error: ${(error as Error).message}`);
    });
  }

  private ensureSession(contentId: string, signature: string): VoiceSession {
    const key = this.sessionKeyOf(contentId, signature);
    const existing = this.sessionsByKey.get(key);
    if (existing) return existing;

    const created: VoiceSession = {
      key,
      contentId,
      signature,
      requestId: this.createRequestId(),
      started: false,
      committed: false,
      seq: 0,
      sentChars: 0,
      pendingChars: '',
    };
    this.sessionsByKey.set(key, created);
    this.sessionKeyByRequestId.set(created.requestId, key);
    return created;
  }

  private appendSessionDelta(session: VoiceSession, fullText: string): void {
    const normalized = String(fullText ?? '');
    const processed = session.sentChars + session.pendingChars.length;
    if (normalized.length < processed) {
      session.sentChars = 0;
      session.pendingChars = '';
      session.seq = 0;
    }

    const offset = session.sentChars + session.pendingChars.length;
    if (normalized.length <= offset) return;
    session.pendingChars += normalized.slice(offset);
  }

  private emitStart(session: VoiceSession): void {
    if (session.started) return;
    session.started = true;
    this.sendJsonFrame({
      type: 'tts.start',
      requestId: session.requestId,
      chatId: this.options.getState().chatId || undefined,
      codec: 'pcm',
    });
    this.updateBlock(session.contentId, session.signature, { status: 'connecting', error: '' });
  }

  private emitChunks(session: VoiceSession, forceFlush = false): void {
    while (session.pendingChars.length > 0) {
      const size = this.pickChunkSize(session.pendingChars.length, forceFlush);
      if (size <= 0) break;
      const chunk = session.pendingChars.slice(0, size);
      session.pendingChars = session.pendingChars.slice(size);
      session.sentChars += chunk.length;
      session.seq += 1;
      this.sendJsonFrame({
        type: 'tts.chunk',
        requestId: session.requestId,
        seq: session.seq,
        text: chunk,
      });
    }
  }

  private emitChunksByText(requestId: string, text: string, startSeq = 0): number {
    let pending = String(text || '');
    let seq = Number(startSeq) || 0;

    while (pending.length > 0) {
      const size = this.pickChunkSize(pending.length, false);
      if (size <= 0) break;
      const chunk = pending.slice(0, size);
      pending = pending.slice(size);
      seq += 1;
      this.sendJsonFrame({
        type: 'tts.chunk',
        requestId,
        seq,
        text: chunk,
      });
    }

    if (pending.length > 0) {
      seq += 1;
      this.sendJsonFrame({
        type: 'tts.chunk',
        requestId,
        seq,
        text: pending,
      });
    }
    return seq;
  }

  private finalizeSession(session: VoiceSession, reason: string, mode: 'commit' | 'stop' = 'commit'): void {
    if (!session || session.committed) return;
    if (mode === 'stop') {
      if (session.started) {
        this.sendJsonFrame({ type: 'tts.stop', requestId: session.requestId });
      }
      session.committed = true;
      this.updateBlock(session.contentId, session.signature, { status: 'stopped', error: '' });
      return;
    }

    this.emitStart(session);
    this.emitChunks(session, true);
    this.sendJsonFrame({ type: 'tts.commit', requestId: session.requestId });
    session.committed = true;
    this.updateBlock(session.contentId, session.signature, { status: 'done', error: '' });
    this.appendDebug(`voice session committed: ${session.requestId} (${reason})`);
  }

  private finalizeContentSessions(contentId: string, reason: string, mode: 'commit' | 'stop' = 'commit'): void {
    for (const session of this.sessionsByKey.values()) {
      if (session.contentId !== contentId) continue;
      this.finalizeSession(session, reason, mode);
    }
  }

  processTtsVoiceBlocks(contentId: string, text: string, status: string, source: 'live' | 'history' = 'live'): void {
    const segments = parseContentSegments(contentId, text);
    const active = new Set<string>();

    for (const segment of segments) {
      if (segment.kind !== 'ttsVoice' || !segment.signature) continue;
      active.add(segment.signature);

      this.updateBlock(contentId, segment.signature, {
        signature: segment.signature,
        text: String(segment.text || ''),
        closed: Boolean(segment.closed),
      });

      if (source !== 'live') continue;
      const session = this.ensureSession(contentId, segment.signature);
      if (session.committed) continue;

      this.appendSessionDelta(session, String(segment.text || ''));
      this.emitStart(session);
      this.emitChunks(session, false);
      if (segment.closed) this.finalizeSession(session, 'block.closed', 'commit');
    }

    this.options.onRemoveInactiveBlocks(contentId, active);

    if (source === 'live' && String(status || '').toLowerCase() === 'completed') {
      this.finalizeContentSessions(contentId, 'content.completed', 'commit');
    }
  }

  stopAllVoiceSessions(reason = 'manual', options: { mode?: 'commit' | 'stop' } = {}): void {
    const mode = options.mode === 'stop'
      ? 'stop'
      : String(reason || '').toLowerCase().includes('user_stop')
        ? 'stop'
        : 'commit';
    for (const session of this.sessionsByKey.values()) {
      this.finalizeSession(session, reason, mode);
    }
    if (mode === 'stop') {
      this.resetPlayback();
      this.setDebugStatus('stopped');
    }
  }

  resetVoiceRuntime(): void {
    this.stopAllVoiceSessions('reset', { mode: 'stop' });
    this.sessionsByKey.clear();
    this.sessionKeyByRequestId.clear();
    this.outboundQueue.length = 0;
    this.activeAudioRequestId = '';
    this.activeSampleRate = DEFAULT_SAMPLE_RATE;
    this.activeChannels = DEFAULT_CHANNELS;
    this.resetPlayback();
    this.closeSocket();
    this.setDebugStatus('idle');
  }

  async debugSpeakTtsVoice(rawText: string): Promise<string> {
    const text = String(rawText || '').trim();
    if (!text) throw new Error('debug text is empty');
    await this.ensureSocket();
    const requestId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.setDebugStatus('connecting');
    this.sendJsonFrame({
      type: 'tts.start',
      requestId,
      chatId: this.options.getState().chatId || undefined,
      codec: 'pcm',
    });
    this.emitChunksByText(requestId, text, 0);
    this.sendJsonFrame({
      type: 'tts.commit',
      requestId,
    });
    this.appendDebug(`voice debug sent: ${requestId}, chars=${text.length}`);
    return requestId;
  }

  private closeSocket(): void {
    if (!this.socket) {
      this.socketConnectingPromise = null;
      return;
    }
    this.socketClosingExpected = true;
    try {
      if (this.socket.readyState === this.socket.OPEN || this.socket.readyState === this.socket.CONNECTING) {
        this.socket.close(1000, 'voice reset');
      }
    } catch {
      // no-op
    }
    this.socket = null;
    this.socketConnectingPromise = null;
  }
}

let runtime: VoiceRuntime | null = null;

export function initVoiceRuntime(options: RuntimeOptions): VoiceRuntime {
  runtime = new VoiceRuntime(options);
  return runtime;
}

export function getVoiceRuntime(): VoiceRuntime | null {
  return runtime;
}
