import { Blob } from 'buffer';
import { AGENT_APP_ACCESS_TOKEN_STORAGE_KEY } from '@/shared/api/appAuth';
import { resetCompactIdStateForTests } from '@/shared/utils/compactId';
import {
  buildResourceUrl,
  createRequestId,
  createQueryStream,
  deleteChat,
  downloadResource,
  extractUploadChatId,
  extractUploadReferences,
  getAgent,
  getAgents,
  getChats,
  getVoiceCapabilities,
  getVoiceCapabilitiesFlexible,
  getVoiceVoices,
  getVoiceVoicesFlexible,
  interruptChat,
  learnChat,
  markChatRead,
  rememberChat,
  searchGlobal,
  setAccessToken,
  steerChat,
  submitFeedback,
  uploadFile,
} from '@/shared/api/apiClient';

class MockFormData {
  private readonly values = new Map<string, unknown[]>();

  append(name: string, value: unknown, filename?: string): void {
    const current = this.values.get(name) || [];
    if (filename && value instanceof Blob) {
      current.push(new MockFile([value], filename, { type: value.type }));
    } else {
      current.push(value);
    }
    this.values.set(name, current);
  }

  get(name: string): unknown {
    return this.values.get(name)?.[0] ?? null;
  }
}

class MockFile extends Blob {
  name: string;
  lastModified: number;

