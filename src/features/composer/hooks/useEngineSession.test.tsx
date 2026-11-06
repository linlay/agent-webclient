/** @jest-environment jsdom */
import React, { act } from 'react';
import { randomUUID } from 'node:crypto';
beforeAll(() => { Object.defineProperty(crypto, 'randomUUID', {value: randomUUID, configurable: true}); });
afterAll(() => { Reflect.deleteProperty(crypto, 'randomUUID'); });
import { createRoot } from 'react-dom/client';
import { useEngineSession } from './useEngineSession';
import * as api from '@/shared/data/api/requests/agentEngine';
import { ApiError } from '@/shared/data/api/http';
jest.mock('@/shared/data/api/requests/agentEngine', () => ({ previewEngineConfig: jest.fn(), prepareEngineSession: jest.fn(), getEngineSessionConfig: jest.fn(), configureEngineSession: jest.fn(), getEngineAuthStatus: jest.fn(), startEngineAuth: jest.fn(), cancelEngineAuth: jest.fn() }));
const prepared = (chatId: string, value = 'A', revision = 1) => ({ chatId, engineId: 'engine', preparationId: 'p-' + chatId, configRevision: revision, configOptions: [{ id: 'model', type: 'select' as const, name: 'Model', currentValue: value, choices: [{ value: 'A', name: 'A' }, { value: 'B', name: 'B' }] }] });
beforeEach(() => {
  (api.previewEngineConfig as jest.Mock).mockReset().mockResolvedValue({data: {engineId:'engine',configOptions:prepared('').configOptions}});
});
test('configuration is confirmed before sending and late Chat responses cannot overwrite the current Chat', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({ chatId }: {
    chatId: string;
  }) { current = useEngineSession({active: true,  enabled: true, engineId: 'engine', agentKey: 'project', chatId, running: false }); return null; }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({ chatId }) => Promise.resolve({ data: prepared(chatId) }));
  let confirm!: (v: unknown) => void;
  (api.configureEngineSession as jest.Mock).mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
  try {
    await act(async () => root.render(<Probe chatId="one"/>));
    expect(current.canSend).toBe(true);
    let pending!: Promise<void>;
    act(() => { pending = current.configure('model', 'B'); });
    expect(current.canSend).toBe(false);
    expect(api.configureEngineSession).toHaveBeenCalledWith({ chatId: 'one', preparationId: 'p-one', configRevision: 1, selections: [{ configId: 'model', value: 'B' }] }, expect.any(AbortSignal));
    await act(async () => root.render(<Probe chatId="two"/>));
    await act(async () => { confirm({ data: prepared('one', 'B', 2) }); await pending; });
    expect(current.prepared?.chatId).toBe('two');
    expect(current.prepared?.configOptions[0].currentValue).toBe('A');
  }
  finally {
    act(() => root.unmount());
  }
});

test('a changed upstream revision blocks sending until the refreshed options are reviewed', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: true,  enabled: true, engineId: 'engine', agentKey: 'project', chatId: 'one', running: false });
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockResolvedValue({ data: prepared('one') });
  try {
    await act(async () => root.render(<Probe />));
    (api.prepareEngineSession as jest.Mock).mockResolvedValue({ data: prepared('one', 'B', 2) });
    let allowed = true;
    await act(async () => { allowed = await current.verifyBeforeSend(); });
    expect(allowed).toBe(false);
    expect(current.canSend).toBe(false);
    expect(current.error).toBe('session_configuration_stale');
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    await act(async () => { await current.prepare(); });
    await act(async () => { allowed = await current.verifyBeforeSend(); });
    expect(allowed).toBe(true);
  } finally {
    act(() => root.unmount());
  }
});

