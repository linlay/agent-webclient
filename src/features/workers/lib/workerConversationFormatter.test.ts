import type { Chat, WorkerRow } from '@/app/state/types';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';

describe('buildWorkerConversationRows', () => {
  function createWorker(): WorkerRow {
    return {
      key: 'agent:agent-alpha',
      type: 'agent',
      sourceId: 'agent-alpha',
      displayName: 'Alpha',
      role: '--',
      teamAgentLabels: [],
      latestChatId: 'chat_newer',
      latestRunId: 'a1',
      latestUpdatedAt: 200,
      latestChatName: 'Newer chat',
      latestRunContent: '',
      hasHistory: true,
      latestRunSortValue: 0,
      searchText: '',
    };
  }

  it('orders worker conversations by updatedAt descending', () => {
    const worker = createWorker();

    const chats: Chat[] = [
      {
        chatId: 'chat_newer',
        chatName: 'Newer chat',
        agentKey: 'agent-alpha',
        lastRunId: 'a1',
        updatedAt: 200,
        hasPendingAwaiting: true,
      } as Chat,
      {
        chatId: 'chat_older',
        chatName: 'Older chat',
        agentKey: 'agent-alpha',
        lastRunId: 'z9',
        updatedAt: 100,
      } as Chat,
    ];

    const rows = buildWorkerConversationRows({ chats, worker });

    expect(rows.map((row) => row.chatId)).toEqual([
      'chat_newer',
      'chat_older',
    ]);
    expect(rows[0]?.hasPendingAwaiting).toBe(true);
  });

  it('marks rows as active when chat summaries carry active run state', () => {
    const worker = createWorker();
    const rows = buildWorkerConversationRows({
      worker,
      chats: [
        {
          chatId: 'chat_flag',
          chatName: 'Flagged active',
          agentKey: 'agent-alpha',
          updatedAt: 300,
          hasActiveRun: true,
        } as Chat,
        {
          chatId: 'chat_nested',
          chatName: 'Nested active',
          agentKey: 'agent-alpha',
          updatedAt: 200,
          activeRun: {
            runId: 'run_active',
          },
        } as Chat,
      ],
    });

    expect(rows.map((row) => [row.chatId, row.hasActiveRun])).toEqual([
      ['chat_flag', true],
      ['chat_nested', true],
    ]);
  });

  it('treats explicit hasActiveRun false as not running even when activeRun is stale', () => {
    const rows = buildWorkerConversationRows({
      worker: createWorker(),
      chats: [
        {
          chatId: 'chat_stale',
          chatName: 'Stale active run',
          agentKey: 'agent-alpha',
          updatedAt: 100,
          hasActiveRun: false,
          activeRun: {
            runId: 'run_old',
          },
        } as Chat,
      ],
    });

    expect(rows[0]?.hasActiveRun).toBe(false);
  });

  it('propagates awaitingMode from chat when hasPendingAwaiting is set', () => {
    const worker = createWorker();
    const rows = buildWorkerConversationRows({
      worker,
      chats: [
        {
          chatId: 'chat_await_plan',
          chatName: 'Plan awaiting',
          agentKey: 'agent-alpha',
          updatedAt: 300,
          hasPendingAwaiting: true,
          awaiting: { mode: 'plan' },
        } as Chat,
        {
          chatId: 'chat_await_question',
          chatName: 'Question awaiting',
          agentKey: 'agent-alpha',
          updatedAt: 200,
          hasPendingAwaiting: true,
          awaiting: { mode: 'question' },
        } as Chat,
        {
          chatId: 'chat_no_awaiting',
          chatName: 'No awaiting',
          agentKey: 'agent-alpha',
          updatedAt: 100,
          awaiting: undefined,
        } as Chat,
      ],
    });

    expect(rows[0]?.awaitingMode).toBe('plan');
    expect(rows[1]?.awaitingMode).toBe('question');
    expect(rows[2]?.awaitingMode).toBeUndefined();
  });
});
