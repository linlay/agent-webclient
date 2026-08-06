import { Blob } from 'buffer';
import { ACCESS_TOKEN_STORAGE_KEY } from '@/shared/data/auth/accessTokenStorage';
import {
  AGENT_APP_AUTH_CONTEXT_STORAGE_KEY,
  AGENT_APP_ACCESS_TOKEN_STORAGE_KEY,
  APP_AUTH_RESPONSE_TYPE,
} from '@/shared/data/auth/appAuth';
import {
  initializeDesktopQueryContextBridge,
  resetDesktopQueryContextBridgeForTests,
} from '@/shared/data/desktop/desktopQueryContext';
import { resetCompactIdStateForTests } from '@/shared/utils/compactId';

jest.mock("@/shared/data/clientSurfaceId", () => ({
  getClientSurfaceId: () => "surface-test",
}));
jest.mock("@/shared/data/clientDeviceId", () => ({
  getClientDeviceId: () => "device-test",
}));
import {
  buildResourceUrl,
  classifyResourceUrl,
  getResourceBlob,
  getResourceText,
  isLegacyResourceUrl,
  isChatScopeResourceRef,
  resolveResourceFetchUrl,
  buildAdminSkillDownloadUrl,
  buildAdminSkillFileDownloadUrl,
  archiveChats,
  createAttachStream,
  compactChat,
  createAgent,
  createAutomation,
  createBTWStream,
  createRequestId,
  createQueryStream,
  deriveChat,
  deleteArchive,
  deleteAgent,
  deleteAdminAgentPrivateSkill,
  deleteChat,
  deleteAutomation,
  downloadResource,
  downloadChatExport,
  extractUploadChatId,
  extractUploadReferences,
  getAdminAgentDetail,
  getAdminSource,
  getAdminAgentEditorOptions,
  getAdminAgentOrder,
  getAdminAgents,
  getAdminSkills,
  getAdminTools,
  getAdminRegistries,
  getArchive,
  getAgent,
	getAgentSkills,
	getAgentFile,
  getAgentOrder,
  getAgents,
  getChatLLMTraceRaw,
  getChatRawJsonl,
	getChatSystemPrompt,
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
  interruptBTWRun,
  interruptChat,
  learnChat,
  markChatRead,
  normalizeChatSummariesPayload,
  openAgentDirectory,
  rememberChat,
  renameChat,
  restoreArchives,
  searchArchives,
  searchGlobal,
  setAccessToken,
  createAdminSkillFile,
  createAdminSkill,
  deleteAdminSkill,
  deleteAdminSkillFile,
  downloadAdminSkill,
  downloadAdminSkillFile,
  fetchAdminSkillIcon,
  getAdminSkillDetail,
  importAdminSkill,
  importAdminAgentPrivateSkill,
  mkdirAdminSkillFile,
  renameAdminSkillFile,
  uploadAdminSkillFile,
  validateAdminSkill,
  steerChat,
  submitAwaiting,
  submitFeedback,
  submitTool,
  toggleAutomation,
  updateAgent,
  updateAdminSource,
  updateAgentName,
  updateAccessLevel,
  updateAgentModelConfig,
  putAdminAgentOrder,
  putAgentOrder,
  updateAutomation,
  uploadFile,
  validateAdminRegistry,
} from '@/shared/data/api/client';

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
      ? {
          [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken,
          [AGENT_APP_AUTH_CONTEXT_STORAGE_KEY]: 'desktop-auth-current',
        }
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
    __AGENT_APP_AUTH_CONTEXT: options.storedToken
      ? 'desktop-auth-current'
      : undefined,
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

function installStandaloneLocalStorage(initial: Record<string, string> = {}) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createMockStorage(initial),
  });
}

