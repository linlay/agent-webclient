/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialState } from '@/app/state/state';
import { appReducer } from '@/app/state/reducer';
import type { AppAction } from '@/app/state/types';
import type { AgentEvent } from '@/shared/contracts/agentEvents';
import { useConversationActions } from './useConversationActions';
import { useConversationEventHandler } from './useConversationEventHandler';
import { registerAttachRunListener, registerDetachRunListener } from './useConversationWsRuntime';
import { createLiveQuerySession, type LiveQuerySession } from '../lib/conversationSession';
import { PlatformRunTransport } from '@/features/transport/lib/platformRunTransport';
import { resolveToolLabel } from '@/features/timeline/lib/toolDisplay';

jest.mock('@/app/state/AppContext', () => ({ useAppContext: jest.fn() }));
jest.mock('@/shared/data', () => ({ getChat: jest.fn() }));
jest.mock('@/features/transport/lib/standaloneWsClient', () => ({}));
jest.mock('@/shared/hooks/useDesktopRouteChange', () => ({ readDesktopChatRouteRevision: () => null }));
const { useAppContext } = jest.requireMock('@/app/state/AppContext');
const { getChat } = jest.requireMock('@/shared/data');
const owner = { kind: 'agent' as const, agentKey: 'zenmi' };
const event = (type: string, seq: number, fields = {}): AgentEvent => ({
  type, seq, runId: 'run-B', chatId: 'B', timestamp: 1789619500000 + seq, ...fields,
} as AgentEvent);

it.each(['attach', 'query'] as const)('replaces %s from the snapshot cursor without losing tools or reasoning', async (source) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const stateRef = { current: { ...createInitialState(), chatId: 'B', runId: 'run-B' } };
  const querySessionsRef = { current: new Map<string, LiveQuerySession>() };
  const activeQuerySessionRequestIdRef = { current: '' };
  const activeAttachRef = { current: null } as Parameters<typeof registerAttachRunListener>[0]['activeAttachRef'];
  const dispatch = (action: AppAction) => { stateRef.current = appReducer(stateRef.current, action); };
  useAppContext.mockImplementation(() => ({
    state: stateRef.current, stateRef, dispatch, querySessionsRef, activeQuerySessionRequestIdRef,
    conversationViewportRef: { current: null },
  }));
  let actions!: ReturnType<typeof useConversationActions>;
  let sink!: ReturnType<typeof useConversationEventHandler>;
  function Harness() {
    actions = useConversationActions();
    sink = useConversationEventHandler();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(React.createElement(Harness)));
  const streams: Array<{ onEvent: (e: AgentEvent) => void; payload: any }> = [];
  const stream = jest.fn((options: any) => { streams.push(options); return { abort: jest.fn() }; });
  let finishDetach!: () => void;
  const request = jest.fn(() => new Promise<void>(resolve => { finishDetach = resolve; }));
  const transport = new PlatformRunTransport(async () => ({ stream, request }) as any);
  const options = {
    dispatch, stateRef, querySessionsRef, activeQuerySessionRequestIdRef, activeAttachRef,
    chatQuerySessionIndexRef: { current: new Map<string, string>() },
    handleEvent: (e: AgentEvent) => sink.handleEvent(e), runs: transport,
  };
  const stopAttach = registerAttachRunListener(options);
  const stopDetach = registerDetachRunListener(options);
  try {
    if (source === 'attach') {
      window.dispatchEvent(new CustomEvent('agent:attach-run', {
        detail: { chatId: 'B', runId: 'run-B', agentKey: 'zenmi', lastSeq: 2 },
      }));
      await Promise.resolve();
    } else {
      const session = createLiveQuerySession({ requestId: 'query', chatId: 'B', owner, observationSource: 'query' });
      session.runId = 'run-B';
      session.streaming = true;
      session.abortController = new AbortController();
      querySessionsRef.current.set('query', session);
      activeQuerySessionRequestIdRef.current = 'query';
      const execution = transport.startQuery({
        requestId: 'query', message: 'test', owner, signal: session.abortController.signal,
        onEvent: e => { session.bufferedEvents.push(e); sink.handleEvent(e); },
      });
      await Promise.resolve();
      streams[0].onEvent(event('run.start', 2));
      await execution.identity;
    }
    const prefix = [
      event('tool.start', 3, { toolId: 'call-demo', toolName: 'file_write' }),
      event('tool.args', 4, { toolId: 'call-demo', delta: '{"path":' }),
      event('reasoning.start', 5, { reasoningId: 'thinking' }),
      event('reasoning.delta', 6, { reasoningId: 'thinking', delta: '前半段' }),
    ];
    prefix.forEach(streams[0].onEvent);
    const tool = () => [...stateRef.current.timelineNodes.values()].find(n => n.toolId === 'call-demo')!;
    expect(resolveToolLabel(tool())).toBe('file_write');
    let resolveChat!: (value: unknown) => void;
    getChat.mockReturnValue(new Promise(resolve => { resolveChat = resolve; }));
    const loading = actions.loadChat('B', { forceReload: true });
    // Detach is still awaiting its remote ACK. Local ownership is already gone.
    expect(activeQuerySessionRequestIdRef.current).toBe('');
    expect(activeAttachRef.current).toBeNull();
    streams[0].onEvent(event('tool.args', 7, { toolId: 'call-demo', delta: 'STALE' }));
    expect(tool()).toBeUndefined();
    await act(async () => {
      resolveChat({ data: {
        chatId: 'B', agentKey: 'zenmi',
        events: [event('request.query', 1, { liveSeq: 2, message: 'test' }), event('run.start', 2)],
        activeRun: { runId: 'run-B', agentKey: 'zenmi', lastSeq: 2 },
      } });
      await loading;
    });
    expect(streams).toHaveLength(2);
    expect(streams[1].payload).toMatchObject({ runId: 'run-B', lastSeq: 2 });
    prefix.forEach(streams[1].onEvent);
    streams[1].onEvent(event('tool.args', 7, { toolId: 'call-demo', delta: '"novel.md"}' }));
    streams[1].onEvent(event('tool.end', 8, { toolId: 'call-demo' }));
    streams[1].onEvent(event('reasoning.delta', 9, { reasoningId: 'thinking', delta: '后半段' }));
    expect(resolveToolLabel(tool())).toBe('file_write');
    expect(JSON.parse(tool().argsText!)).toEqual({ path: 'novel.md' });
    expect([...stateRef.current.timelineNodes.values()].find(n => n.kind === 'thinking')?.text).toBe('前半段后半段');
    const newRequestId = activeQuerySessionRequestIdRef.current;
    await act(async () => { finishDetach(); await Promise.resolve(); });
    expect(activeQuerySessionRequestIdRef.current).toBe(newRequestId);
    expect(stateRef.current.streaming).toBe(true);
    streams[0].onEvent(event('tool.start', 10, { toolId: 'stale-tool', toolName: 'bad' }));
    expect([...stateRef.current.timelineNodes.values()].some(n => n.toolId === 'stale-tool')).toBe(false);
    expect(request.mock.calls.every(([input]: any) => input.type === '/api/detach')).toBe(true);
  } finally {
    stopDetach();
    stopAttach();
    act(() => root.unmount());
  }
});
