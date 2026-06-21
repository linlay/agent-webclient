import type { Agent, Chat } from '@/app/state/types';
import { buildWorkerRows } from '@/features/workers/lib/workerListFormatter';

describe('buildWorkerRows', () => {
  it('orders worker rows by latest updatedAt descending', () => {
    const agents: Agent[] = [
      { key: 'agent-alpha', name: 'Alpha' } as Agent,
      { key: 'agent-beta', name: 'Beta' } as Agent,
    ];
    const chats: Chat[] = [
      {
        chatId: 'chat_1',
        chatName: 'Alpha chat',
        agentKey: 'agent-alpha',
        lastRunId: 'z9',
        updatedAt: 100,
      } as Chat,
      {
        chatId: 'chat_2',
        chatName: 'Beta chat',
        agentKey: 'agent-beta',
        lastRunId: 'a1',
        updatedAt: 200,
      } as Chat,
    ];

    const rows = buildWorkerRows({
      agents,
      teams: [],
      chats,
      workerPriorityKey: 'agent:agent-alpha',
    });

    expect(rows.map((row) => row.key)).toEqual([
      'agent:agent-beta',
      'agent:agent-alpha',
    ]);
  });

  it('selects the latest worker chat by updatedAt instead of lastRunId', () => {
    const rows = buildWorkerRows({
      agents: [{ key: 'agent-alpha', name: 'Alpha' } as Agent],
      teams: [],
      chats: [
        {
          chatId: 'chat_newer',
          chatName: 'Newer chat',
          agentKey: 'agent-alpha',
          lastRunId: 'a1',
          updatedAt: 200,
        } as Chat,
        {
          chatId: 'chat_older',
          chatName: 'Older chat',
          agentKey: 'agent-alpha',
          lastRunId: 'z9',
          updatedAt: 100,
        } as Chat,
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-alpha',
      latestChatId: 'chat_newer',
      latestUpdatedAt: 200,
    });
  });

  it('does not create an extra row for a priority worker without history', () => {
    const rows = buildWorkerRows({
      agents: [],
      teams: [],
      chats: [],
      workerPriorityKey: 'agent:agent-new',
    });

    expect(rows).toEqual([]);
  });

  it('omits chat-derived rows when the worker is not in the current agent list', () => {
    const rows = buildWorkerRows({
      agents: [],
      teams: [],
      chats: [
        {
          chatId: 'chat_hidden',
          chatName: 'Hidden chat',
          agentKey: 'agent-hidden',
          lastRunId: 'a1',
          updatedAt: 100,
        } as Chat,
      ],
    });

    expect(rows).toEqual([]);
  });

  it('keeps only current agents when chats include hidden agents', () => {
    const rows = buildWorkerRows({
      agents: [{ key: 'agent-visible', name: 'Visible' } as Agent],
      teams: [],
      chats: [
        {
          chatId: 'chat_visible',
          chatName: 'Visible chat',
          agentKey: 'agent-visible',
          lastRunId: 'a1',
          updatedAt: 200,
        } as Chat,
        {
          chatId: 'chat_hidden',
          chatName: 'Hidden chat',
          agentKey: 'agent-hidden',
          lastRunId: 'a1',
          updatedAt: 300,
        } as Chat,
      ],
    });

    expect(rows.map((row) => row.key)).toEqual(['agent:agent-visible']);
    expect(rows.some((row) => row.key === 'agent:agent-hidden')).toBe(false);
  });

  it('carries react agent roles into worker rows and search text', () => {
    const rows = buildWorkerRows({
      agents: [
        {
          key: 'agent-react',
          name: 'React Agent',
          mode: 'REACT',
          role: 'Operations assistant',
        } as Agent,
      ],
      teams: [],
      chats: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-react',
      agentType: 'agent',
      role: 'Operations assistant',
    });
    expect(rows[0].searchText).toContain('operations assistant');
  });

  it('preserves explicitly empty agent names in worker rows', () => {
    const rows = buildWorkerRows({
      agents: [{ key: 'agent-a', name: '' } as Agent],
      teams: [],
      chats: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-a',
      displayName: '',
    });
  });

  it('carries coder workspace metadata into worker rows and search text', () => {
    const rows = buildWorkerRows({
      agents: [
        {
          key: 'agent-coder',
          name: 'agent-coder',
          mode: 'CODER',
          workspaceDir: '/Users/demo/Project/agent-coder',
        } as Agent,
      ],
      teams: [],
      chats: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-coder',
      agentType: 'coder',
      role: '',
      workspaceDir: '/Users/demo/Project/agent-coder',
    });
    expect(rows[0].searchText).toContain('/users/demo/project/agent-coder');
  });

  it('keeps coder roles searchable while preserving coder workspace metadata', () => {
    const rows = buildWorkerRows({
      agents: [
        {
          key: 'agent-coder',
          name: 'agent-coder',
          mode: 'CODER',
          role: 'Code reviewer',
          workspaceDir: '/Users/demo/Project/agent-coder',
        } as Agent,
      ],
      teams: [],
      chats: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-coder',
      agentType: 'coder',
      role: 'Code reviewer',
      workspaceDir: '/Users/demo/Project/agent-coder',
    });
    expect(rows[0].searchText).toContain('code reviewer');
    expect(rows[0].searchText).toContain('/users/demo/project/agent-coder');
  });

  it('treats dynamic workspace roots as unavailable for local open', () => {
    const rows = buildWorkerRows({
      agents: [
        {
          key: 'dynamic-coder',
          name: 'Dynamic Coder',
          mode: 'CODER',
          workspaceDir: ' @chat ',
          workspaceName: 'chat workspace',
        } as Agent,
      ],
      teams: [],
      chats: [],
    });

    expect(rows[0]).toMatchObject({
      key: 'agent:dynamic-coder',
      agentType: 'coder',
      workspaceName: 'chat workspace',
    });
    expect(rows[0].workspaceDir).toBeUndefined();
    expect(rows[0].searchText).toContain('chat workspace');
    expect(rows[0].searchText).not.toContain('@chat');
  });

  it('carries browser folder metadata without requiring a workspaceDir', () => {
    const rows = buildWorkerRows({
      agents: [
        {
          key: 'browser-coder',
          name: 'Browser Coder',
          type: 'coder',
          workspaceName: 'browser-coder',
          source: { kind: 'browser-folder' },
        } as Agent,
      ],
      teams: [],
      chats: [],
    });

    expect(rows[0]).toMatchObject({
      key: 'agent:browser-coder',
      agentType: 'coder',
      workspaceName: 'browser-coder',
      workspaceSourceKind: 'browser-folder',
    });
    expect(rows[0].workspaceDir).toBeUndefined();
    expect(rows[0].searchText).toContain('browser-coder');
  });
});