  constructor(bits: BlobPart[], name: string, options: FilePropertyBag = {}) {
    super(bits, options);
    this.name = name;
    this.lastModified = options.lastModified ?? Date.now();
  }
}

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMockStorage(initial: Record<string, string> = {}): MockStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) || null : null),
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function installWindow(options: {
  pathname?: string;
  storedToken?: string;
} = {}) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sessionStorage = createMockStorage(
    options.storedToken
      ? { [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken }
      : {},
  );
  const parent = {
    postMessage: jest.fn(),
  };
  const mockWindow = {
    location: { pathname: options.pathname ?? '/appagent' },
    parent,
    sessionStorage,
    addEventListener: jest.fn((type: string, listener: EventListener) => {
      if (type === 'message') {
        listeners.add(listener as unknown as (event: MessageEvent) => void);
      }
    }),
    removeEventListener: jest.fn((type: string, listener: EventListener) => {
      if (type === 'message') {
        listeners.delete(listener as unknown as (event: MessageEvent) => void);
      }
    }),
    setTimeout,
    clearTimeout,
  };

  (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;

  return {
    parent,
    dispatchMessage: (event: MessageEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

describe('apiClient query payloads', () => {
  const fetchMock = jest.fn();
  const originalWindow = globalThis.window;

  beforeEach(() => {
    resetCompactIdStateForTests();
    jest.restoreAllMocks();
    global.Blob = Blob as unknown as typeof global.Blob;
    global.File = MockFile as unknown as typeof global.File;
    global.FormData = MockFormData as unknown as typeof global.FormData;
    setAccessToken('');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, msg: 'ok', data: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setAccessToken('');
  });

  afterEach(() => {
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('creates compact request ids from second-plus-counter', () => {
    const second = 1_776_474_697;
    const baseMs = second * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(baseMs + 581);

    expect(createRequestId('req')).toBe(`req_${(second * 1000).toString(36)}`);
    expect(createRequestId('upload')).toBe(
      `upload_${(second * 1000 + 1).toString(36)}`,
    );
  });

  it('normalizes request id prefixes before generation', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_500);

    expect(createRequestId(' req__ ')).toBe(`req_${(2_000).toString(36)}`);
  });

  it('sends only required fields for basic query streams', async () => {
    await createQueryStream({
      requestId: 'req_1',
      message: '显示广州的天气',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_1',
      planningMode: false,
      message: '显示广州的天气',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('runId');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('stream');
  });

  it('includes only present optional fields for query streams', async () => {
    await createQueryStream({
      requestId: 'req_2',
      message: '继续',
      planningMode: true,
      chatId: 'chat_1',
      agentKey: 'demoViewport',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_2',
      planningMode: true,
      message: '继续',
      chatId: 'chat_1',
      agentKey: 'demoViewport',
    });
  });

  it('keeps uploaded references in query streams when present', async () => {
    await createQueryStream({
      requestId: 'req_3',
      message: '',
      references: [{ id: 'upload_1', name: 'spec.md' }],
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_3',
      planningMode: false,
      message: '',
      references: [{ id: 'upload_1', name: 'spec.md' }],
    });
  });

  it('keeps runId for interrupt and steer requests', async () => {
    await interruptChat({
      requestId: 'req_interrupt',
      chatId: 'chat_1',
      runId: 'run_1',
      message: '',
    });
    await steerChat({
      requestId: 'req_steer',
      chatId: 'chat_1',
      runId: 'run_1',
      steerId: '550e8400-e29b-41d4-a716-446655440000',
      message: '再试一次',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/interrupt');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/steer');

    const interruptPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const steerPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));

    expect(interruptPayload.runId).toBe('run_1');
    expect(steerPayload.runId).toBe('run_1');
    expect(steerPayload.steerId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('posts chatId and runId for markChatRead', async () => {
    await markChatRead({
      chatId: 'chat_read',
      runId: 'run_read',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/read');
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload).toEqual({
      chatId: 'chat_read',
      runId: 'run_read',
    });
  });

  it('posts agentKey for markChatRead all', async () => {
    await markChatRead({ agentKey: 'agent_a' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/read');
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload).toEqual({
      agentKey: 'agent_a',
    });
  });

  it('posts feedback, delete, and global search payloads', async () => {
    await submitFeedback({
      chatId: 'chat_1',
      runId: 'run_1',
      type: 'thumbs_down',
      comment: 'bad',
    });
    await deleteChat({ chatId: 'chat_1' });
    await searchGlobal({
      query: 'needle',
      agentKey: 'agent_a',
      teamId: 'team_a',
      limit: 7,
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/feedback');
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      chatId: 'chat_1',
      runId: 'run_1',
      type: 'thumbs_down',
      comment: 'bad',
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/chat-delete');
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      chatId: 'chat_1',
    });
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/search');
    expect(JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body))).toEqual({
      query: 'needle',
      agentKey: 'agent_a',
      teamId: 'team_a',
      limit: 7,
    });
  });

  it('posts remember and learn commands to their dedicated endpoints', async () => {
    await rememberChat({
      requestId: 'req_remember',
      chatId: 'chat_1',
    });
    await learnChat({
      requestId: 'req_learn',
      chatId: 'chat_1',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/remember');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/learn');

    const rememberPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const learnPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));

    expect(rememberPayload).toEqual({
      requestId: 'req_remember',
      chatId: 'chat_1',
    });
    expect(learnPayload).toEqual({
      requestId: 'req_learn',
      chatId: 'chat_1',
    });

    expect(rememberPayload).not.toHaveProperty('message');
    expect(rememberPayload).not.toHaveProperty('planningMode');
    expect(rememberPayload).not.toHaveProperty('runId');
    expect(rememberPayload).not.toHaveProperty('agentKey');
    expect(rememberPayload).not.toHaveProperty('teamId');
    expect(learnPayload).not.toHaveProperty('message');
    expect(learnPayload).not.toHaveProperty('planningMode');
    expect(learnPayload).not.toHaveProperty('runId');
    expect(learnPayload).not.toHaveProperty('agentKey');
    expect(learnPayload).not.toHaveProperty('teamId');
  });

  it('requests voice capabilities and voices from the voice api namespace', async () => {
    await getVoiceCapabilities();
    await getVoiceVoices();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/voice/capabilities');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/voice/tts/voices');
  });

  it('requests a single agent by agentKey query param', async () => {
    await getAgent('demo-agent');

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/agent?agentKey=demo-agent');
  });

  it('injects a bridge token into app mode api requests', async () => {
    installWindow({ storedToken: 'bridge-token-1' });

    await getAgents();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer bridge-token-1',
    });
  });

  it('requests a bridge token when app mode starts without one', async () => {
    const { parent, dispatchMessage } = installWindow();

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'bridge-token-2',
          },
        } as MessageEvent);
      });
    });

    await getAgents();

    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'getAccessToken',
        reason: 'missing',
      }),
      '*',
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer bridge-token-2',
    });
  });

  it('refreshes the bridge token once after a 401 response', async () => {
    const { parent, dispatchMessage } = installWindow({ storedToken: 'stale-token' });

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'fresh-token',
          },
        } as MessageEvent);
      });
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 401, msg: 'expired', data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: 0, msg: 'ok', data: [] }),
      });

    await expect(getAgents()).resolves.toMatchObject({
      status: 200,
      data: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer stale-token',
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    });
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refreshAccessToken',
        reason: 'unauthorized',
      }),
      '*',
    );
  });

  it('injects the bridge token into query streams in app mode', async () => {
    installWindow({ storedToken: 'bridge-token-sse' });

    await createQueryStream({
      requestId: 'req_sse',
      message: '继续',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer bridge-token-sse',
      Accept: 'text/event-stream',
    });
  });

  it('parses voice capabilities from standard ApiResponse payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            websocketPath: '/api/voice/ws',
            asr: { configured: true },
          },
        }),
    });

    await expect(getVoiceCapabilitiesFlexible()).resolves.toEqual({
      websocketPath: '/api/voice/ws',
      asr: { configured: true },
    });
  });

  it('parses voice capabilities from bare json payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          websocketPath: '/api/voice/ws',
          asr: {
            defaults: {
              sampleRate: 16000,
            },
          },
        }),
    });

    await expect(getVoiceCapabilitiesFlexible()).resolves.toEqual({
      websocketPath: '/api/voice/ws',
      asr: {
        defaults: {
          sampleRate: 16000,
        },
      },
    });
  });

  it('parses voice voices from standard ApiResponse payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            defaultVoice: 'jarvis',
            voices: [
              { id: 'jarvis', displayName: 'Jarvis' },
            ],
          },
        }),
    });

    await expect(getVoiceVoicesFlexible()).resolves.toEqual({
      defaultVoice: 'jarvis',
      voices: [
        { id: 'jarvis', displayName: 'Jarvis' },
      ],
    });
  });

  it('parses voice voices from bare json payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          defaultVoice: 'jarvis',
          voices: [
            { id: 'jarvis', displayName: 'Jarvis' },
          ],
        }),
    });

    await expect(getVoiceVoicesFlexible()).resolves.toEqual({
      defaultVoice: 'jarvis',
      voices: [
        { id: 'jarvis', displayName: 'Jarvis' },
      ],
    });
  });

  it('keeps regular endpoints on strict ApiResponse parsing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ agents: [] }),
    });

    await expect(getAgents()).rejects.toThrow(
      'Response is not ApiResponse shape',
    );
  });

  it('builds resource urls from the new resource endpoint', () => {
    expect(buildResourceUrl('reports/demo image.png')).toBe(
      '/api/resource?file=reports%2Fdemo%20image.png',
    );
  });

  it('downloads resources with auth headers and a browser blob download', async () => {
    const createObjectURL = jest.fn(() => 'blob:download');
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const createElement = jest.fn(() => ({
      click,
      href: '',
      download: '',
      rel: '',
    }));

    global.document = {
      body: {
        appendChild,
        removeChild,
      },
      createElement,
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;
    setAccessToken('demo-token');

    const blob = new Blob(['demo']);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => blob,
    });

    await downloadResource('/api/resource?file=chat_1%2Fdemo.txt', {
      filename: 'demo.txt',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resource?file=chat_1%2Fdemo.txt');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer demo-token',
    });
    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
  });

  it('surfaces api error messages when resource downloads fail', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          code: 40301,
          msg: 'token expired',
          data: null,
        }),
    });

    await expect(downloadResource('/api/resource?file=private.txt')).rejects.toMatchObject({
      message: 'token expired',
      status: 403,
      code: 40301,
    });
  });

  it('uploads files with a single multipart request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            requestId: 'upload_req_1',
            chatId: 'chat_1',
            upload: {
              id: 'r01',
              type: 'file',
              name: 'demo.txt',
              mimeType: 'text/plain',
              sizeBytes: 4,
              url: '/api/resource?file=chat_1%2Fdemo.txt',
              sha256: 'abc123',
            },
          },
        }),
    });

    const blob = new Blob(['demo'], { type: 'text/plain' });

    await uploadFile({
      file: blob,
      filename: 'demo.txt',
      requestId: 'upload_req_1',
      chatId: 'chat_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe('/api/upload');
    expect(uploadOptions.method).toBe('POST');
    expect(uploadOptions.headers).toEqual({});
    expect(uploadOptions.body).toBeInstanceOf(FormData);

    const formData = uploadOptions.body as FormData;
    expect(formData.get('requestId')).toBe('upload_req_1');
    expect(formData.get('chatId')).toBe('chat_1');
    expect(formData.get('sha256')).toBeNull();
    const file = formData.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('demo.txt');
    expect((file as File).type).toBe('text/plain');
    await expect((file as File).text()).resolves.toBe('demo');
  });

  it('exposes the uploaded chat id from the new upload response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            requestId: 'upload_req_2',
            chatId: 'chat_generated',
            upload: {
              id: 'r01',
              type: 'image',
              name: 'photo.png',
              mimeType: 'image/png',
              sizeBytes: 3,
              url: '/api/resource?file=chat_generated%2Fphoto.png',
              sha256: 'def456',
            },
          },
        }),
    });

    const blob = new Blob(['img'], { type: 'image/png' });
    const response = await uploadFile({
      file: blob,
      filename: 'photo.png',
      requestId: 'upload_req_2',
    });

    expect(extractUploadChatId(response.data)).toBe('chat_generated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('extracts upload references from the new upload response', () => {
    expect(
      extractUploadReferences({
        references: [{ id: 'ref_1' }],
      }),
    ).toEqual([{ id: 'ref_1' }]);

    expect(
      extractUploadReferences({
        upload: {
          id: 'r02',
          type: 'image',
          name: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 3,
          url: '/api/resource?file=chat_generated%2Fphoto.png',
          sha256: 'def456',
        },
      }),
    ).toEqual([
      {
        id: 'r02',
        type: 'image',
        name: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        url: '/api/resource?file=chat_generated%2Fphoto.png',
        sha256: 'def456',
      },
    ]);

    expect(extractUploadReferences({ reference: { id: 'legacy' } })).toEqual([]);
    expect(extractUploadReferences(null)).toEqual([]);
  });

  it('normalizes chat summaries from /api/chats into hasPendingAwaiting while preserving read state', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: [
            {
              chatId: 'chat_1',
              chatName: 'Need approval',
              read: {
                isRead: false,
                readAt: 456,
                readRunId: 'run_1',
              },
              awaiting: {
                awaitingId: 'await_1',
                runId: 'run_1',
                mode: 'approval',
                createdAt: 123,
              },
            },
            {
              chatId: 'chat_2',
              chatName: 'No waiting',
            },
          ],
        }),
    });

    const response = await getChats();

    expect(response.data).toEqual([
      {
        chatId: 'chat_1',
        chatName: 'Need approval',
        read: {
          isRead: false,
          readAt: 456,
          readRunId: 'run_1',
        },
        awaiting: {
          awaitingId: 'await_1',
          runId: 'run_1',
          mode: 'approval',
          createdAt: 123,
        },
        hasPendingAwaiting: true,
      },
      {
        chatId: 'chat_2',
        chatName: 'No waiting',
        hasPendingAwaiting: false,
      },
    ]);
  });
});
