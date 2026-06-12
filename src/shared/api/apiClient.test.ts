import { Blob } from 'buffer';
import { AGENT_APP_ACCESS_TOKEN_STORAGE_KEY } from '@/shared/api/appAuth';
import {
  initializeDesktopQueryContextBridge,
  resetDesktopQueryContextBridgeForTests,
} from '@/shared/api/desktopQueryContext';
import { resetCompactIdStateForTests } from '@/shared/utils/compactId';
import {
  buildResourceUrl,
  archiveChats,
  createAttachStream,
  compactChat,
  createAgent,
  createAutomation,
  createRequestId,
  createQueryStream,
  deleteArchive,
  deleteAgent,
  deleteChat,
  deleteAutomation,
  downloadResource,
  downloadChatExport,
  extractUploadChatId,
  extractUploadReferences,
  getAdminAgentDetail,
  getAdminAgentOrder,
  getAdminAgents,
  getArchive,
  getAgent,
  getAgentOrder,
  getAgentEditorOptions,
  getAgents,
  getChatRawJsonl,
  getArchives,
  getChats,
  getFileHistory,
  getMemoryRecord,
  getMemoryRecords,
  getMemoryMeta,
  getMemoryScope,
  getMemoryScopes,
  getModelOptions,
  getAutomation,
  getAutomationExecutions,
  getAutomations,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
  getVoiceCapabilities,
  getVoiceCapabilitiesFlexible,
  getVoiceVoices,
  getVoiceVoicesFlexible,
  interruptChat,
  learnChat,
  markChatRead,
  openAgentWorkspace,
  rememberChat,
  renameChat,
  searchArchives,
  searchGlobal,
  setAccessToken,
  steerChat,
  submitAwaiting,
  submitFeedback,
  submitTool,
  toggleAutomation,
  updateAgent,
  updateAccessLevel,
  updateAgentModelConfig,
  putAdminAgentOrder,
  putAgentOrder,
  updateAutomation,
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

  getAll(name: string): unknown[] {
    return this.values.get(name) || [];
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
  search?: string;
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
    location: {
      pathname: options.pathname ?? '/',
      search: options.search ?? '',
    },
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
    setInterval,
    clearInterval,
  };

  (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
  (globalThis as typeof globalThis & {
    __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
  }).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    DESKTOP_APP: 'true',
  };

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
    resetDesktopQueryContextBridgeForTests();
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
    resetDesktopQueryContextBridgeForTests();
    delete (globalThis as typeof globalThis & {
      __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
    }).__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
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

  it('keeps query params empty in desktop app mode when no business params are provided', async () => {
    installWindow({
      pathname: '/copilot',
      storedToken: 'desktop-token',
    });

    await createQueryStream({
      requestId: 'req_desktop',
      message: '当前页面是什么',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_desktop',
      planningMode: false,
      message: '当前页面是什么',
    });
  });

  it('passes business params unchanged in desktop app mode', async () => {
    const { dispatchMessage, parent } = installWindow({
      pathname: '/copilot',
      storedToken: 'desktop-token',
    });
    initializeDesktopQueryContextBridge();
    dispatchMessage({
      source: parent as unknown as MessageEventSource,
      data: {
        type: 'desktopContextChanged',
        desktop: {
          route: '/settings?section=navigation',
          pageKey: 'native:/settings?section=navigation',
          pageKind: 'native',
          permissionMode: 'page_control',
          snapshotVersion: 7,
          snapshotAt: '2026-05-16T12:00:00.000Z',
          pageContext: {
            title: '设置',
            url: 'desktop://settings/navigation',
          },
        },
      },
    } as MessageEvent);

    await createQueryStream({
      requestId: 'req_desktop_snapshot',
      message: '当前页面是什么',
      params: { city: 'beijing' },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_desktop_snapshot',
      planningMode: false,
      message: '当前页面是什么',
      params: { city: 'beijing' },
    });
  });

  it('sends access level and model overrides at the query top level', async () => {
    await createQueryStream({
      requestId: 'req_access_model',
      message: '继续',
      accessLevel: 'auto_approve',
      model: {
        key: 'gpt-5.5',
        reasoningEffort: 'HIGH',
      },
      params: { city: 'beijing' },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_access_model',
      planningMode: false,
      message: '继续',
      accessLevel: 'auto_approve',
      model: {
        key: 'gpt-5.5',
        reasoningEffort: 'HIGH',
      },
      params: { city: 'beijing' },
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

  it('sends automation management requests as JSON posts', async () => {
    await getAutomations();
    await getAutomation('daily-demo');
    await createAutomation({
      name: 'Daily Demo',
      description: 'Demo automation',
      cron: '0 9 * * *',
      agentKey: 'demo-agent',
      enabled: true,
      query: { message: 'hello', role: 'user' },
    });
    await updateAutomation({
      id: 'daily-demo',
      cron: '0 18 * * 1-5',
      query: { message: 'updated' },
    });
    await toggleAutomation({ id: 'daily-demo', enabled: false });
    await getAutomationExecutions({ id: 'daily-demo', limit: 20 });
    await deleteAutomation({ id: 'daily-demo' });

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      body: JSON.parse(String((options as RequestInit).body || '{}')),
    }));
    expect(calls).toEqual([
      { url: '/api/automations', body: {} },
      { url: '/api/automation', body: { id: 'daily-demo' } },
      {
        url: '/api/automation/create',
        body: {
          name: 'Daily Demo',
          description: 'Demo automation',
          cron: '0 9 * * *',
          agentKey: 'demo-agent',
          enabled: true,
          query: { message: 'hello', role: 'user' },
        },
      },
      {
        url: '/api/automation/update',
        body: {
          id: 'daily-demo',
          cron: '0 18 * * 1-5',
          query: { message: 'updated' },
        },
      },
      { url: '/api/automation/toggle', body: { id: 'daily-demo', enabled: false } },
      { url: '/api/automation/executions', body: { id: 'daily-demo', limit: 20 } },
      { url: '/api/automation/delete', body: { id: 'daily-demo' } },
    ]);
  });

  it('sends agent management requests as JSON posts', async () => {
    await createAgent({
      key: 'editable-agent',
      definition: {
        key: 'editable-agent',
        name: 'Editable Agent',
        mode: 'REACT',
      },
      soulPrompt: 'Soul v1',
      agentsPrompt: 'Agents v1',
    });
    await updateAgent({
      key: 'editable-agent',
      definition: {
        key: 'editable-agent',
        name: 'Editable Agent',
        mode: 'REACT',
        description: 'updated',
      },
    });
    await updateAgentModelConfig({
      agentKey: 'editable-agent',
      modelKey: 'coder-model',
      reasoningEffort: 'HIGH',
    });
    await deleteAgent({ key: 'editable-agent' });
    await openAgentWorkspace({ agentKey: 'editable-agent' });

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      body: JSON.parse(String((options as RequestInit).body || '{}')),
    }));
    expect(calls).toEqual([
      {
        url: '/api/agent/create',
        body: {
          key: 'editable-agent',
          definition: {
            key: 'editable-agent',
            name: 'Editable Agent',
            mode: 'REACT',
          },
          soulPrompt: 'Soul v1',
          agentsPrompt: 'Agents v1',
        },
      },
      {
        url: '/api/agent/update',
        body: {
          key: 'editable-agent',
          definition: {
            key: 'editable-agent',
            name: 'Editable Agent',
            mode: 'REACT',
            description: 'updated',
          },
        },
      },
      {
        url: '/api/agent/model-config',
        body: {
          agentKey: 'editable-agent',
          modelKey: 'coder-model',
          reasoningEffort: 'HIGH',
        },
      },
      { url: '/api/agent/delete', body: { key: 'editable-agent' } },
      {
        url: '/api/agent/open-workspace',
        body: { agentKey: 'editable-agent' },
      },
    ]);
  });

  it('loads agent editor options', async () => {
    await getAgentEditorOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agent/editor-options',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads global model options', async () => {
    await getModelOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-options',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('keeps runId for interrupt and steer requests', async () => {
    await interruptChat({
      requestId: 'req_interrupt',
      chatId: 'chat_1',
      runId: 'run_1',
      agentKey: 'demo-agent',
      message: '',
    });
    await steerChat({
      requestId: 'req_steer',
      chatId: 'chat_1',
      runId: 'run_1',
      agentKey: 'demo-agent',
      steerId: '550e8400-e29b-41d4-a716-446655440000',
      message: '再试一次',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/interrupt');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/steer');

    const interruptPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const steerPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));

    expect(interruptPayload.runId).toBe('run_1');
    expect(interruptPayload.agentKey).toBe('demo-agent');
    expect(steerPayload.runId).toBe('run_1');
    expect(steerPayload.agentKey).toBe('demo-agent');
    expect(steerPayload.steerId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('posts access level updates for active runs', async () => {
    await updateAccessLevel({
      requestId: 'req_access',
      runId: 'run_1',
      agentKey: 'demo-agent',
      accessLevel: 'auto_approve',
      reason: 'user toggled permission',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/access-level');
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));

    expect(payload).toEqual({
      requestId: 'req_access',
      runId: 'run_1',
      agentKey: 'demo-agent',
      accessLevel: 'auto_approve',
      reason: 'user toggled permission',
    });
  });

  it('posts agentKey for run submit requests', async () => {
    await submitTool({
      runId: 'run_1',
      agentKey: 'demo-agent',
      toolId: 'tool_1',
      params: { city: 'beijing' },
    });
    await submitAwaiting({
      chatId: 'chat_1',
      runId: 'run_1',
      agentKey: 'demo-agent',
      awaitingId: 'await_1',
      submitId: 'submit_1',
      params: [],
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/submit');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/submit');

    const toolPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const awaitingPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));

    expect(toolPayload.agentKey).toBe('demo-agent');
    expect(awaitingPayload.agentKey).toBe('demo-agent');
    expect(awaitingPayload.chatId).toBe('chat_1');
    expect(awaitingPayload.submitId).toBe('submit_1');
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
    await renameChat({ chatId: 'chat_1', chatName: ' Renamed chat ' });
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
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/chat/delete?chatId=chat_1');
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
    });
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/chat/rename?chatId=chat_1');
    expect(JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body))).toEqual({
      chatName: ' Renamed chat ',
    });
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe('/api/search');
    expect(JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      query: 'needle',
      agentKey: 'agent_a',
      teamId: 'team_a',
      limit: 7,
    });
  });

  it('calls archive endpoints with expected payloads and query params', async () => {
    await archiveChats({ chatIds: ['chat_1', 'chat_2'] });
    await getArchives({ agentKey: 'agent_a', limit: 20, offset: 40 });
    await getArchive('chat_1', true);
    await searchArchives({ query: 'needle', agentKey: 'agent_a', limit: 5 });
    await deleteArchive({ chatId: 'chat_1' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chat/archive');
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      chatIds: ['chat_1', 'chat_2'],
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/archives?agentKey=agent_a&limit=20&offset=40');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/archive?chatId=chat_1&includeRawMessages=true');
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe('/api/archive/search');
    expect(JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      query: 'needle',
      agentKey: 'agent_a',
      limit: 5,
    });
    expect((fetchMock.mock.calls[4] as [string, RequestInit])[0]).toBe('/api/archive/delete?chatId=chat_1');
    expect(JSON.parse(String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body))).toEqual({
    });
  });

  it('posts remember, learn, and compact commands to their dedicated endpoints', async () => {
    await rememberChat({
      requestId: 'req_remember',
      chatId: 'chat_1',
    });
    await learnChat({
      requestId: 'req_learn',
      chatId: 'chat_1',
    });
    await compactChat({
      requestId: 'req_compact',
      chatId: 'chat_1',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/remember');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/learn');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/compact');

    const rememberPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const learnPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    const compactPayload = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));

    expect(rememberPayload).toEqual({
      requestId: 'req_remember',
      chatId: 'chat_1',
    });
    expect(learnPayload).toEqual({
      requestId: 'req_learn',
      chatId: 'chat_1',
    });
    expect(compactPayload).toEqual({
      requestId: 'req_compact',
      chatId: 'chat_1',
      trigger: 'manual',
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
    expect(compactPayload).not.toHaveProperty('message');
    expect(compactPayload).not.toHaveProperty('planningMode');
    expect(compactPayload).not.toHaveProperty('runId');
    expect(compactPayload).not.toHaveProperty('agentKey');
    expect(compactPayload).not.toHaveProperty('teamId');
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

  it('requests file history with encoded path and version', async () => {
    await getFileHistory({
      chatId: 'chat_1',
      runId: 'run_1',
      filePath: '/workspace/src/App.tsx',
      version: 'current',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/file/history?chatId=chat_1&runId=run_1&filePath=%2Fworkspace%2Fsrc%2FApp.tsx&version=current',
    );
  });

  it('requests memory records and detail over HTTP query params', async () => {
    await getMemoryRecords({
      agentKey: 'agent-a',
      keyword: 'bugfix',
      kind: 'fact',
      scopeType: 'agent',
      status: 'active',
      category: 'general',
      limit: 15,
    });
    await getMemoryRecord('agent-a', 'mem_101');

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/memory/record/list?agentKey=agent-a&keyword=bugfix&kind=fact&scopeType=agent&status=active&category=general&limit=15',
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      '/api/memory/record/detail?agentKey=agent-a&recordId=mem_101',
    );
  });

  it('requests memory scopes, scope detail, validate, and save over HTTP', async () => {
    await getMemoryScopes('agent-a');
    await getMemoryMeta();
    await getMemoryScope('agent-a', 'agent', 'agent:agent-a');
    await validateMemoryScope('agent-a', 'agent', '# AGENT');
    await previewMemoryContext({
      chatId: 'chat-preview',
      message: 'desktop builtin 发布流程',
    });
    await saveMemoryScope({
      agentKey: 'agent-a',
      scopeType: 'agent',
      scopeKey: 'agent:agent-a',
      mode: 'records',
      archiveMissing: true,
      records: [
        {
          id: 'mem_1',
          title: '偏好中文输出',
          summary: 'Prefer Chinese output.',
          category: 'general',
          importance: 8,
          confidence: 0.95,
          tags: ['preference'],
        },
      ],
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/memory/scope/list?agentKey=agent-a',
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      '/api/memory/meta',
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      '/api/memory/scope/detail?agentKey=agent-a&scopeType=agent&scopeKey=agent%3Aagent-a',
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      '/api/memory/scope/validate',
    );
    expect(JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      agentKey: 'agent-a',
      scopeType: 'agent',
      markdown: '# AGENT',
    });
    expect((fetchMock.mock.calls[4] as [string, RequestInit])[0]).toBe(
      '/api/memory/context-preview',
    );
    expect(JSON.parse(String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body))).toEqual({
      chatId: 'chat-preview',
      message: 'desktop builtin 发布流程',
    });
    expect((fetchMock.mock.calls[5] as [string, RequestInit])[0]).toBe(
      '/api/memory/scope/save',
    );
    expect(JSON.parse(String((fetchMock.mock.calls[5] as [string, RequestInit])[1].body))).toEqual({
      agentKey: 'agent-a',
      scopeType: 'agent',
      scopeKey: 'agent:agent-a',
      mode: 'records',
      archiveMissing: true,
      records: [
        {
          id: 'mem_1',
          title: '偏好中文输出',
          summary: 'Prefer Chinese output.',
          category: 'general',
          importance: 8,
          confidence: 0.95,
          tags: ['preference'],
        },
      ],
    });
  });

  it('injects a bridge token into app mode api requests', async () => {
    installWindow({ storedToken: 'bridge-token-1' });

    await getAgents();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer bridge-token-1',
    });
  });

  it('keeps getAgents queryless by default and supports includeChats and scope', async () => {
    await getAgents();
    await getAgents({ includeChats: 5 });
    await getAgents({ includeChats: 5, scope: 'copilot' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/agents');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/agents?includeChats=5');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/agents?includeChats=5&scope=copilot');
  });

  it('supports reading and writing agent order', async () => {
    await getAgentOrder();
    await putAgentOrder({ order: ['agent-b', 'agent-a'] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/agents/order');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('GET');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/agents/order');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ order: ['agent-b', 'agent-a'] }),
    });
  });

  it('uses admin endpoints for management agent discovery, detail, and order', async () => {
    await getAdminAgents();
    await getAdminAgentDetail('bad-agent');
    await getAdminAgentOrder();
    await putAdminAgentOrder({ order: ['bad-agent', 'agent-a'] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/admin/agents');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/admin/agents/detail?agentKey=bad-agent');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/admin/agents/order');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[1].method).toBe('GET');
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe('/api/admin/agents/order');
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ order: ['bad-agent', 'agent-a'] }),
    });
  });

  it('supports filtering getChats by agentKey', async () => {
    await getChats({ agentKey: 'agent-a' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chats?agentKey=agent-a');
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

  it('creates authenticated attach streams with runId and lastSeq query params', async () => {
    installWindow({ storedToken: 'bridge-token-attach' });

    await createAttachStream({
      runId: 'run id/1',
      agentKey: 'demo-agent',
      lastSeq: 12,
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/attach?runId=run+id%2F1&agentKey=demo-agent&lastSeq=12');
    expect(options.method).toBe('GET');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer bridge-token-attach',
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

  it('recovers legacy utf8 filenames from chat export content disposition', async () => {
    const createObjectURL = jest.fn(() => 'blob:chat-export');
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const anchor = {
      click,
      href: '',
      download: '',
      rel: '',
    };

    global.document = {
      body: {
        appendChild,
        removeChild,
      },
      createElement: jest.fn(() => anchor),
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="ä½ å¥½.md"'
            : null,
      },
      blob: async () => new Blob(['demo']),
    });

    await downloadChatExport('chat_1');

    expect(anchor.download).toBe('你好.md');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('loads raw chat jsonl as authenticated text', async () => {
    setAccessToken('demo-token');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"_type":"query"}\n',
    });

    await expect(getChatRawJsonl('chat_1')).resolves.toBe('{"_type":"query"}\n');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/jsonl?chatId=chat_1');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer demo-token',
    });
  });

  it('surfaces api error messages when raw chat jsonl loading fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          code: 404,
          msg: 'chat not found',
          data: {},
        }),
    });

    await expect(getChatRawJsonl('missing')).rejects.toMatchObject({
      message: 'chat not found',
      status: 404,
      code: 404,
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
