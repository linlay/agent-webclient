import type { Chat, WorkerRow } from '@/app/state/types';
import {
  buildWorkerHistoryRowsFromChats,
  excludeStreamingCurrentChat,
  filterHistoryRowsBySearch,
  mapSearchResultsToHistoryRows,
} from '@/features/workers/lib/workerHistoryRows';

function createWorker(overrides: Partial<WorkerRow> = {}): WorkerRow {
  return {
    key: 'agent:agent-alpha',
    type: 'agent',
    sourceId: 'agent-alpha',
    displayName: 'Alpha',
    role: '--',
    teamAgentLabels: [],
    latestChatId: '',
    latestRunId: '',
    latestUpdatedAt: 0,
    latestChatName: '',
    latestRunContent: '',
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: '',
    ...overrides,
  };
}

describe('worker history rows', () => {
  it('builds rows only from the provided remote chats for the worker', () => {
    const rows = buildWorkerHistoryRowsFromChats({
      worker: createWorker(),
      chats: [
        {
          chatId: 'remote-alpha',
          chatName: 'Remote Alpha',
          agentKey: 'agent-alpha',
          updatedAt: 200,
        } as Chat,
        {
          chatId: 'remote-beta',
          chatName: 'Remote Beta',
          agentKey: 'agent-beta',
          updatedAt: 300,
        } as Chat,
      ],
    });

    expect(rows.map((row) => row.chatId)).toEqual(['remote-alpha']);
  });

  it('hides the current live chat while streaming', () => {
    const rows = excludeStreamingCurrentChat(
      [
        {
          chatId: 'chat-live',
          chatName: 'Current question',
          updatedAt: 300,
          lastRunId: 'run-live',
          lastRunContent: 'just asked',
        },
        {
          chatId: 'chat-old',
          chatName: 'Old question',
          updatedAt: 100,
          lastRunId: 'run-old',
          lastRunContent: 'older',
        },
      ],
      { streaming: true, chatId: 'chat-live' },
    );

    expect(rows.map((row) => row.chatId)).toEqual(['chat-old']);
  });

  it('keeps the current chat visible when it is not streaming', () => {
    const rows = excludeStreamingCurrentChat(
      [
        {
          chatId: 'chat-live',
          chatName: 'Persisted question',
          updatedAt: 300,
          lastRunId: 'run-live',
          lastRunContent: 'done',
        },
      ],
      { streaming: false, chatId: 'chat-live' },
    );

    expect(rows.map((row) => row.chatId)).toEqual(['chat-live']);
  });

  it('maps search results to rows without needing local chat summaries', () => {
    const rows = mapSearchResultsToHistoryRows({
      results: [
        {
          chatId: 'search-chat',
          chatName: 'Search result',
          agentKey: 'agent-alpha',
          kind: 'chat',
          timestamp: 123,
          snippet: 'matched text',
          score: 0.9,
        },
      ],
    });

    expect(rows[0]).toMatchObject({
      chatId: 'search-chat',
      chatName: 'Search result',
      agentKey: 'agent-alpha',
      lastRunContent: 'matched text',
      searchSnippet: 'matched text',
    });
  });

  it('does not use chatId as the search result chatName fallback', () => {
    const rows = mapSearchResultsToHistoryRows({
      results: [
        {
          chatId: '6a9dc04b-2dcf-4d8f-812e-c521ee143000',
          chatName: '',
          kind: 'content',
          timestamp: 100,
          snippet: 'Readable conversation preview',
          score: 1,
        },
      ],
    });

    expect(rows[0]?.chatName).toBe('');
    expect(rows[0]?.searchSnippet).toBe('Readable conversation preview');
  });

  it('filters remote rows by title, id, or preview text', () => {
    const rows = filterHistoryRowsBySearch(
      [
        {
          chatId: 'chat-alpha',
          chatName: 'Deploy notes',
          updatedAt: 200,
          lastRunId: 'run-1',
          lastRunContent: 'green build',
        },
        {
          chatId: 'chat-beta',
          chatName: 'Other',
          updatedAt: 100,
          lastRunId: 'run-2',
          lastRunContent: 'login issue',
        },
      ],
      'login',
    );

    expect(rows.map((row) => row.chatId)).toEqual(['chat-beta']);
  });
});
