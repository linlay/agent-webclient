import type { AppState, TtsVoiceBlock } from '../context/types';
import { parseContentSegments } from './contentSegments';
import {
  DEFAULT_CHANNELS,
  DEFAULT_SAMPLE_RATE,
  ensureAudioContext,
  handleSocketBinary,
  isArrayBufferView,
  playPcm,
  prepareAudioPlayback,
  resetPlayback,
  type VoiceAudioPlayerContext,
} from './voiceAudioPlayer';
import {
  closeSocket,
  ensureSocket,
  flushOutboundQueue,
  handleSocketText,
  sendJsonFrame,
  type VoiceSocketContext,
} from './voiceSocket';

const VOICE_WS_PATH = '/api/ws/voice';
export const DEFAULT_TTS_DEBUG_TEXT = '这是一条 TTS 调试语音。如果你能听到这句话，说明当前语音播放链路正常。';

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

interface DebugTtsRequestState {
  requestId: string;
  audioFrames: number;
  audioBytes: number;
  started: boolean;
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
  private debugTtsRequest: DebugTtsRequestState | null = null;
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

  private setDebugStatusWithStats(status: string): void {
    const stats = this.debugTtsRequest;
    if (!stats || !stats.requestId) {
      this.setDebugStatus(status);
      return;
    }
    const suffix = stats.audioFrames > 0
      ? ` (${stats.audioFrames} frames, ${stats.audioBytes} bytes)`
      : '';
    this.setDebugStatus(`${status}${suffix}`);
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

  private describeVoiceWsTarget(accessToken: string): string {
    const url = new URL(this.getVoiceWsUrl(accessToken));
    url.search = '';
    return `${url.origin}${url.pathname}`;
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

  private ensureAudioContext(): AudioContext | null {
    return ensureAudioContext(this as unknown as VoiceAudioPlayerContext);
  }

  private async prepareAudioPlayback(): Promise<AudioContext> {
    return prepareAudioPlayback(this as unknown as VoiceAudioPlayerContext);
  }

  private resetPlayback(): void {
    resetPlayback(this as unknown as VoiceAudioPlayerContext);
  }

  private playPcm(bufferLike: ArrayBuffer | ArrayBufferView): boolean {
    return playPcm(this as unknown as VoiceAudioPlayerContext, bufferLike);
  }

  private handleSocketBinary(data: unknown): void {
    handleSocketBinary(this as unknown as VoiceAudioPlayerContext, data);
  }

  private handleAudioBytes(byteLength: number): void {
    if (!this.activeAudioRequestId || !this.debugTtsRequest || this.debugTtsRequest.requestId !== this.activeAudioRequestId) {
      return;
    }
    this.debugTtsRequest.audioFrames += 1;
    this.debugTtsRequest.audioBytes += Math.max(0, Number(byteLength) || 0);
    this.setDebugStatusWithStats('receiving audio');
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
    handleSocketText(this as unknown as VoiceSocketContext, rawText);
  }

  private flushOutboundQueue(): void {
    flushOutboundQueue(this as unknown as VoiceSocketContext);
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
    return ensureSocket(this as unknown as VoiceSocketContext);
  }

  private sendJsonFrame(payload: Record<string, unknown>): void {
    sendJsonFrame(this as unknown as VoiceSocketContext, payload);
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
    this.debugTtsRequest = null;
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
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      const errorMessage = 'voice access_token is required';
      this.setDebugStatus(`error: ${errorMessage}`);
      throw new Error(errorMessage);
    }
    const requestId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.debugTtsRequest = {
      requestId,
      audioFrames: 0,
      audioBytes: 0,
      started: false,
    };
    this.setDebugStatus('connecting');
    try {
      await this.prepareAudioPlayback();
    } catch (error) {
      const message = (error as Error).message;
      this.setDebugStatus(`error: ${message}`);
      throw error;
    }
    await this.ensureSocket();
    this.setDebugStatus('socket open');
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
    closeSocket(this as unknown as VoiceSocketContext);
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
