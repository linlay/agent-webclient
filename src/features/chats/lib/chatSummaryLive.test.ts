import type { AgentEvent, Chat } from '@/app/state/types';
import {
  resolveChatSummaryPendingAwaiting,
  resolveChatSummaryUpdatedAt,
  upsertLiveChatSummary,
} from '@/features/chats/lib/chatSummaryLive';

describe('chatSummaryLive helpers', () => {
  it('marks awaiting.ask as pending approval and uses createdAt as updatedAt fallback', () => {
    const event = {
      type: 'awaiting.ask',
      chatId: 'chat_1',
      runId: 'run_1',
      createdAt: 12345,
    } as AgentEvent;

    expect(resolveChatSummaryPendingAwaiting(event)).toBe(true);
    expect(resolveChatSummaryUpdatedAt(event)).toBe(12345);
  });

  it('clears pending approval state for awaiting.answer and run lifecycle events', () => {
    expect(
      resolveChatSummaryPendingAwaiting({ type: 'awaiting.answer' } as AgentEvent),
    ).toBe(false);
    expect(
      resolveChatSummaryPendingAwaiting({ type: 'request.query' } as AgentEvent),
    ).toBe(false);
    expect(
      resolveChatSummaryPendingAwaiting({ type: 'run.complete' } as AgentEvent),
    ).toBe(false);
  });

  it('preserves chat metadata while updating awaiting summary state', () => {
    const chats: Chat[] = [
      {
        chatId: 'chat_1',
        chatName: 'Ops Chat',
        firstAgentName: 'Alice',
        firstAgentKey: 'agent-alice',
        agentKey: 'agent-alice',
        hasPendingAwaiting: true,
      },
    ];

    const next = upsertLiveChatSummary({
      event: {
        type: 'awaiting.answer',
        chatId: 'chat_1',
        runId: 'run_1',
        timestamp: 200,
      } as AgentEvent,
      cache: {
        chatId: 'chat_1',
        runId: 'run_1',
        agentKey: 'agent-alice',
        teamId: '',
      },
      state: {
        chatId: 'chat_1',
        runId: 'run_1',
        chats,
        chatAgentById: new Map([['chat_1', 'agent-alice']]),
      },
      selectedContext: {
        agentKey: '',
        teamId: '',
      },
    });

    expect(next).toMatchObject({
      chat: {
        chatId: 'chat_1',
        chatName: 'Ops Chat',
        firstAgentName: 'Alice',
        firstAgentKey: 'agent-alice',
        agentKey: 'agent-alice',
        hasPendingAwaiting: false,
        updatedAt: 200,
      },
    });
  });
});