test('switching Chats cancels a login even when start responds after the switch', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({ chatId }: { chatId: string }) {
    current = useEngineSession({active: true,  enabled: true, engineId: 'engine', agentKey: 'project', chatId, running: false });
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({ chatId }) => Promise.resolve({ data: prepared(chatId) }));
  let started!: (value: unknown) => void;
  (api.startEngineAuth as jest.Mock).mockImplementation(() => new Promise(resolve => { started = resolve; }));
  (api.cancelEngineAuth as jest.Mock).mockResolvedValue({});
  try {
    await act(async () => root.render(<Probe chatId="one" />));
    let login!: Promise<void>;
    act(() => { login = current.startAuth('login'); });
    await act(async () => root.render(<Probe chatId="two" />));
    await act(async () => {
      started({ data: { engineId: 'engine', state: 'authenticating', authOperationId: 'late-login', methods: [] } });
      await login;
    });
    expect(api.cancelEngineAuth).toHaveBeenCalledWith('late-login');
    expect(current.prepared?.chatId).toBe('two');
    expect(current.auth).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

test('an expired login releases the UI and switching to Native never prepares an external session', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({external}: {external: boolean}) {
    current = useEngineSession({active: true, enabled: external, engineId: external ? 'engine' : '', agentKey: external ? 'project' : 'native', chatId: 'one', running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockResolvedValue({data: prepared('one')});
  (api.startEngineAuth as jest.Mock).mockResolvedValue({data: {engineId: 'engine', state: 'authenticating', authOperationId: 'expired-login', methods: []}});
  (api.getEngineAuthStatus as jest.Mock).mockResolvedValue({data: {engineId: 'engine', state: 'required', methods: []}});
  try {
    await act(async () => root.render(<Probe external />));
    await act(async () => { await current.startAuth('chat-gpt'); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(current.auth?.state).toBe('required');
    expect(current.auth?.authOperationId).toBeUndefined();
    expect(current.busy).toBe(false);
    expect(current.canSend).toBe(false);
    expect(current.error).toBe('auth_required');
    const calls = (api.prepareEngineSession as jest.Mock).mock.calls.length;
    await act(async () => root.render(<Probe external={false} />));
    let allowed = false;
    await act(async () => { allowed = await current.verifyBeforeSend(); });
    expect(allowed).toBe(true);
    expect(current.canSend).toBe(true);
    expect(current.auth).toBeNull();
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(calls);
    expect(api.cancelEngineAuth).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
  }
});

test('cancelling a terminal login preserves the advertised methods for immediate retry', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: 'one', running: false});
    return null;
  }
  const methods = [{id: 'console-login', name: 'Anthropic Console', type: 'terminal', available: true}];
  (api.prepareEngineSession as jest.Mock).mockResolvedValue({data: prepared('one')});
  (api.startEngineAuth as jest.Mock).mockResolvedValue({data: {engineId: 'engine', state: 'authenticating', authOperationId: 'login', methods}});
  (api.cancelEngineAuth as jest.Mock).mockResolvedValue({});
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => { await current.startAuth('console-login'); });
    expect(current.terminal).toBe(true);
    await act(async () => { await current.cancelAuth(); });
    expect(current.auth).toEqual({engineId: 'engine', state: 'required', methods});
    expect(current.terminal).toBe(false);
    expect(current.canSend).toBe(false);
    await act(async () => { await current.startAuth('console-login'); });
    expect(api.startEngineAuth).toHaveBeenCalledTimes(2);
    expect(current.terminal).toBe(true);
  } finally { act(() => root.unmount()); }
});

test('a new external Chat previews options without preparing and sends with its reserved ID', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe />));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    const reservedId = current.pendingChatId;
    expect(reservedId).toMatch(/^chat_/);
    expect(current.prepared?.chatId).toBe(reservedId);
    expect(current.canSend).toBe(true);
    await act(async () => root.render(<Probe />));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    await act(async () => { expect(await current.verifyBeforeSend()).toBe(true); });
    expect(current.pendingChatId).toBe(reservedId);
  } finally { act(() => root.unmount()); }
});


test('a late busy response during Chat hydration is not shown as a failed session', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId, running}: {chatId: string; running: boolean}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId, running});
    return null;
  }
  let rejectBusy!: (error: unknown) => void;
  (api.prepareEngineSession as jest.Mock).mockResolvedValueOnce({data: prepared('one')})
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectBusy = reject; }))
    .mockResolvedValue({data: prepared('two')});
  try {
    await act(async () => root.render(<Probe chatId="one" running={false} />));
    await act(async () => root.render(<Probe chatId="two" running={false} />));
    await act(async () => root.render(<Probe chatId="two" running />));
    await act(async () => { rejectBusy(new ApiError('engine_busy', {data: {errorCode: 'engine_busy'}})); });
    expect(current.error).toBe('');
    expect(current.canSend).toBe(false);
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<Probe chatId="two" running={false} />));
    expect(current.prepared?.chatId).toBe('two');
    expect(current.canSend).toBe(true);
  } finally { act(() => root.unmount()); }
});

