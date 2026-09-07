import { appReducer } from './reducer';
import { createInitialState } from './state';
import type { AppAction } from './actions';
import type { ActiveAwaiting } from '@/features/tools/lib/toolsState';
import type { PublishedArtifact } from '@/features/artifacts/lib/artifactsState';
import type { FileChangeSummary } from '@/features/overview/lib/overviewState';

const awaiting = (key: string): ActiveAwaiting => ({
  key, awaitingId: key, runId: 'run', agentKey: 'agent', timeout: null,
  mode: 'question', questions: [],
});
const artifact = (id: string, timestamp = 1): PublishedArtifact => ({
  artifactId: id, timestamp,
  artifact: { name: id, type: 'file', url: id, mimeType: 'text/plain', sha256: '', sizeBytes: 1 },
});
const change = (patch: Partial<FileChangeSummary> = {}): FileChangeSummary => ({
  runId: 'run', filePath: 'file', addedLines: 2, deletedLines: 1, editedLines: 3,
  operationCount: 1, lastUpdatedAt: 10, ...patch,
});

describe('domain migration behavior contracts', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true,
      value: { getItem: () => '', setItem: jest.fn() },
    });
  });

  it('persists terminal state and resets all overlay fields without losing access-token coordination', () => {
    const state = createInitialState();
    appReducer(state, { type: 'SET_TERMINAL_DOCK_OPEN', open: false });
    expect(localStorage.setItem).toHaveBeenCalledWith('agent-webclient.terminalDockOpen.v1', '0');
    const timer = setTimeout(() => undefined, 1000);
    clearTimeout(timer);
    const timed = { ...state, commandStatusOverlay: { ...state.commandStatusOverlay, timer } };
    const shown = appReducer(timed, { type: 'SHOW_COMMAND_STATUS_OVERLAY', commandType: 'learn', phase: 'error', text: 'failed' });
    expect(shown.commandStatusOverlay.timer).toBeNull();
    expect(appReducer(shown, { type: 'HIDE_COMMAND_STATUS_OVERLAY' }).commandStatusOverlay).toEqual(state.commandStatusOverlay);
    expect(appReducer(timed, { type: 'HIDE_COMMAND_STATUS_OVERLAY' }).commandStatusOverlay).toEqual(state.commandStatusOverlay);
    expect(appReducer({ ...state, wsErrorMessage: 'old' }, { type: 'SET_ACCESS_TOKEN', token: 'new' })).toMatchObject({ accessToken: 'new', wsErrorMessage: '' });
  });

  it('preserves unrelated global fields and handled no-op identity', () => {
    const state = createInitialState();
    const next = appReducer(state, { type: 'SET_AUTOMATIONS', automations: [] });
    expect(Object.keys(next)).toEqual(Object.keys(state));
    for (const key of Object.keys(state) as Array<keyof typeof state>) {
      if (key !== 'automations') expect(next[key]).toBe(state[key]);
    }
    for (const action of [
      { type: 'CLEAR_ACTIVE_AWAITING' },
      { type: 'PATCH_ACTIVE_AWAITING', patch: {} },
      { type: 'REFRESH_WEB_PREVIEW', url: 'missing' },
      { type: 'CLOSE_WEB_PREVIEW', url: 'missing' },
      { type: 'HIDE_COMMAND_STATUS_OVERLAY' },
    ] as AppAction[]) expect(appReducer(state, action)).toBe(state);
    expect(appReducer(state, { type: 'UNKNOWN' } as unknown as AppAction)).toBe(state);
  });

  it('retains Set and missing timer Map references while replacing the root', () => {
    const state = { ...createInitialState(), activeTaskIds: new Set(['task']) };
    for (const action of [
      { type: 'ADD_ACTIVE_TASK_ID', taskId: 'task' },
      { type: 'REMOVE_ACTIVE_TASK_ID', taskId: 'missing' },
      { type: 'CLEAR_REASONING_COLLAPSE_TIMER', reasoningId: 'missing' },
    ] as AppAction[]) {
      const next = appReducer(state, action);
      expect(next).not.toBe(state);
      expect(next.activeTaskIds).toBe(state.activeTaskIds);
      expect(next.reasoningCollapseTimers).toBe(state.reasoningCollapseTimers);
    }
    const next = appReducer(state, { type: 'ADD_ACTIVE_TASK_ID', taskId: 'new' });
    expect([...next.activeTaskIds]).toEqual(['task', 'new']);
    expect([...state.activeTaskIds]).toEqual(['task']);
  });

  it('promotes pending awaiting and preserves non-form patch precedence', () => {
    const first = awaiting('first');
    const second = awaiting('second');
    const state = { ...createInitialState(), activeAwaiting: first, pendingAwaitings: [second] };
    const patched = appReducer(state, { type: 'PATCH_ACTIVE_AWAITING', patch: {
      resolutionReason: 'timeout', pendingSubmitId: 'submit', loading: true,
    } });
    expect(patched.activeAwaiting).toEqual({ ...first, resolutionReason: 'timeout' });
    const ignored = appReducer(state, { type: 'PATCH_ACTIVE_AWAITING', patch: { loading: true } });
    expect(ignored).not.toBe(state);
    expect(ignored.activeAwaiting).toBe(first);
    const cleared = appReducer(state, { type: 'CLEAR_ACTIVE_AWAITING' });
    expect(cleared.activeAwaiting).toBe(second);
    expect(cleared.pendingAwaitings).toEqual([]);
    expect(state.pendingAwaitings).toEqual([second]);
  });

  it('keeps duplicate timeline entries and the first artifact replacement position', () => {
    const original = artifact('a');
    const duplicate = artifact('a', 2);
    const state = { ...createInitialState(), timelineOrder: ['node'], artifacts: [original, artifact('b'), duplicate] };
    expect(appReducer(state, { type: 'APPEND_TIMELINE_ORDER', id: 'node' }).timelineOrder).toEqual(['node', 'node']);
    const replacement = artifact('a', 3);
    const next = appReducer(state, { type: 'UPSERT_ARTIFACT', artifact: replacement });
    expect(next.artifacts).toEqual([replacement, state.artifacts[1], duplicate]);
    expect(state.artifacts[0]).toBe(original);
  });

  it('normalizes and accumulates file changes without conflating colon-containing keys', () => {
    const state = { ...createInitialState(), fileChanges: [change()] };
    const next = appReducer(state, { type: 'UPSERT_FILE_CHANGE', fileChange: change({
      runId: ' run ', filePath: ' file ', addedLines: -2, operationCount: 0, lastUpdatedAt: 5,
    }) });
    expect(next.fileChanges).toEqual([change({ deletedLines: 2, editedLines: 6, operationCount: 2 })]);
    for (const invalid of [change({ runId: ' ' }), change({ filePath: '' }), change({ lastUpdatedAt: NaN }), change({ lastUpdatedAt: 0 })]) {
      const ignored = appReducer(state, { type: 'UPSERT_FILE_CHANGE', fileChange: invalid });
      expect(ignored).not.toBe(state);
      expect(ignored.fileChanges).toBe(state.fileChanges);
    }
    const collision = { ...state, fileChanges: [change({ runId: 'a:b', filePath: 'c' })] };
    expect(appReducer(collision, { type: 'UPSERT_FILE_CHANGE', fileChange: change({ runId: 'a', filePath: 'b:c' }) }).fileChanges).toHaveLength(2);
  });

  it('preserves Plan actions and executed action identity through their existing priority', () => {
    const runtime = { status: 'running', updatedAt: 1, error: '' };
    const state = { ...createInitialState(), executedActionIds: new Set(['done']) };
    expect(appReducer(state, { type: 'ADD_EXECUTED_ACTION_ID', actionId: 'done' }).executedActionIds).toBe(state.executedActionIds);
    expect(appReducer(state, { type: 'SET_PLAN_RUNTIME', taskId: 't', runtime }).planRuntimeByTaskId.get('t')).toBe(runtime);
    expect(appReducer(state, { type: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId: 't' }).planCurrentRunningTaskId).toBe('t');
    expect(appReducer(state, { type: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId: 't' }).planLastTouchedTaskId).toBe('t');
  });

  it('keeps viewer absent/null semantics, planning recency and close coordination', () => {
    const state = { ...createInitialState(), rightSidebarOpenTab: 'web' as const,
      artifactExpanded: true, artifactManualOverride: true,
      planningPreviews: [{ nodeId: 'a', label: 'A' }, { nodeId: 'b', label: 'B' }],
      webPreviews: [{ url: 'one', title: 'One' }], activeWebPreviewUrl: 'one',
      webPreviewRefreshRevisionByUrl: new Map([['one', 4]]),
    };
    const opened = appReducer(state, { type: 'OPEN_RIGHT_SIDEBAR', planningPreview: { nodeId: 'a', label: 'New' } });
    expect(opened.rightSidebarOpenTab).toBeNull();
    expect(opened.planningPreviews.map(p => p.nodeId)).toEqual(['b', 'a']);
    expect(opened.webPreviews).toBe(state.webPreviews);
    const empty = appReducer(state, { type: 'OPEN_RIGHT_SIDEBAR', webPreview: null });
    expect(empty.webPreviews).toEqual([]);
    expect(empty.activeWebPreviewUrl).toBe('');
    expect(empty.webPreviewRefreshRevisionByUrl).toBe(state.webPreviewRefreshRevisionByUrl);
    const closed = appReducer(state, { type: 'CLOSE_WEB_PREVIEW', url: 'one' });
    expect(closed.webPreviewRefreshRevisionByUrl.has('one')).toBe(false);
    expect(closed.rightSidebarOpenTab).toBe('overview');
    const sidebar = appReducer(state, { type: 'CLOSE_RIGHT_SIDEBAR' });
    expect(sidebar.rightSidebarOpenTab).toBeNull();
    expect(sidebar.artifactExpanded).toBe(false);
    expect(sidebar.artifactManualOverride).toBe(false);
  });
});
