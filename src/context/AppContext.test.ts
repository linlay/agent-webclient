import type { WorkerConversationRow } from './types';
import { appReducer, createInitialState } from './AppContext';

describe('appReducer conversation reset behavior', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('preserves worker conversation context for RESET_ACTIVE_CONVERSATION', () => {
    const baseState = createInitialState();
    const workerChats: WorkerConversationRow[] = [
      {
        chatId: 'chat_worker_1',
        chatName: '与员工张三的对话',
        updatedAt: 123,
        lastRunId: 'run_1',
        lastRunContent: 'hello',
      },
    ];

    const state = {
      ...baseState,
      chatId: 'chat_worker_1',
      workerSelectionKey: 'agent:worker_a',
      workerRelatedChats: workerChats,
      workerChatPanelCollapsed: false,
      timelineOrder: ['user_1'],
    };

    const next = appReducer(state, { type: 'RESET_ACTIVE_CONVERSATION' });

    expect(next.chatId).toBe('chat_worker_1');
    expect(next.workerSelectionKey).toBe('agent:worker_a');
    expect(next.workerRelatedChats).toEqual(workerChats);
    expect(next.workerChatPanelCollapsed).toBe(false);
    expect(next.timelineOrder).toEqual([]);
  });

  it('upserts chat summaries without dropping existing metadata', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chats: [
        {
          chatId: 'chat_1',
          chatName: 'Original chat',
          firstAgentName: 'Alice',
          firstAgentKey: 'agent-alice',
          agentKey: 'agent-alice',
        },
      ],
    };

    const next = appReducer(state, {
      type: 'UPSERT_CHAT',
      chat: {
        chatId: 'chat_1',
        lastRunId: 'run_2',
        lastRunContent: 'Latest answer',
      },
    });

    expect(next.chats[0]).toMatchObject({
      chatId: 'chat_1',
      chatName: 'Original chat',
      firstAgentName: 'Alice',
      firstAgentKey: 'agent-alice',
      agentKey: 'agent-alice',
      lastRunId: 'run_2',
      lastRunContent: 'Latest answer',
    });
  });

  it('manages pending steer queue lifecycle', () => {
    const baseState = createInitialState();

    const queued = appReducer(baseState, {
      type: 'ENQUEUE_PENDING_STEER',
      steer: {
        steerId: 'steer_1',
        message: '改成北京',
        requestId: 'req_1',
        runId: 'run_1',
        createdAt: 100,
      },
    });
    const removed = appReducer(queued, {
      type: 'REMOVE_PENDING_STEER',
      steerId: 'steer_1',
    });

    expect(queued.pendingSteers).toHaveLength(1);
    expect(removed.pendingSteers).toEqual([]);
  });

  it('opens, updates, and closes the command modal state', () => {
    const baseState = createInitialState();

    const opened = appReducer(baseState, {
      type: 'OPEN_COMMAND_MODAL',
      modal: {
        type: 'switch',
        searchText: 'alice',
      },
    });
    const patched = appReducer(opened, {
      type: 'PATCH_COMMAND_MODAL',
      modal: {
        activeIndex: 2,
        scope: 'team',
      },
    });
    const closed = appReducer(patched, {
      type: 'CLOSE_COMMAND_MODAL',
    });

    expect(opened.commandModal).toMatchObject({
      open: true,
      type: 'switch',
      searchText: 'alice',
      activeIndex: 0,
      scope: 'all',
      focusArea: 'search',
    });
    expect(patched.commandModal).toMatchObject({
      open: true,
      type: 'switch',
      searchText: 'alice',
      activeIndex: 2,
      scope: 'team',
      focusArea: 'search',
    });
    expect(closed.commandModal).toMatchObject({
      open: false,
      type: null,
      searchText: '',
      activeIndex: 0,
      scope: 'all',
      focusArea: 'search',
    });
  });
});