test('switching back retries temporary session occupancy without user clicks', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId}: {chatId: string}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId, running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockResolvedValueOnce({data: prepared('one')})
    .mockResolvedValueOnce({data: prepared('two')})
    .mockRejectedValueOnce(new ApiError('engine_busy', {data: {errorCode: 'engine_busy'}}))
    .mockResolvedValue({data: prepared('one')});
  try {
    await act(async () => root.render(<Probe chatId="one" />));
    await act(async () => root.render(<Probe chatId="two" />));
    await act(async () => root.render(<Probe chatId="one" />));
    expect(current.error).toBe('');
    expect(current.busy).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
    expect(current.prepared?.chatId).toBe('one');
    expect(current.canSend).toBe(true);
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(4);
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});

test('StrictMode re-entry preserves the same reserved new Chat identity', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<React.StrictMode><Probe /></React.StrictMode>));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    const draftId = current.pendingChatId;
    await act(async () => {expect(await current.verifyBeforeSend()).toBe(true);});
    expect(current.pendingChatId).toBe(draftId);
    expect(current.prepared?.chatId).toBe(current.pendingChatId);
  } finally { act(() => root.unmount()); }
});

test.each(['engine_busy', 'auth_required', 'rpc_connection_lost'])('prepare retries are bounded and restricted to contention: %s', async code => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: 'one', running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockRejectedValue(new ApiError(code, {data: {errorCode: code}}));
  (api.getEngineAuthStatus as jest.Mock).mockResolvedValue({data: {engineId: 'engine', state: 'required', methods: []}});
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(code === 'engine_busy' ? 5 : 1);
    expect(current.error).toBe(code);
    expect(current.busy).toBe(false);
    expect(current.canSend).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});

test('leaving a busy Chat cancels its queued retry and does not touch the next Chat', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId}: {chatId: string}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId, running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockRejectedValueOnce(new ApiError('engine_busy', {data: {errorCode: 'engine_busy'}}))
    .mockResolvedValue({data: prepared('two')});
  try {
    await act(async () => root.render(<Probe chatId="one" />));
    expect(current.busy).toBe(true);
    await act(async () => root.render(<Probe chatId="two" />));
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(2);
    expect(current.prepared?.chatId).toBe('two');
    expect(current.error).toBe('');
    expect(jest.getTimerCount()).toBe(0);
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});

test('hydrating an active Chat waits for the Run to finish before preparing', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({ready, running}: {ready: boolean; running: boolean}) {
    current = useEngineSession({active: true, enabled: ready, engineId: 'engine', agentKey: 'project', chatId: 'one', running});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockResolvedValue({data: prepared('one')});
  try {
    await act(async () => root.render(<Probe ready={false} running={false} />));
    await act(async () => root.render(<Probe ready running />));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    expect(current.error).toBe('');
    await act(async () => root.render(<Probe ready running={false} />));
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(1);
    expect(current.canSend).toBe(true);
  } finally { act(() => root.unmount()); }
});

test('sending a prepared draft adopts its Chat ID without losing settings or preparing during the Run', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({ chatId, running }: {chatId: string; running: boolean}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId, running});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe chatId="" running={false} />));
    await act(async () => {expect(await current.verifyBeforeSend()).toBe(true);});
    const draft = current.prepared!;
    expect(draft.chatId).toBe(current.pendingChatId);
    await act(async () => root.render(<Probe chatId={draft.chatId} running />));
    expect(current.prepared).toEqual(draft);
    expect(current.canSend).toBe(false);
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Probe chatId="another-chat" running />));
    expect(current.prepared).toBeNull();
    await act(async () => root.render(<Probe chatId="another-chat" running={false} />));
    expect(current.prepared?.chatId).toBe('another-chat');
  } finally { act(() => root.unmount()); }
});


test('returning to an unsent draft reuses its Chat while a submitted draft starts fresh', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId, agentKey = 'project'}: {chatId: string; agentKey?: string}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey, chatId, running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe chatId="" />));
    const draft = current.pendingChatId;
    await act(async () => root.render(<Probe chatId="old-chat" />));
    await act(async () => root.render(<Probe chatId="" agentKey="other-project" />));
    expect(current.pendingChatId).not.toBe(draft);
    await act(async () => root.render(<Probe chatId="" />));
    expect(current.pendingChatId).toBe(draft);
    expect(current.prepared?.chatId).toBe(draft);
    // First send promotes the draft. A later New Chat must not reuse that conversation.
    await act(async () => root.render(<Probe chatId={draft} />));
    await act(async () => root.render(<Probe chatId="" />));
    expect(current.pendingChatId).not.toBe(draft);
  } finally { act(() => root.unmount()); }
});

