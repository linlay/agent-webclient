import type { AgentEvent, Chat } from '@/app/state/types';
import {
  resolveChatSummaryPendingAwaiting,
  resolveChatSummaryUpdatedAt,
  upsertLiveChatSummary,
} from '@/features/chats/lib/chatSummaryLive';

const EPOCH_MS = 1_710_000_000_000;

describe('chatSummaryLive helpers', () => {
  it('marks stream and push awaiting ask events as pending approval', () => {
    expect(
      resolveChatSummaryPendingAwaiting({
        type: 'awaiting.ask',
      } as AgentEvent),
    ).toBe(true);
    expect(
      resolveChatSummaryPendingAwaiting({
        type: 'awaiting.asking',
      } as AgentEvent),
    ).toBe(true);
  });

  it('uses createdAt as updatedAt fallback for awaiting push events', () => {
    const event = {
      type: 'awaiting.asking',
      chatId: 'chat_1',
      runId: 'run_1',
      createdAt: EPOCH_MS,
    } as AgentEvent;

    expect(resolveChatSummaryUpdatedAt(event)).toBe(EPOCH_MS);
  });

  it('ignores string timestamp fields from live summary events', () => {
    const event = {
      type: 'chat.updated',
      updatedAt: '2026-07-02T09:00:00+08:00',
      createdAt: '2026-07-02T08:00:00+08:00',
    } as unknown as AgentEvent;

    expect(resolveChatSummaryUpdatedAt(event)).toBeUndefined();
  });

  it('clears pending approval state for stream and push awaiting answer events', () => {
    expect(
      resolveChatSummaryPendingAwaiting({ type: 'awaiting.answer' } as AgentEvent),
    ).toBe(false);
    expect(
      resolveChatSummaryPendingAwaiting({ type: 'awaiting.answered' } as AgentEvent),
    ).toBe(false);
  });

  it('clears pending approval state for run lifecycle events', () => {
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
        source: 'automation:daily',
        hasPendingAwaiting: true,
      },
    ];

    const next = upsertLiveChatSummary({
      event: {
        type: 'awaiting.answered',
        chatId: 'chat_1',
        runId: 'run_1',
        answeredAt: EPOCH_MS + 1,
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
        source: 'automation:daily',
        hasPendingAwaiting: false,
        updatedAt: EPOCH_MS + 1,
      },
    });
  });

  it('records source from chat.created and preserves it when later events omit source', () => {
    const created = upsertLiveChatSummary({
      event: {
        type: 'chat.created',
        chatId: 'chat_auto',
        runId: 'run_1',
        agentKey: 'agent-alpha',
        source: 'automation:daily',
        createdAt: EPOCH_MS,
      } as AgentEvent,
      cache: {
        chatId: '',
        runId: '',
        agentKey: '',
        teamId: '',
      },
      state: {
        chatId: '',
        runId: '',
        chats: [],
        chatAgentById: new Map(),
      },
      selectedContext: {
        agentKey: '',
        teamId: '',
      },
    });

    expect(created?.chat.source).toBe('automation:daily');

    const later = upsertLiveChatSummary({
      event: {
        type: 'run.start',
        chatId: 'chat_auto',
        runId: 'run_1',
        agentKey: 'agent-alpha',
        startedAt: EPOCH_MS + 1,
      } as AgentEvent,
      cache: created?.resolved || {
        chatId: '',
        runId: '',
        agentKey: '',
        teamId: '',
      },
      state: {
        chatId: 'chat_auto',
        runId: 'run_1',
        chats: [
          {
            chatId: 'chat_auto',
            agentKey: 'agent-alpha',
            source: 'automation:daily',
          } as Chat,
        ],
        chatAgentById: new Map([['chat_auto', 'agent-alpha']]),
      },
      selectedContext: {
        agentKey: '',
        teamId: '',
      },
    });

    expect(later?.chat.source).toBe('automation:daily');
  });

  it('keeps the Team as owner when a member task event carries agentKey', () => {
    const next = upsertLiveChatSummary({
      event: {
        type: 'run.start',
        chatId: 'chat_team',
        runId: 'run_team',
        agentKey: 'member_from_event',
        startedAt: EPOCH_MS,
      } as AgentEvent,
      cache: {
        chatId: 'chat_team',
        runId: 'run_team',
        agentKey: 'member_from_event',
        teamId: '',
      },
      state: {
        chatId: 'chat_team',
        runId: 'run_team',
        chats: [{
          chatId: 'chat_team',
          teamId: 'team_1',
          agentKey: 'persisted_stale_member',
        }],
        chatAgentById: new Map([['chat_team', 'persisted_stale_member']]),
      },
      selectedContext: { agentKey: '', teamId: '' },
    });

    expect(next?.chat.owner).toEqual({ kind: 'orchestrated-team', teamId: 'team_1' });
    expect(next?.chat.teamId).toBe('team_1');
    expect(next?.chat.agentKey).toBeUndefined();
    expect(next?.chat.activeRun).toMatchObject({
      teamId: 'team_1',
      owner: { kind: 'orchestrated-team', teamId: 'team_1' },
    });
  });
});
