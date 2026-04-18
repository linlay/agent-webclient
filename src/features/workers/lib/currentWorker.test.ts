import type { AppState, WorkerRow } from '@/app/state/types';
import { createInitialState } from '@/app/state/AppContext';
import {
  buildCurrentWorkerDetailView,
  buildScheduleDraft,
  buildWorkerSwitchRows,
  resolveCurrentWorkerSummary,
} from '@/features/workers/lib/currentWorker';

function createWorkerRow(partial: Partial<WorkerRow> & Pick<WorkerRow, 'key' | 'type' | 'sourceId' | 'displayName' | 'role'>): WorkerRow {
  return {
    teamAgentLabels: [],
    latestChatId: '',
    latestRunId: '',
    latestUpdatedAt: 0,
    latestChatName: '',
    latestRunContent: '',
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: '',
    ...partial,
  };
}

function createState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState(),
    ...overrides,
  };
}

describe('currentWorker helpers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('resolves the selected worker from the active chat when chat mode is open', () => {
    const row = createWorkerRow({
      key: 'agent:alice',
      type: 'agent',
      sourceId: 'alice',
      displayName: 'Alice',
      role: 'Analyst',
      hasHistory: true,
    });
    const state = createState({
      chatId: 'chat_1',
      chats: [{ chatId: 'chat_1', agentKey: 'alice', chatName: 'Alice chat' }],
      workerSelectionKey: 'agent:bob',
      workerRows: [row],
      workerIndexByKey: new Map([[row.key, row]]),
      agents: [{
        key: 'alice',
        name: 'Alice',
        role: 'Analyst',
        model: 'gpt-4.1',
      }],
    });

    const summary = resolveCurrentWorkerSummary(state);

    expect(summary).toMatchObject({
      key: 'agent:alice',
      displayName: 'Alice',
      role: 'Analyst',
    });
  });

  it('extracts structured detail fields with raw metadata fallback', () => {
    const row = createWorkerRow({
      key: 'team:ops',
      type: 'team',
      sourceId: 'ops',
      displayName: 'Ops Team',
      role: 'Dispatch',
      teamAgentLabels: ['Alice', 'Bob'],
    });
    const state = createState({
      workerSelectionKey: 'team:ops',
      workerRows: [row],
      workerIndexByKey: new Map([[row.key, row]]),
      teams: [{
        teamId: 'ops',
        name: 'Ops Team',
        role: 'Dispatch',
        modelName: 'gpt-4.1-mini',
        skills: ['triage', 'schedule'],
        tools: [{ toolName: 'calendar' }],
        members: [{ agentKey: 'alice' }, { key: 'bob' }],
      }],
    });

    const summary = resolveCurrentWorkerSummary(state);
    expect(summary).not.toBeNull();

    const detail = buildCurrentWorkerDetailView(summary!);

    expect(detail).toMatchObject({
      kindLabel: '小组',
      identifierLabel: 'teamId',
      identifierValue: 'ops',
      model: 'gpt-4.1-mini',
      skills: ['triage', 'schedule'],
      tools: ['calendar'],
      members: ['alice', 'bob'],
    });
    expect(detail.rawJson).toContain('"modelName": "gpt-4.1-mini"');
  });

  it('filters worker switch rows by scope and search text', () => {
    const rows = [
      createWorkerRow({
        key: 'agent:alice',
        type: 'agent',
        sourceId: 'alice',
        displayName: 'Alice',
        role: 'Analyst',
        searchText: 'alice analyst',
      }),
      createWorkerRow({
        key: 'team:ops',
        type: 'team',
        sourceId: 'ops',
        displayName: 'Ops Team',
        role: 'Dispatch',
        searchText: 'ops dispatch',
      }),
    ];

    expect(buildWorkerSwitchRows(rows, 'agent', '')).toHaveLength(1);
    expect(buildWorkerSwitchRows(rows, 'all', 'ops')[0]?.key).toBe('team:ops');
  });

  it('builds a schedule draft with worker context baked in', () => {
    const row = createWorkerRow({
      key: 'agent:alice',
      type: 'agent',
      sourceId: 'alice',
      displayName: 'Alice',
      role: 'Analyst',
    });
    const state = createState({
      workerSelectionKey: 'agent:alice',
      workerRows: [row],
      workerIndexByKey: new Map([[row.key, row]]),
      agents: [{ key: 'alice', name: 'Alice', role: 'Analyst' }],
    });
    const summary = resolveCurrentWorkerSummary(state);
    expect(summary).not.toBeNull();

    const draft = buildScheduleDraft(summary!, '每天整理日报', '工作日 18:00');

    expect(draft).toContain('对象名称: Alice');
    expect(draft).toContain('对象标识: agentKey=alice');
    expect(draft).toContain('任务内容: 每天整理日报');
    expect(draft).toContain('执行时间/规则: 工作日 18:00');
  });
});
