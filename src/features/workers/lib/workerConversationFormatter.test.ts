import type { Chat, WorkerRow } from '@/app/state/types';
import {
  buildSelectedWorkerConversationRows,
  buildWorkerConversationRows,
} from '@/features/workers/lib/workerConversationFormatter';

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
        source: 'automation:daily',
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
    expect(rows[0]?.source).toBe('automation:daily');
  });

  it('does not use chatId as the display chatName fallback', () => {
    const rows = buildWorkerConversationRows({
      worker: createWorker(),
      chats: [
        {
          chatId: '6a9dc04b-2dcf-4d8f-812e-c521ee143000',
          agentKey: 'agent-alpha',
          lastRunContent: 'Readable conversation preview',
          updatedAt: 100,
        } as Chat,
      ],
    });

    expect(rows[0]?.chatName).toBe('');
    expect(rows[0]?.lastRunContent).toBe('Readable conversation preview');
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
          awaiting: { mode: 'planning' },
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

    expect(rows[0]?.awaitingMode).toBe('planning');
    expect(rows[1]?.awaitingMode).toBe('question');
    expect(rows[2]?.awaitingMode).toBeUndefined();
  });

  it('rebuilds selected worker conversations from the latest chats', () => {
    const worker = createWorker();
    const rows = buildSelectedWorkerConversationRows({
      chats: [
        {
          chatId: 'chat_older',
          agentKey: 'agent-alpha',
          updatedAt: 100,
        } as Chat,
        {
          chatId: 'chat_newer',
          agentKey: 'agent-alpha',
          updatedAt: 200,
          hasPendingAwaiting: true,
        } as Chat,
      ],
      workerSelectionKey: worker.key,
      workerIndexByKey: new Map([[worker.key, worker]]),
    });

    expect(rows.map((row) => row.chatId)).toEqual(['chat_newer', 'chat_older']);
    expect(rows[0]?.hasPendingAwaiting).toBe(true);
  });
});
