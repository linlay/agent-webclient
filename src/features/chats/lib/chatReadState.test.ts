import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import { resolveWorkerUnreadCount } from '@/features/chats/lib/chatReadState';

describe('resolveWorkerUnreadCount', () => {
  const teamWorker: WorkerRow = {
    key: 'agent:ops',
    type: 'agent',
    sourceId: 'ops',
    displayName: 'Ops',
    role: '--',
    teamAgentLabels: [],
    latestChatId: '',
    latestRunId: '',
    latestUpdatedAt: 0,
    latestChatName: '',
    latestRunContent: '',
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: 'ops'
  };

  it('prefers Team unread statistics and otherwise counts Team-owned chats', () => {
    const chats: Chat[] = [
      { chatId: 'team-chat', agentKey: 'ops', read: { isRead: false } },
    ];

    expect(resolveWorkerUnreadCount(
      teamWorker,
      [{ key: 'ops', stats: { unreadCount: 4 }, mode: "TEAM" } as Agent],
      chats,
    )).toBe(4);

    expect(resolveWorkerUnreadCount(teamWorker, [], chats)).toBe(1);
  });
});
