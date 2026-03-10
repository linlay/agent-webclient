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
});