test('inactive surfaces do not prepare; activating the selected Chat loads its configuration', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId, active}: {chatId: string; active: boolean}) {
    current = useEngineSession({enabled: true, engineId: 'engine', agentKey: 'project', chatId, running: false, active});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockClear().mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe chatId="one" active={false}/>));
    await act(async () => root.render(<Probe chatId="two" active={false}/>));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    await act(async () => root.render(<Probe chatId="two" active/>));
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(1);
    expect(current.prepared?.chatId).toBe('two');
    expect(current.canSend).toBe(true);
  } finally {act(() => root.unmount());}
});

test('idle restoration with unchanged options does not demand a manual retry', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: 'one', running: false});return null;}
  (api.prepareEngineSession as jest.Mock).mockResolvedValue({data: prepared('one')});
  try {
    await act(async () => root.render(<Probe/>));
    (api.prepareEngineSession as jest.Mock).mockResolvedValue({data: {...prepared('one'),preparationId: 'restored-generation'}});
    let allowed = false;
    await act(async () => {allowed = await current.verifyBeforeSend();});
    expect(allowed).toBe(true);
    expect(current.error).toBe('');
    expect(current.prepared?.preparationId).toBe('restored-generation');
  } finally {act(() => root.unmount());}
});

test('sending without an earlier pointer interaction lazily prepares the already reserved draft', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {current = useEngineSession({active: false, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', running: false});return null;}
  (api.prepareEngineSession as jest.Mock).mockClear().mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe/>));
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    const draft = current.pendingChatId;
    expect(draft).toMatch(/^chat_/);
    expect(current.canSend).toBe(true);
    let allowed = false;
    await act(async () => {allowed = await current.verifyBeforeSend();});
    expect(allowed).toBe(true);
    expect(current.prepared?.chatId).toBe(draft);
    expect(api.prepareEngineSession).toHaveBeenCalledTimes(1);
  } finally {act(() => root.unmount());}
});

test.each(['', 'restored-upload-chat'])('upload completion and clearing preserve the prepared draft (%s)', async (restored) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({draftChatId}: {draftChatId: string}) {
    current = useEngineSession({active: true, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', draftChatId, running: false});
    return null;
  }
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe draftChatId={restored} />));
    const id = current.pendingChatId;
    const original = current.prepared;
    await act(async () => root.render(<Probe draftChatId={id} />));
    await act(async () => root.render(<Probe draftChatId="" />));
    expect(current.pendingChatId).toBe(id);
    expect(current.prepared).toBe(original);
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    expect((api.previewEngineConfig as jest.Mock).mock.calls[0][2].aborted).toBe(false);
  } finally { act(() => root.unmount()); }
});


test('running configuration reads ignore late Chats and wait for an admitted Query snapshot without preparing', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId, running = true}: {chatId: string; running?: boolean}) {
    current = useEngineSession({active: false, enabled: true, engineId: 'engine', agentKey: 'project', chatId, running});
    return null;
  }
  let finishFirst!: (value: unknown) => void;
  let firstSignal!: AbortSignal;
  (api.getEngineSessionConfig as jest.Mock)
    .mockImplementationOnce((_, signal) => { firstSignal = signal; return new Promise(resolve => { finishFirst = resolve; }); })
    .mockRejectedValueOnce(new ApiError('starting', {data: {errorCode: 'session_configuration_stale'}}))
    .mockResolvedValue({data: prepared('two', 'B')});
  try {
    await act(async () => root.render(<Probe chatId="one" />));
    await act(async () => root.render(<Probe chatId="two" />));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => { finishFirst({data: prepared('one')}); });
    expect(current.prepared).toBeNull();
    expect(current.error).toBe('');
    expect(current.busy).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(current.prepared?.chatId).toBe('two');
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    expect(current.canSend).toBe(false);
    await act(async () => { await current.configure('model', 'A'); });
    expect(api.configureEngineSession).not.toHaveBeenCalled();
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    await act(async () => root.render(<Probe chatId="two" running={false} />));
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(api.getEngineSessionConfig).toHaveBeenCalledTimes(3);
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});