describe('data client query payloads', () => {
  const fetchMock = jest.fn();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

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
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_1',
      message: '显示广州的天气',
      agentKey: 'demo-agent',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('planningMode');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('agentMode');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('runId');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('stream');
  });

  it('sends one normalized required skill with chat and site references', async () => {
    await createQueryStream({
      requestId: 'req_context',
      message: 'Use the selected context',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
      mustUseSkills: [' product-design ', 'PRODUCT-DESIGN'],
      references: [
        {
          type: 'chat',
          id: 'chat_2',
          name: 'Previous design',
          meta: { agentKey: 'demo-agent' },
        },
        {
          type: 'site',
          id: 'website:docs',
          name: 'Docs',
          url: 'https://example.com',
          meta: { kind: 'website' },
        },
      ],
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({
      mustUseSkills: ['product-design'],
      references: [
        {
          type: 'chat',
          id: 'chat_2',
          name: 'Previous design',
        },
        {
          type: 'site',
          id: 'website:docs',
          name: 'Docs',
          url: 'https://example.com',
        },
      ],
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('requiredSkillKeys');
  });

  it('sends BTW streams without mutable routing fields', async () => {
    await createBTWStream({
      requestId: 'req_btw_1',
      runId: 'run_btw_1',
      chatId: 'chat_1',
      btwId: 'btw_1',
      message: 'side question',
      references: [{ name: 'spec.md' }],
      accessLevel: 'default',
      stream: true,
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(url).toBe('/api/btw');
    expect(body).toEqual({
      requestId: 'req_btw_1',
      runId: 'run_btw_1',
      chatId: 'chat_1',
      btwId: 'btw_1',
      message: 'side question',
      references: [{ name: 'spec.md' }],
      accessLevel: 'default',
      stream: true,
    });
    expect(body).not.toHaveProperty('agentKey');
    expect(body).not.toHaveProperty('teamId');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('planningMode');
  });

  it('includes planningMode=true for CODER query streams', async () => {
    await createQueryStream({
      requestId: 'req_2',
      message: '继续',
      planningMode: true,
      agentMode: 'CODER',
      chatId: 'chat_1',
      owner: { kind: 'agent', agentKey: 'demoViewport' },
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
    expect(JSON.parse(String(options.body))).not.toHaveProperty('agentMode');
  });

  it('includes planningMode=false for CODER query streams when disabled', async () => {
    await createQueryStream({
      requestId: 'req_coder_false',
      message: '普通执行',
      planningMode: false,
      agentMode: 'CODER',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_coder_false',
      message: '普通执行',
      planningMode: false,
      agentKey: 'demo-agent',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('agentMode');
  });

  it('omits planningMode for non-CODER query streams even when enabled', async () => {
    await createQueryStream({
      requestId: 'req_react_plan_stale',
      message: '非 CODER 请求',
      planningMode: true,
      agentMode: 'REACT',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_react_plan_stale',
      message: '非 CODER 请求',
      agentKey: 'demo-agent',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('planningMode');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('agentMode');
  });

  it('includes top-level editingMode=true only for KBASE query streams', async () => {
    await createQueryStream({
      requestId: 'req_kbase_edit',
      message: '更新知识文档',
      editingMode: true,
      agentMode: 'KBASE',
      params: {
        editingMode: true,
        topic: 'guide',
      },
      owner: { kind: 'agent', agentKey: 'knowledge-agent' },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_kbase_edit',
      message: '更新知识文档',
      editingMode: true,
      agentKey: 'knowledge-agent',
      params: { topic: 'guide' },
    });
  });

  it('omits editingMode when disabled or when the target is not KBASE', async () => {
    await createQueryStream({
      requestId: 'req_kbase_readonly',
      message: '读取知识文档',
      editingMode: false,
      agentMode: 'KBASE',
      owner: { kind: 'agent', agentKey: 'knowledge-agent' },
    });
    await createQueryStream({
      requestId: 'req_react_edit_stale',
      message: '普通请求',
      editingMode: true,
      agentMode: 'REACT',
      owner: { kind: 'agent', agentKey: 'react-agent' },
    });

    for (const [, options] of fetchMock.mock.calls as [string, RequestInit][]) {
      const body = JSON.parse(String(options.body));
      expect(body).not.toHaveProperty('editingMode');
      expect(body.params).not.toEqual(
        expect.objectContaining({ editingMode: expect.anything() }),
      );
    }
  });

  it('keeps query params empty in desktop app mode when no business params are provided', async () => {
    installWindow({
      pathname: '/copilot',
      storedToken: 'desktop-token',
    });

    await createQueryStream({
      requestId: 'req_desktop',
      message: '当前页面是什么',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_desktop',
      message: '当前页面是什么',
      agentKey: 'demo-agent',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('planningMode');
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
      params: { city: 'beijing' },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_desktop_snapshot',
      message: '当前页面是什么',
      agentKey: 'demo-agent',
      params: { city: 'beijing' },
    });
  });

  it('sends access level and model overrides at the query top level', async () => {
    await createQueryStream({
      requestId: 'req_access_model',
      message: '继续',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
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
      message: '继续',
      agentKey: 'demo-agent',
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
      references: [{ id: 'upload_1', name: 'spec.md' }],
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_3',
      message: '',
      agentKey: 'demo-agent',
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
    await updateAgentName({
      key: 'editable-agent',
      name: 'Renamed Agent',
    });
    await updateAgentModelConfig({
      agentKey: 'editable-agent',
      modelKey: 'coder-model',
      reasoningEffort: 'HIGH',
    });
    await deleteAgent({ key: 'editable-agent' });
    await openAgentDirectory({
      agentKey: 'editable-agent',
      directoryType: 'config',
    });

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      body: JSON.parse(String((options as RequestInit).body || '{}')),
    }));
    expect(calls).toEqual([
      {
        url: '/api/admin/agents/create',
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
        url: '/api/admin/agents/update',
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
        url: '/api/admin/agents/update-name',
        body: {
          key: 'editable-agent',
          name: 'Renamed Agent',
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
      { url: '/api/admin/agents/delete', body: { key: 'editable-agent' } },
      {
        url: '/api/agent/open-directory',
        body: {
          agentKey: 'editable-agent',
          directoryType: 'config',
        },
      },
    ]);
  });

  it('loads admin agent editor options', async () => {
    await getAdminAgentEditorOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/agents/editor-options',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses canonical skills admin manifest and generic source endpoints', async () => {
    await getAdminSkills();
    await getAdminSkillDetail('demo-skill', 'SKILL.md');
    await getAdminSource({ type: 'skill', key: 'demo-skill', path: 'SKILL.md' });
    await updateAdminSource({
      target: { type: 'skill', key: 'demo-skill', path: 'SKILL.md' },
      content: '# My Skill',
      baseSha256: 'abc123',
    });
    await createAdminSkillFile({
      key: 'demo-skill',
      path: 'references/new.md',
      content: '',
    });
    await mkdirAdminSkillFile({
      key: 'demo-skill',
      path: 'assets',
    });
    await renameAdminSkillFile({
      key: 'demo-skill',
      fromPath: 'old.md',
      toPath: 'new.md',
    });
    await deleteAdminSkillFile({
      key: 'demo-skill',
      path: 'old.md',
      baseSha256: 'old-sha',
    });
    await validateAdminSkill('demo-skill');
    await createAdminSkill({
      key: 'new-skill',
      skillMd: '---\nname: New Skill\n---\n',
    });
    await deleteAdminSkill('demo-skill');

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      method: (options as RequestInit).method || 'GET',
      body: JSON.parse(String((options as RequestInit).body || '{}')),
    }));

    expect(calls).toEqual([
      { url: '/api/admin/skills', method: 'GET', body: {} },
      {
        url: '/api/admin/skills/detail?key=demo-skill&openPath=SKILL.md',
        method: 'GET',
        body: {},
      },
      {
        url: '/api/admin/source?type=skill&key=demo-skill&path=SKILL.md',
        method: 'GET',
        body: {},
      },
      {
        url: '/api/admin/source',
        method: 'PUT',
        body: {
          target: { type: 'skill', key: 'demo-skill', path: 'SKILL.md' },
          content: '# My Skill',
          baseSha256: 'abc123',
        },
      },
      {
        url: '/api/admin/skills/file/create',
        method: 'POST',
        body: {
          key: 'demo-skill',
          path: 'references/new.md',
          content: '',
        },
      },
      {
        url: '/api/admin/skills/file/mkdir',
        method: 'POST',
        body: {
          key: 'demo-skill',
          path: 'assets',
        },
      },
      {
        url: '/api/admin/skills/file/rename',
        method: 'POST',
        body: {
          key: 'demo-skill',
          fromPath: 'old.md',
          toPath: 'new.md',
        },
      },
      {
        url: '/api/admin/skills/file/delete',
        method: 'POST',
        body: {
          key: 'demo-skill',
          path: 'old.md',
          baseSha256: 'old-sha',
        },
      },
      {
        url: '/api/admin/skills/validate',
        method: 'POST',
        body: { key: 'demo-skill' },
      },
      {
        url: '/api/admin/skills/create',
        method: 'POST',
        body: {
          key: 'new-skill',
          skillMd: '---\nname: New Skill\n---\n',
        },
      },
      {
        url: '/api/admin/skills/delete',
        method: 'POST',
        body: { key: 'demo-skill' },
      },
    ]);

    expect(buildAdminSkillFileDownloadUrl('demo-skill', 'assets/blob.bin')).toBe(
      '/api/admin/skills/file/download?key=demo-skill&path=assets%2Fblob.bin',
    );
    expect(buildAdminSkillDownloadUrl('demo-skill')).toBe(
      '/api/admin/skills/download?key=demo-skill',
    );
  });

  it('encodes logical source target query values', async () => {
    await getAdminSource({
      type: 'skill',
      key: 'demo skill',
      path: 'references/a & b.md',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/admin/source?type=skill&key=demo+skill&path=references%2Fa+%26+b.md',
    );
  });

  it('fetches skill icons with bearer authentication', async () => {
    setAccessToken('skill-icon-token');
    const blob = new Blob(['png'], { type: 'image/png' });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'image/png' }),
      blob: async () => blob,
    });

    await expect(fetchAdminSkillIcon('/api/admin/skills/file/download?key=demo&path=assets%2Fdemo.png'))
      .resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/skills/file/download?key=demo&path=assets%2Fdemo.png',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer skill-icon-token' }),
      }),
    );
  });

  it('rejects unexpected or non-image skill icon responses without exposing the token', async () => {
    await expect(fetchAdminSkillIcon('https://example.com/demo.png')).rejects.toMatchObject({
      message: 'skill icon URL is invalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
      blob: async () => new Blob(['not an image']),
    });
    await expect(fetchAdminSkillIcon('/api/admin/skills/file/download?key=demo&path=assets%2Fdemo.png'))
      .rejects.toMatchObject({ message: 'skill icon response is not an image' });
  });

  it('downloads skill files and archives through authenticated Blob requests', async () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');
    const click = jest.fn();
    const anchor = { href: '', download: '', rel: '', click };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement: jest.fn(() => anchor),
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      },
    });
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: { createObjectURL: jest.fn(() => 'blob:skill'), revokeObjectURL: jest.fn() },
    });
    jest.useFakeTimers();
    setAccessToken('skill-download-token');
    const response = (filename: string) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Disposition': `attachment; filename="${filename}"` }),
      blob: async () => new Blob(['zip']),
    });
    fetchMock.mockResolvedValueOnce(response('asset.bin')).mockResolvedValueOnce(response('demo-skill.zip'));

    try {
      await downloadAdminSkillFile('demo-skill', 'assets/asset.bin');
      await downloadAdminSkill('demo-skill');
      jest.runAllTimers();
    } finally {
      jest.useRealTimers();
      if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
      else Reflect.deleteProperty(globalThis, 'document');
      if (urlDescriptor) Object.defineProperty(globalThis, 'URL', urlDescriptor);
      else Reflect.deleteProperty(globalThis, 'URL');
    }

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/skills/file/download?key=demo-skill&path=assets%2Fasset.bin',
      '/api/admin/skills/download?key=demo-skill',
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer skill-download-token' }));
    }
    expect(click).toHaveBeenCalledTimes(2);
    expect(anchor.download).toBe('demo-skill.zip');
  });

  it('uploads skills admin files with multipart form data', async () => {
    const blob = new Blob(['demo'], { type: 'text/plain' });

    await uploadAdminSkillFile({
      key: 'demo-skill',
      path: 'assets/demo.txt',
      file: blob,
      overwrite: true,
    });

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe('/api/admin/skills/file/upload');
    expect(uploadOptions.method).toBe('POST');
    expect(uploadOptions.headers).toEqual({});
    expect(uploadOptions.body).toBeInstanceOf(FormData);

    const formData = uploadOptions.body as FormData;
    expect(formData.get('key')).toBe('demo-skill');
    expect(formData.get('path')).toBe('assets/demo.txt');
    expect(formData.get('overwrite')).toBe('true');
    expect(formData.get('file')).toBe(blob);
  });

  it('imports a complete skill ZIP with multipart form data', async () => {
    const archive = new File(['zip'], 'demo-skill.zip', { type: 'application/zip' });

    await importAdminSkill({ key: 'demo-skill', file: archive });

    const [importUrl, importOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(importUrl).toBe('/api/admin/skills/import');
    expect(importOptions.method).toBe('POST');
    expect(importOptions.headers).toEqual({});
    expect(importOptions.body).toBeInstanceOf(FormData);

    const formData = importOptions.body as FormData;
    expect(formData.get('key')).toBe('demo-skill');
    expect(formData.get('file')).toBe(archive);
  });

  it('imports and deletes an Agent-private skill through the Agent admin routes', async () => {
    const archive = new File(['zip'], 'private.zip', { type: 'application/zip' });
    await importAdminAgentPrivateSkill({
      agentKey: 'demo-agent',
      file: archive,
    });
    await deleteAdminAgentPrivateSkill({ agentKey: 'demo-agent', key: 'private-skill' });

    const [importUrl, importOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(importUrl).toBe('/api/admin/agents/skills/import');
    expect(importOptions.method).toBe('POST');
    expect(importOptions.body).toBeInstanceOf(FormData);
    const formData = importOptions.body as FormData;
    expect(formData.get('agentKey')).toBe('demo-agent');
    expect(formData.get('key')).toBeNull();
    expect(formData.get('file')).toBe(archive);
    expect(formData.get('confirmCenterOverride')).toBeNull();

    const [deleteUrl, deleteOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(deleteUrl).toBe('/api/admin/agents/skills/delete');
    expect(JSON.parse(String(deleteOptions.body))).toEqual({
      agentKey: 'demo-agent',
      key: 'private-skill',
    });
  });

  it('keeps a non-JSON proxy failure readable to the user', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 504,
      text: async () => 'Error occurred while trying to proxy: 127.0.0.1:11948/api/admin/agents/skills/import',
    });

    await expect(getAdminAgents()).rejects.toMatchObject({
      status: 504,
      message: 'Error occurred while trying to proxy: 127.0.0.1:11948/api/admin/agents/skills/import',
    });
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
      message: '',
    });
    await steerChat({
      requestId: 'req_steer',
      chatId: 'chat_1',
      runId: 'run_1',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
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

  it('interrupts BTW runs directly over HTTP and preserves the typed acknowledgement', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          accepted: true,
          status: 'accepted',
          runId: 'btw_run_1',
          detail: 'interrupt accepted',
        },
      }),
    });

    const response = await interruptBTWRun({
      requestId: 'req_btw_interrupt',
      chatId: 'parent_chat_1',
      runId: 'btw_run_1',
      owner: { kind: 'orchestrated-team', teamId: 'demo-team' },
      message: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/interrupt');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_btw_interrupt',
      chatId: 'parent_chat_1',
      runId: 'btw_run_1',
      teamId: 'demo-team',
      message: '',
    });
    expect(response.data).toEqual({
      accepted: true,
      status: 'accepted',
      runId: 'btw_run_1',
      detail: 'interrupt accepted',
    });
  });

  it('posts access level updates for active runs', async () => {
    await updateAccessLevel({
      requestId: 'req_access',
      runId: 'run_1',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
      toolId: 'tool_1',
      params: { city: 'beijing' },
    });
    await submitAwaiting({
      chatId: 'chat_1',
      runId: 'run_1',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
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

  it('serializes every orchestrated Team run request with only teamId', async () => {
    const owner = { kind: 'orchestrated-team' as const, teamId: 'team_orchestrated' };

    await createQueryStream({
      requestId: 'req_team_query',
      chatId: 'chat_team',
      message: 'delegate this',
      owner,
    });
    await createAttachStream({ runId: 'run_team', owner, lastSeq: 3 });
    await submitTool({ runId: 'run_team', owner, toolId: 'tool_1', params: {} });
    await submitAwaiting({
      chatId: 'chat_team',
      runId: 'run_team',
      owner,
      awaitingId: 'await_1',
      submitId: 'submit_1',
      params: [],
    });
    await interruptChat({
      requestId: 'req_team_interrupt',
      chatId: 'chat_team',
      runId: 'run_team',
      owner,
      message: '',
    });
    await steerChat({
      requestId: 'req_team_steer',
      chatId: 'chat_team',
      runId: 'run_team',
      owner,
      steerId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'keep going',
    });
    await updateAccessLevel({
      requestId: 'req_team_access',
      runId: 'run_team',
      owner,
      accessLevel: 'auto_approve',
    });

    const bodies = [0, 2, 3, 4, 5, 6].map((index) =>
      JSON.parse(String((fetchMock.mock.calls[index] as [string, RequestInit])[1].body)),
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0])
      .toContain('teamId=team_orchestrated');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0])
      .not.toContain('agentKey=');
    for (const body of bodies) {
      expect(body).toHaveProperty('teamId', 'team_orchestrated');
      expect(body).not.toHaveProperty('agentKey');
    }
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
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe('/api/chats/search');
    expect(JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      query: 'needle',
      agentKey: 'agent_a',
      teamId: 'team_a',
      limit: 7,
    });
  });

  it('posts derive chat payload', async () => {
    await deriveChat({
      sourceChatId: 'chat_1',
      sourceRunId: 'run_1',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chat/derive');
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      sourceChatId: 'chat_1',
      sourceRunId: 'run_1',
    });
  });

  it('calls archive endpoints with expected payloads and query params', async () => {
    await archiveChats({ chatIds: ['chat_1', 'chat_2'] });
    await getArchives({ agentKey: 'agent_a', limit: 20, offset: 40 });
    await getArchive('chat_1', true);
    await searchArchives({ query: 'needle', agentKey: 'agent_a', limit: 5 });
    await deleteArchive({ chatId: 'chat_1' });
    await restoreArchives({ chatIds: ['chat_1'] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chat/archive');
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      chatIds: ['chat_1', 'chat_2'],
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/archives?agentKey=agent_a&limit=20&offset=40');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/archive?chatId=chat_1&includeRawMessages=true');
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe('/api/archives/search');
    expect(JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      query: 'needle',
      agentKey: 'agent_a',
      limit: 5,
    });
    expect((fetchMock.mock.calls[4] as [string, RequestInit])[0]).toBe('/api/archive/delete?chatId=chat_1');
    expect(JSON.parse(String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body))).toEqual({
    });
    expect((fetchMock.mock.calls[5] as [string, RequestInit])[0]).toBe('/api/archive/restore');
    expect(JSON.parse(String((fetchMock.mock.calls[5] as [string, RequestInit])[1].body))).toEqual({
      chatIds: ['chat_1'],
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

  it('requests the slash skill catalog for one agent', async () => {
    await getAgentSkills('mock-agent');

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/skills?agentKey=mock-agent',
    );
  });

  it('reads and updates an admin source file through the typed management endpoint', async () => {
    await getAdminSource({ type: 'agent', key: 'editable-agent' });
    await updateAdminSource({
      target: { type: 'agent', key: 'editable-agent' },
      content: '# keep this comment\nkey: editable-agent\n',
      baseSha256: 'source-sha',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/admin/source?type=agent&key=editable-agent',
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/admin/source',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          target: { type: 'agent', key: 'editable-agent' },
          content: '# keep this comment\nkey: editable-agent\n',
          baseSha256: 'source-sha',
        }),
      }),
    ]);
  });

  it('serializes automation source targets by logical key', async () => {
    await getAdminSource({ type: 'automation', key: 'daily-report' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/admin/source?type=automation&key=daily-report',
    );
  });

  it('requests an agent workspace file with the typed file endpoint', async () => {
    await getAgentFile({
      agentKey: 'coder-agent',
      path: '/Users/demo/project/Dockerfile',
      encoding: 'utf-8',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/file?agentKey=coder-agent&path=%2FUsers%2Fdemo%2Fproject%2FDockerfile&encoding=utf-8',
    );
  });

  it('requests a KBASE file without requiring a frontend workspace root', async () => {
    await getAgentFile({
      agentKey: 'knowledge-agent',
      path: 'docs/guide.md',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/file?agentKey=knowledge-agent&path=docs%2Fguide.md',
    );
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

  it('injects a stored standalone token into the first registry request', async () => {
    installStandaloneLocalStorage({
      [ACCESS_TOKEN_STORAGE_KEY]: 'stored-browser-token',
    });

    await getAdminRegistries();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      '/api/admin/registries',
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer stored-browser-token',
    });
  });

  it('prefers an explicit token over the stored standalone token', async () => {
    installStandaloneLocalStorage({
      [ACCESS_TOKEN_STORAGE_KEY]: 'stored-browser-token',
    });
    setAccessToken('manual-token');

    await getAdminRegistries();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer manual-token',
    });
  });

  it('keeps getAgents queryless by default and forwards mixed-list filters', async () => {
    await getAgents();
    await getAgents({ includeChats: 5 });
    await getAgents({ includeChats: 5, includeTeam: true, scope: 'copilot', mode: 'CODER' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/agents');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/agents?includeChats=5');
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe('/api/agents?includeChats=5&includeTeam=true&scope=copilot&mode=CODER');
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

  it('uses generic source endpoints for registry text and the registry validation endpoint', async () => {
    await getAdminRegistries();
    await getAdminSource({ type: 'registry', category: 'models', file: 'openai.yml' });
    await updateAdminSource({
      target: { type: 'registry', category: 'models', file: 'openai.yml' },
      content: 'key: openai\n',
    });
    await validateAdminRegistry({
      category: 'models',
      file: 'openai.yml',
      content: 'key: openai\n',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/admin/registries');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      '/api/admin/source?type=registry&category=models&file=openai.yml',
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      '/api/admin/source',
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({
        target: { type: 'registry', category: 'models', file: 'openai.yml' },
        content: 'key: openai\n',
      }),
    });
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      '/api/admin/registries/validate',
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        category: 'models',
        file: 'openai.yml',
        content: 'key: openai\n',
      }),
    });
  });

  it('supports filtering getChats by agentKey', async () => {
    await getChats({ agentKey: 'agent-a' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chats?agentKey=agent-a');
  });

  it('normalizes chat runtime summaries while respecting explicit status flags', () => {
    expect(normalizeChatSummariesPayload([
      {
        chatId: 'active-awaiting',
        activeRun: { runId: 'run_1' },
        awaiting: { awaitingId: 'await_1', mode: 'question' },
      },
      {
        chatId: 'completed',
        activeRun: { runId: 'stale_run' },
        awaiting: { awaitingId: 'stale_await' },
        hasActiveRun: false,
        hasPendingAwaiting: false,
      },
      { chatId: 'legacy' },
    ])).toEqual([
      expect.objectContaining({
        chatId: 'active-awaiting',
        hasActiveRun: true,
        hasPendingAwaiting: true,
      }),
      expect.objectContaining({
        chatId: 'completed',
        hasActiveRun: false,
        hasPendingAwaiting: false,
      }),
      { chatId: 'legacy', hasPendingAwaiting: false },
    ]);
  });

  it('requests a bridge token when app mode starts without one', async () => {
    const { parent, dispatchMessage } = installWindow();

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: APP_AUTH_RESPONSE_TYPE,
            requestId: payload.requestId,
            token: 'bridge-token-2',
            desktopAuthContext: 'desktop-auth-current',
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
            type: APP_AUTH_RESPONSE_TYPE,
            requestId: payload.requestId,
            token: 'fresh-token',
            desktopAuthContext: 'desktop-auth-current',
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
      owner: { kind: 'agent', agentKey: 'demo-agent' },
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer bridge-token-sse',
      Accept: 'text/event-stream',
      'X-Agent-WebClient-Device-Id': 'device-test',
      'X-Agent-WebClient-Surface-Id': 'surface-test',
    });
  });

  it('creates authenticated attach streams with runId and lastSeq query params', async () => {
    installWindow({ storedToken: 'bridge-token-attach' });

    await createAttachStream({
      runId: 'run id/1',
      owner: { kind: 'agent', agentKey: 'demo-agent' },
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
      '/api/resource?file=reports%2Fdemo+image.png',
    );
  });

  it('classifies Markdown resources and hides the transport endpoint', () => {
    const legacy = '/api/resource?file=chat_01%2Fold.png';
    expect(buildResourceUrl('chat_01/old.png')).toBe(
      '/api/resource?file=chat_01%2Fold.png',
    );
    expect(buildResourceUrl('/Users/alice/demo.png', 'chat_01')).toBe(
      '/api/resource?file=%2FUsers%2Falice%2Fdemo.png&chatId=chat_01',
    );
    expect(isLegacyResourceUrl(legacy)).toBe(true);
    expect(isLegacyResourceUrl('https://example.com/api/resource?file=public.png')).toBe(false);
    expect(isChatScopeResourceRef('artifacts/run_01/%E5%A4%8F%E6%97%A5.png', 'chat_01')).toBe(true);
    expect(isChatScopeResourceRef('chat_01/image.png', 'chat_01')).toBe(false);
    expect(isChatScopeResourceRef('/Users/alice/image.png', 'chat_01')).toBe(false);
    expect(isChatScopeResourceRef('https://example.com/image.png', 'chat_01')).toBe(false);
    expect(isChatScopeResourceRef('artifacts/%2E%2E/private.png', 'chat_01')).toBe(false);
    expect(classifyResourceUrl('image.png', 'chat_01')).toMatchObject({
      kind: 'chat',
      resourceKey: 'image.png',
      fetchUrl: '/api/resource?file=chat_01%2Fimage.png',
      requiresPlatformAuth: true,
    });
    expect(classifyResourceUrl(legacy, 'chat_01')).toMatchObject({
      kind: 'invalid',
      fetchUrl: '',
      requiresPlatformAuth: false,
    });
    expect(resolveResourceFetchUrl('image.png', 'chat_01')).toBe(
      '/api/resource?file=chat_01%2Fimage.png',
    );
    expect(resolveResourceFetchUrl('%E5%A4%8F%E6%97%A5%20%231%25.png', 'chat_01')).toBe(
      '/api/resource?file=chat_01%2F%25E5%25A4%258F%25E6%2597%25A5%2520%25231%2525.png',
    );
    expect(resolveResourceFetchUrl(legacy, 'chat_01')).toBe('');
  });

  it.each([
    ['/Users/alice/image.png', 'absolute'],
    ['/tmp/image.png', 'absolute'],
		['/tmp/../private/image.png', 'invalid'],
		['/tmp/%2E%2E/private/image.png', 'invalid'],
		['/Users/alice//image.png', 'invalid'],
    ['C:\\Users\\alice\\image.png', 'invalid'],
    ['\\\\server\\share\\image.png', 'invalid'],
    ['file:///tmp/image.png', 'invalid'],
    ['ftp://example.com/image.png', 'invalid'],
    ['/api/resource?file=chat_01%2Fimage.png', 'invalid'],
    ['chat_01/image.png', 'invalid'],
    ['artifacts//image.png', 'invalid'],
    ['artifacts/./image.png', 'invalid'],
    ['artifacts/../image.png', 'invalid'],
    ['image.png?download=1', 'invalid'],
    ['image.png#preview', 'invalid'],
    ['https://example.com/image.png', 'external'],
    ['http://example.com/image.png', 'external'],
    ['data:image/png;base64,AAAA', 'inline'],
    ['blob:https://example.com/id', 'inline'],
  ])('classifies resource boundary %s as %s', (source, expectedKind) => {
    expect(classifyResourceUrl(source, 'chat_01').kind).toBe(expectedKind);
  });

  it('constructs absolute fetches with chat context and rejects them for Team chats', () => {
    expect(classifyResourceUrl('/Users/alice/%E5%A4%8F%E6%97%A5%20%231%25.png', 'chat_01')).toMatchObject({
      kind: 'absolute',
      resourceKey: '/Users/alice/夏日 #1%.png',
      fetchUrl: '/api/resource?file=%2FUsers%2Falice%2F%E5%A4%8F%E6%97%A5+%231%25.png&chatId=chat_01',
      requiresPlatformAuth: true,
    });
    expect(classifyResourceUrl('/tmp/image.png', 'chat_01', { teamChat: true }).kind).toBe('invalid');
    expect(classifyResourceUrl('/Users/alice/image.png', 'chat_01', { teamChat: true }).kind).toBe('invalid');
  });

  it.each([
    'C:\\Users\\alice\\image.png',
    '\\\\server\\share\\image.png',
    'file:///tmp/image.png',
    '/api/resource?file=chat_01%2Fimage.png',
    'chat_01/image.png',
    'artifacts/../image.png',
		'/tmp/../private/image.png',
		'/tmp/%2E%2E/private/image.png',
  ])('never fetches rejected resource source %s', async (source) => {
    await expect(getResourceBlob(source, { chatId: 'chat_01' })).rejects.toThrow(
      '预览加载失败',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses current chatId for authenticated Blob and text resource reads', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => blob,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'artifact text',
      });
    setAccessToken('resource-token');

    await expect(getResourceBlob('image.png', { chatId: 'chat_01' })).resolves.toBe(blob);
    await expect(getResourceText('report.txt', { chatId: 'chat_01' })).resolves.toBe('artifact text');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/resource?file=chat_01%2Fimage.png',
      '/api/resource?file=chat_01%2Freport.txt',
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(options.headers).toEqual({ Authorization: 'Bearer resource-token' });
      expect(options.credentials).toBe('same-origin');
    }
  });

  it('fetches Workspace and tmp absolute paths with chat context but rejects Team absolute paths', async () => {
    const blob = new Blob(['absolute'], { type: 'image/png' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });
    setAccessToken('absolute-token');

    await expect(getResourceBlob('/Users/alice/project/%E5%A4%8F%E6%97%A5%20%231%25.png', {
      chatId: 'chat_01',
    })).resolves.toBe(blob);
    await expect(getResourceBlob('/tmp/poster.png', {
      chatId: 'chat_01',
    })).resolves.toBe(blob);
    await expect(getResourceBlob('/tmp/team.png', {
      chatId: 'chat_01',
      teamChat: true,
    })).rejects.toThrow('预览加载失败');

    expect(fetchMock.mock.calls.map(([requestUrl]) => requestUrl)).toEqual([
      '/api/resource?file=%2FUsers%2Falice%2Fproject%2F%E5%A4%8F%E6%97%A5+%231%25.png&chatId=chat_01',
      '/api/resource?file=%2Ftmp%2Fposter.png&chatId=chat_01',
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(options.headers).toEqual({ Authorization: 'Bearer absolute-token' });
      expect(options.credentials).toBe('same-origin');
    }
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

    await downloadResource('demo.txt', {
      filename: 'demo.txt',
      chatId: 'chat_1',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resource?file=chat_1%2Fdemo.txt');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer demo-token',
    });
    expect(options.credentials).toBe('same-origin');
    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
  });

  it('resolves ChatScope download urls with chatId and never sends Bearer cross-origin', async () => {
    const createObjectURL = jest.fn(() => 'blob:download');
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    global.document = {
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
      },
      createElement: jest.fn(() => ({
        click,
        href: '',
        download: '',
        rel: '',
      })),
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;
    setAccessToken('private-platform-token');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['demo']),
    });

    await downloadResource('artifacts/run_01/image.png', {
      filename: 'image.png',
      chatId: 'chat_01',
    });
    await downloadResource('https://cdn.example.com/public.png', {
      filename: 'public.png',
      chatId: 'chat_01',
    });

    const [logicalUrl, logicalOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [externalUrl, externalOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(logicalUrl).toBe('/api/resource?file=chat_01%2Fartifacts%2Frun_01%2Fimage.png');
    expect(logicalOptions.headers).toEqual({ Authorization: 'Bearer private-platform-token' });
    expect(externalUrl).toBe('https://cdn.example.com/public.png');
    expect(externalOptions.headers).toEqual({});
    expect(externalOptions.credentials).toBeUndefined();
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('uses generic platform display text when resource downloads fail without structured codes', async () => {
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

    await expect(downloadResource('private.txt', { chatId: 'chat_01' })).rejects.toMatchObject({
      message: '操作失败，请稍后重试。',
      status: 403,
      code: 40301,
      platformError: expect.objectContaining({
        status: 403,
        message: expect.stringContaining('下载失败'),
      }),
    });
  });

  it('decodes RFC 5987 filenames from chat export content disposition', async () => {
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
            ? "attachment; filename*=UTF-8''%E4%BD%A0%E5%A5%BD.md"
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

  it('loads raw llm trace json as authenticated text', async () => {
    setAccessToken('demo-token');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"runId":"run_1"}\n',
    });

    await expect(getChatLLMTraceRaw('chat_1/.llm-records/run_1_001.json')).resolves.toBe('{"runId":"run_1"}\n');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/llm-trace?file=chat_1%2F.llm-records%2Frun_1_001.json');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer demo-token',
    });
  });

	it('loads a run system prompt using the replay-safe run identity', async () => {
		setAccessToken('demo-token');
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			text: async () =>
				JSON.stringify({
					code: 0,
					msg: 'success',
					data: {
						chatId: 'chat_1',
						runId: 'run_1',
						agentKey: 'demo',
						systemRef: { agentKey: 'demo', cacheKey: 'react:main', fingerprint: 'sha256:test' },
						systemMessage: { role: 'system', content: 'stored prompt' },
					},
				}),
		});

		await expect(getChatSystemPrompt({ chatId: 'chat_1', runId: 'run_1', agentKey: 'demo' })).resolves.toMatchObject({
			data: { systemMessage: { content: 'stored prompt' } },
		});

		const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/chat/system-prompt?chatId=chat_1&runId=run_1&agentKey=demo');
		expect(options.method).toBe('GET');
		expect(options.headers).toEqual({
			Authorization: 'Bearer demo-token',
			'Content-Type': 'application/json',
		});
	});

	it('propagates errors when the persisted run system prompt is unavailable', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 404,
			text: async () =>
				JSON.stringify({
					code: 404,
					msg: 'system prompt not found',
					data: {},
				}),
		});

		await expect(
			getChatSystemPrompt({
				chatId: 'chat_1',
				runId: 'run_legacy',
				agentKey: 'demo',
			}),
		).rejects.toMatchObject({
			status: 404,
			code: 404,
		});
	});

  it('uses generic platform display text when raw chat jsonl loading fails without structured codes', async () => {
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
      message: '操作失败，请稍后重试。',
      status: 404,
      code: 404,
      platformError: expect.objectContaining({
        status: 404,
        message: expect.stringContaining('加载资源文本失败'),
      }),
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
              path: '/workspace/photo.png',
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
          path: '/workspace/photo.png',
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
        path: '/workspace/photo.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        url: '/api/resource?file=chat_generated%2Fphoto.png',
        sha256: 'def456',
      },
    ]);

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
              source: 'automation:daily',
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
              teamId: 'team_1',
            },
          ],
        }),
    });

    const response = await getChats({ mode: 'CODER' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/chats?mode=CODER');

    expect(response.data).toEqual([
      {
        chatId: 'chat_1',
        chatName: 'Need approval',
        source: 'automation:daily',
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
        teamId: 'team_1',
        hasPendingAwaiting: false,
      },
    ]);
  });
});
