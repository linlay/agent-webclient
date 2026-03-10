import type { AppState } from '../context/types';
import { initVoiceRuntime } from './voiceRuntime';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;

  CONNECTING = 0;
  OPEN = 1;
  readyState = MockWebSocket.CONNECTING;
  binaryType = 'arraybuffer';
  url: string;
  sentFrames: string[] = [];
  private listeners = new Map<string, Array<(event?: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    });
  }

  addEventListener(type: string, handler: (event?: unknown) => void) {
    const current = this.listeners.get(type) || [];
    current.push(handler);
    this.listeners.set(type, current);
  }

  send(frame: string) {
    this.sentFrames.push(frame);
  }

  close() {
    this.readyState = 3;
  }

  emit(type: string, event?: unknown) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }
}

describe('voiceRuntime debug status', () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    MockWebSocket.instances = [];
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    if (originalWebSocket) {
      (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as Record<string, unknown>).WebSocket;
    }
  });

  it('reports token errors and resets debug status to idle', async () => {
    const statuses: string[] = [];
    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: '' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    await expect(runtime.debugSpeakTtsVoice('hello')).rejects.toThrow(
      'voice access_token is required',
    );

    expect(statuses[statuses.length - 1]).toBe('error: voice access_token is required');

    runtime.resetVoiceRuntime();
    expect(statuses[statuses.length - 1]).toBe('idle');
  });

  it('tracks debug playback status transitions', async () => {
    const statuses: string[] = [];
    (globalThis as unknown as { window?: Window & typeof globalThis }).window = {
      location: { protocol: 'http:', host: 'localhost:3000' },
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    } as Window & typeof globalThis;
    (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;

    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: 'token_abc', chatId: 'chat_1' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    const requestId = await runtime.debugSpeakTtsVoice('hello world');
    expect(statuses[statuses.length - 1]).toBe('connecting');

    const socket = MockWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.started',
        requestId,
        sampleRate: 24000,
        channels: 1,
      }),
    });
    expect(statuses[statuses.length - 1]).toBe('playing');

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.done',
        requestId,
      }),
    });
    expect(statuses[statuses.length - 1]).toBe('done');

    runtime.stopAllVoiceSessions('debug_stop', { mode: 'stop' });
    expect(statuses[statuses.length - 1]).toBe('stopped');
  });
});