test('new Chat displays cached choices during refresh and confirms a local selection only on send', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {
    current = useEngineSession({active: false, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', running: false});
    return null;
  }
  let refreshed!: (value: unknown) => void;
  const refresh = new Promise(resolve => { refreshed = resolve; });
  (api.previewEngineConfig as jest.Mock).mockImplementation((_key, reload) => reload ? refresh : Promise.resolve({data: {engineId: 'engine', configOptions: prepared('').configOptions}}));
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId)}));
  (api.configureEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data: prepared(chatId, 'B', 2)}));
  try {
    await act(async () => root.render(<Probe />));
    expect(current.prepared?.configOptions[0].currentValue).toBe('A');
    expect(current.busy).toBe(false);
    expect(current.canSend).toBe(true);
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
    await act(async () => { await current.configure('model', 'B'); });
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    expect(api.configureEngineSession).not.toHaveBeenCalled();
    await act(async () => { refreshed({data: {engineId:'engine',configOptions:prepared('').configOptions}}); await refresh; });
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    let allowed = false;
    await act(async () => { allowed = await current.verifyBeforeSend(); });
    expect(allowed).toBe(true);
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    expect(api.configureEngineSession).toHaveBeenCalledWith(expect.objectContaining({chatId:current.pendingChatId,selections:[{configId:'model',value:'B'}]}),expect.any(AbortSignal));
  } finally { act(() => root.unmount()); }
});

test('a late discovery failure cannot revoke a successfully prepared send', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {current = useEngineSession({active: false, enabled: true, engineId: 'engine', agentKey: 'project', chatId: '', running: false});return null;}
  let reject!: (error: unknown) => void;
  const refresh = new Promise((_resolve, fail) => {reject = fail;});
  (api.previewEngineConfig as jest.Mock).mockImplementation((_key, reload) => reload ? refresh : Promise.resolve({data:{engineId:'engine',configOptions:prepared('').configOptions}}));
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId}) => Promise.resolve({data:prepared(chatId)}));
  try {
    await act(async () => root.render(<Probe/>));
    await act(async () => {expect(await current.verifyBeforeSend()).toBe(true);});
    await act(async () => {reject(new ApiError('auth_required',{data:{errorCode:'auth_required'}}));await refresh.catch(()=>{});});
    expect(current.error).toBe('');
    expect(current.canSend).toBe(true);
  } finally {act(()=>root.unmount());}
});

test('a selected option removed by refreshed capabilities blocks sending instead of reverting silently', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe() {current = useEngineSession({active: false, enabled: true, engineId:'engine',agentKey:'project',chatId:'',running:false});return null;}
  let refreshed!: (value: unknown)=>void;
  const refresh = new Promise(resolve=>{refreshed=resolve;});
  const mode = {...prepared('').configOptions[0],id:'mode',name:'Mode'};
  (api.previewEngineConfig as jest.Mock).mockImplementation((_key,reload)=>reload?refresh:Promise.resolve({data:{engineId:'engine',configOptions:[...prepared('').configOptions,mode]}}));
  (api.prepareEngineSession as jest.Mock).mockImplementation(({chatId})=>Promise.resolve({data:prepared(chatId)}));
  try {
    await act(async()=>root.render(<Probe/>));
    await act(async()=>{await current.configure('mode','B');});
    await act(async()=>{refreshed({data:{engineId:'engine',configOptions:prepared('').configOptions}});await refresh;});
    await act(async()=>{expect(await current.verifyBeforeSend()).toBe(false);});
    expect(current.error).toBe('session_configuration_stale');
    expect(api.configureEngineSession).not.toHaveBeenCalled();
  } finally {act(()=>root.unmount());}
});

test('busy discovery leaves cached controls and sending available, then stops retrying on navigation', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useEngineSession>;
  function Probe({chatId=''}:{chatId?:string}) {current=useEngineSession({active:false,enabled:true,engineId:'engine',agentKey:'project',chatId,running:false});return null;}
  (api.previewEngineConfig as jest.Mock).mockImplementation((_key,refresh)=>refresh?Promise.reject(new ApiError('engine_busy',{data:{errorCode:'engine_busy'}})):Promise.resolve({data:{engineId:'engine',configOptions:prepared('').configOptions}}));
  try {
    await act(async()=>root.render(<Probe/>));
    expect(current.prepared?.configOptions[0].currentValue).toBe('A');
    expect(current.error).toBe('');
    expect(current.busy).toBe(false);
    expect(current.canSend).toBe(true);
    await act(async()=>{await current.configure('model','B');});
    expect(current.prepared?.configOptions[0].currentValue).toBe('B');
    await act(async()=>root.render(<Probe chatId="history"/>));
    const requests = (api.previewEngineConfig as jest.Mock).mock.calls.length;
    await act(async()=>{await jest.advanceTimersByTimeAsync(6000);});
    expect(api.previewEngineConfig).toHaveBeenCalledTimes(requests);
    expect(api.prepareEngineSession).not.toHaveBeenCalled();
  } finally {act(()=>root.unmount());jest.useRealTimers();}
});
