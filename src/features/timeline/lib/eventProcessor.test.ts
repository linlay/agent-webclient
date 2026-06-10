import type {
  AgentEvent,
  FileChangeSummary,
  Plan,
  PlanRuntime,
  TaskItemMeta,
  TimelineNode,
  ToolState,
} from '@/app/state/types';
import type { EventCommand, EventProcessorState } from '@/features/timeline/lib/eventProcessor';
import { processEvent } from '@/features/timeline/lib/eventProcessor';
import {
  clearAllAwaitingQuestionMeta,
  registerAwaitingApprovalMeta,
  registerAwaitingQuestionMeta,
} from '@/features/tools/lib/awaitingQuestionMeta';

type TestState = {
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  toolNodeById: Map<string, string>;
  toolStates: Map<string, ToolState>;
  timelineCounter: number;
  activeReasoningKey: string;
  chatId: string;
  runId: string;
  artifacts: Array<{
    artifactId: string;
    artifact: {
      mimeType: string;
      name: string;
      sha256: string;
      sizeBytes: number;
      type: 'file';
      url: string;
    };
    timestamp: number;
  }>;
  fileChanges: FileChangeSummary[];
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
  taskItemsById: Map<string, TaskItemMeta>;
  planCurrentRunningTaskId: string;
  planLastTouchedTaskId: string;
};

function createState(): TestState {
  return {
    timelineNodes: new Map(),
    timelineOrder: [],
    contentNodeById: new Map(),
    reasoningNodeById: new Map(),
    toolNodeById: new Map(),
    toolStates: new Map(),
    timelineCounter: 0,
    activeReasoningKey: '',
    chatId: '',
    runId: '',
    artifacts: [],
    fileChanges: [],
    plan: null,
    planRuntimeByTaskId: new Map(),
    taskItemsById: new Map(),
    planCurrentRunningTaskId: '',
    planLastTouchedTaskId: '',
  };
}

function buildProcessorState(state: TestState): EventProcessorState {
  return {
    getContentNodeId: (contentId) => state.contentNodeById.get(contentId),
    getReasoningNodeId: (reasoningId) => state.reasoningNodeById.get(reasoningId),
    getToolNodeId: (toolId) => state.toolNodeById.get(toolId),
    getToolState: (toolId) => state.toolStates.get(toolId),
    getTimelineNode: (nodeId) => state.timelineNodes.get(nodeId),
    getNodeText: (nodeId) => state.timelineNodes.get(nodeId)?.text || '',
    nextCounter: () => state.timelineCounter++,
    peekCounter: () => state.timelineCounter,
    activeReasoningKey: state.activeReasoningKey,
    chatId: state.chatId,
    runId: state.runId,
    currentRunningPlanTaskId: state.planCurrentRunningTaskId,
    getTaskItem: (taskId) => state.taskItemsById.get(taskId),
    getActiveTaskIds: () =>
      Array.from(state.taskItemsById.values())
        .filter((task) => task.status === 'running')
        .map((task) => task.taskId),
    getPlanTaskDescription: (taskId) =>
      state.plan?.plan.find((item) => item.taskId === taskId)?.description,
    getPlanId: () => state.plan?.planId,
  };
}

function applyCommands(state: TestState, commands: EventCommand[]): void {
  for (const command of commands) {
    switch (command.cmd) {
      case 'SET_CHAT_ID':
        state.chatId = command.chatId;
        break;
      case 'SET_RUN_ID':
        state.runId = command.runId;
        break;
      case 'SET_CHAT_AGENT':
        break;
      case 'SET_CONTENT_NODE_ID':
        state.contentNodeById.set(command.contentId, command.nodeId);
        break;
      case 'SET_REASONING_NODE_ID':
        state.reasoningNodeById.set(command.reasoningId, command.nodeId);
        break;
      case 'SET_TOOL_NODE_ID':
        state.toolNodeById.set(command.toolId, command.nodeId);
        break;
      case 'APPEND_TIMELINE_ORDER':
        state.timelineOrder.push(command.nodeId);
        break;
      case 'SET_TIMELINE_NODE':
        state.timelineNodes.set(command.id, command.node);
        break;
      case 'SET_TOOL_STATE':
        state.toolStates.set(command.toolId, command.state);
        break;
      case 'SET_ACTIVE_REASONING_KEY':
        state.activeReasoningKey = command.key;
        break;
      case 'UPSERT_ARTIFACT': {
        const index = state.artifacts.findIndex((item) => item.artifactId === command.artifact.artifactId);
        if (index < 0) {
          state.artifacts.push(command.artifact);
        } else {
          state.artifacts[index] = command.artifact;
        }
        break;
      }
      case 'UPSERT_FILE_CHANGE': {
        const index = state.fileChanges.findIndex(
          (item) =>
            item.runId === command.fileChange.runId &&
            item.filePath === command.fileChange.filePath,
        );
        if (index < 0) {
          state.fileChanges.push(command.fileChange);
        } else {
          const current = state.fileChanges[index];
          state.fileChanges[index] = {
            runId: current.runId,
            filePath: current.filePath,
            addedLines: current.addedLines + command.fileChange.addedLines,
            deletedLines: current.deletedLines + command.fileChange.deletedLines,
            editedLines: current.editedLines + command.fileChange.editedLines,
            operationCount: current.operationCount + command.fileChange.operationCount,
            lastUpdatedAt: Math.max(current.lastUpdatedAt, command.fileChange.lastUpdatedAt),
          };
        }
        break;
      }
      case 'SET_PLAN':
        state.plan = command.plan;
        if (command.resetRuntime) {
          state.planRuntimeByTaskId = new Map();
          state.planCurrentRunningTaskId = '';
          state.planLastTouchedTaskId = '';
        }
        break;
      case 'SET_PLAN_RUNTIME':
        state.planRuntimeByTaskId.set(command.taskId, command.runtime);
        break;
      case 'SET_TASK_ITEM_META':
        state.taskItemsById.set(command.taskId, command.task);
        break;
      case 'SET_PLAN_CURRENT_RUNNING_TASK_ID':
        state.planCurrentRunningTaskId = command.taskId;
        break;
      case 'SET_PLAN_LAST_TOUCHED_TASK_ID':
        state.planLastTouchedTaskId = command.taskId;
        break;
      case 'USER_MESSAGE':
        state.timelineNodes.set(command.nodeId, {
          id: command.nodeId,
          kind: 'message',
          role: 'user',
          messageVariant: command.variant,
          steerId: command.steerId,
          text: command.text,
          attachments: command.attachments,
          taskId: command.taskId,
          taskName: command.taskName,
          taskGroupId: command.taskGroupId,
          subAgentKey: command.subAgentKey,
          ts: command.ts,
        });
        state.timelineOrder.push(command.nodeId);
        break;
      case 'SYSTEM_ERROR':
        state.timelineNodes.set(command.nodeId, {
          id: command.nodeId,
          kind: 'message',
          role: 'system',
          text: command.text,
          ts: command.ts,
        });
        state.timelineOrder.push(command.nodeId);
        break;
    }
  }
}

function processAndApply(state: TestState, event: AgentEvent, mode: 'live' | 'replay', reasoningExpandedDefault: boolean): EventCommand[] {
  const commands = processEvent(event, buildProcessorState(state), { mode, reasoningExpandedDefault });
  applyCommands(state, commands);
  return commands;
}

describe('processEvent', () => {
  beforeEach(() => {
    clearAllAwaitingQuestionMeta();
  });

  it('creates request.query user nodes only during replay', () => {
    const replayState = createState();
    const liveState = createState();

    const replayCommands = processEvent({
      type: 'request.query',
      requestId: 'req_1',
      message: 'hello',
      references: [
        {
          id: 'i1',
          name: 'demo.png',
          sizeBytes: 2048,
        },
      ],
    }, buildProcessorState(replayState), {
      mode: 'replay',
      reasoningExpandedDefault: false,
    });
    const liveCommands = processEvent({ type: 'request.query', requestId: 'req_1', message: 'hello' }, buildProcessorState(liveState), {
      mode: 'live',
      reasoningExpandedDefault: true,
    });

    expect(replayCommands).toEqual([
      {
        cmd: 'USER_MESSAGE',
        nodeId: 'user_req_1',
        text: 'hello',
        ts: expect.any(Number),
        variant: 'default',
        attachments: [
          {
            name: 'demo.png',
            size: 2048,
          },
        ],
      },
    ]);
    expect(liveCommands).toEqual([]);
  });

  it('creates replay user nodes for attachment-only request.query events', () => {
    const replayCommands = processEvent({
      type: 'request.query',
      requestId: 'req_attachments_only',
      message: '',
      references: [
        {
          id: 'f1',
          name: 'report.pdf',
          sizeBytes: 4096,
        },
      ],
    }, buildProcessorState(createState()), {
      mode: 'replay',
      reasoningExpandedDefault: false,
    });

    expect(replayCommands).toEqual([
      {
        cmd: 'USER_MESSAGE',
        nodeId: 'user_req_attachments_only',
        text: '',
        ts: expect.any(Number),
        variant: 'default',
        attachments: [
          {
            name: 'report.pdf',
            size: 4096,
          },
        ],
      },
    ]);
  });

  it('reads request.query text from query when message is absent', () => {
    const replayCommands = processEvent({
      type: 'request.query',
      requestId: 'req_query_field',
      query: 'hello from query',
    }, buildProcessorState(createState()), {
      mode: 'replay',
      reasoningExpandedDefault: false,
    });

    expect(replayCommands).toEqual([
      expect.objectContaining({
        cmd: 'USER_MESSAGE',
        nodeId: 'user_req_query_field',
        text: 'hello from query',
      }),
    ]);
  });

  it('attaches task metadata to replay request.query nodes when taskId is present', () => {
    const state = createState();
    state.taskItemsById.set('task_1', {
      taskId: 'task_1',
      taskName: 'Replay task',
      taskGroupId: 'task_group_task_1',
      subAgentKey: '',
      runId: 'run_1',
      status: 'running',
      startedAt: 90,
      updatedAt: 90,
      error: '',
    });

    processAndApply(state, {
      type: 'request.query',
      requestId: 'req_task',
      taskId: 'task_1',
      message: 'hello task',
      timestamp: 100,
    }, 'replay', false);

    expect(state.timelineNodes.get('user_req_task')).toMatchObject({
      taskId: 'task_1',
      taskName: 'Replay task',
      taskGroupId: 'task_group_task_1',
      subAgentKey: undefined,
    });
  });

  it('collects published artifacts for dock rendering', () => {
    const state = createState();

    processAndApply(state, {
      type: 'artifact.publish',
      runId: 'run_1',
      chatId: 'chat_1',
      timestamp: 200,
      artifactCount: 2,
      artifacts: [
        {
          artifactId: 'artifact_1',
          type: 'file',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          sha256: 'abc123',
          sizeBytes: 2048,
          url: 'https://example.com/report.pdf',
        },
        {
          artifactId: 'artifact_2',
          type: 'file',
          name: 'summary.txt',
          mimeType: 'text/plain',
          sha256: 'def456',
          sizeBytes: 128,
          url: 'https://example.com/summary.txt',
        },
      ],
    }, 'live', true);

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: 200,
        artifact: {
          type: 'file',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          sha256: 'abc123',
          sizeBytes: 2048,
          url: 'https://example.com/report.pdf',
        },
      },
      {
        artifactId: 'artifact_2',
        timestamp: 200,
        artifact: {
          type: 'file',
          name: 'summary.txt',
          mimeType: 'text/plain',
          sha256: 'def456',
          sizeBytes: 128,
          url: 'https://example.com/summary.txt',
        },
      },
    ]);
  });

  it('ignores invalid artifact.publish payloads and invalid items', () => {
    const state = createState();

    processAndApply(state, {
      type: 'artifact.publish',
      runId: 'run_1',
      artifacts: [
        {
          artifactId: 'artifact_1',
          type: 'file',
          name: 'valid.txt',
          mimeType: 'text/plain',
          sizeBytes: 12,
          url: 'https://example.com/valid.txt',
        },
        {
          artifactId: 'artifact_2',
          type: 'file',
          name: 'missing-url.txt',
        },
      ],
    }, 'live', true);

    processAndApply(state, {
      type: 'artifact.publish',
      runId: 'run_1',
      artifactCount: 1,
    }, 'live', true);

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: expect.any(Number),
        artifact: {
          type: 'file',
          name: 'valid.txt',
          mimeType: 'text/plain',
          sha256: '',
          sizeBytes: 12,
          url: 'https://example.com/valid.txt',
        },
      },
    ]);
  });

  it('reuses content nodes until terminal state then creates a new one', () => {
    const state = createState();

    processAndApply(state, { type: 'content.delta', contentId: 'c1', delta: 'hello' }, 'replay', false);
    const firstNodeId = state.contentNodeById.get('c1');
    processAndApply(state, { type: 'content.end', contentId: 'c1', text: 'hello' }, 'replay', false);
    processAndApply(state, { type: 'content.delta', contentId: 'c1', delta: 'again' }, 'replay', false);

    expect(firstNodeId).toBe('content_0');
    expect(state.contentNodeById.get('c1')).toBe('content_1');
    expect(state.timelineNodes.get('content_1')?.text).toBe('again');
  });

  it('creates implicit reasoning nodes and respects expanded default', () => {
    const state = createState();

    processAndApply(state, {
      type: 'reasoning.start',
      text: 'thinking',
      reasoningLabel: '分析问题',
    }, 'replay', false);

    const node = state.timelineNodes.get('thinking_0');
    expect(state.reasoningNodeById.get('implicit_reasoning_0')).toBe('thinking_0');
    expect(node?.expanded).toBe(false);
    expect(node?.status).toBe('running');
    expect(node?.reasoningLabel).toBe('分析问题');
  });

  it('creates timeline nodes for streamed planning events', () => {
    const state = createState();

    processAndApply(state, {
      type: 'planning.start',
      planningId: 'planning_1',
      planningLabel: '制定计划',
      text: '先确认',
      timestamp: 100,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.delta',
      planningId: 'planning_1',
      delta: '需求',
      timestamp: 110,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.end',
      planningId: 'planning_1',
      timestamp: 120,
    }, 'replay', false);

    expect(state.timelineOrder).toEqual(['planning_0']);
    expect(state.reasoningNodeById.get('planning:planning_1')).toBe('planning_0');
    expect(state.timelineNodes.get('planning_0')).toMatchObject({
      kind: 'planning',
      reasoningLabel: '制定计划',
      text: '先确认需求',
      status: 'completed',
      expanded: false,
      ts: 120,
    });
  });

  it('preserves planning delta whitespace when building timeline text', () => {
    const state = createState();

    processAndApply(state, {
      type: 'planning.start',
      planningId: 'planning_1',
      planningLabel: '制定计划',
      timestamp: 100,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.delta',
      planningId: 'planning_1',
      delta: '# Title\n',
      timestamp: 110,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.delta',
      planningId: 'planning_1',
      delta: '\n## Summary',
      timestamp: 120,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.delta',
      planningId: 'planning_1',
      delta: '\n\n正文',
      timestamp: 130,
    }, 'replay', false);
    processAndApply(state, {
      type: 'planning.end',
      planningId: 'planning_1',
      timestamp: 140,
    }, 'replay', false);

    expect(state.timelineNodes.get('planning_0')?.text).toBe(
      '# Title\n\n## Summary\n\n正文',
    );
  });

  it('creates awaiting answer nodes for timeline display', () => {
    const state = createState();

    processAndApply(state, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'answered',
      answers: [
        {
          id: 'q1',
          question: '继续执行吗？',
          answer: '继续',
        },
      ],
      timestamp: 220,
    }, 'replay', false);

    expect(state.timelineOrder).toEqual(['awaiting_answer_run_1_await_1']);
    expect(state.timelineNodes.get('awaiting_answer_run_1_await_1')).toMatchObject({
      id: 'awaiting_answer_run_1_await_1',
      kind: 'awaiting-answer',
      awaitingId: 'await_1',
      title: '已提交回答',
      text: '{\n  "status": "answered",\n  "items": [\n    {\n      "id": "q1",\n      "question": "继续执行吗？",\n      "answer": "继续"\n    }\n  ]\n}',
      status: 'completed',
      expanded: false,
      ts: 220,
    });
  });

  it('masks password answers in awaiting answer timeline nodes', () => {
    const state = createState();

    registerAwaitingQuestionMeta('run_1', 'await_1', [
      {
        id: 'db_password',
        type: 'password',
        header: '数据库密码',
        question: '请输入数据库密码',
      },
    ]);

    processAndApply(state, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'answered',
      answers: [
        {
          id: 'db_password',
          answer: 'super-secret',
        },
      ],
      timestamp: 221,
    }, 'replay', false);

    expect(
      JSON.parse(state.timelineNodes.get('awaiting_answer_run_1_await_1')?.text || '{}'),
    ).toEqual({
      items: [
        {
          id: 'db_password',
          answer: '••••••',
          header: '数据库密码',
          question: '请输入数据库密码',
        },
      ],
      status: 'answered',
    });
  });

  it('rehydrates approval answers without requiring a level field', () => {
    const state = createState();

    registerAwaitingApprovalMeta('run_1', 'await_1', [
      {
        id: 'approval_1',
        command: 'rm -rf /tmp/demo',
        ruleKey: 'dangerous-commands::rm',
        description: '删除临时目录',
      },
    ]);

    processAndApply(state, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'answered',
      approvals: [
	        {
	          id: 'approval_1',
	          decision: 'approve',
	          reason: '继续执行',
        },
      ],
      timestamp: 222,
    }, 'replay', false);

    expect(
      JSON.parse(state.timelineNodes.get('awaiting_answer_run_1_await_1')?.text || '{}'),
    ).toEqual({
      items: [
        {
          id: 'approval_1',
	          decision: 'approve',
          reason: '继续执行',
          command: 'rm -rf /tmp/demo',
          ruleKey: 'dangerous-commands::rm',
        },
      ],
      status: 'answered',
    });
  });

  it('maps awaiting answer errors to title and envelope text', () => {
    const state = createState();

    processAndApply(state, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'error',
      error: {
        code: 'timeout',
        message: '等待项已超时',
      },
      timestamp: 223,
    }, 'replay', false);

    expect(state.timelineNodes.get('awaiting_answer_run_1_await_1')).toMatchObject({
      id: 'awaiting_answer_run_1_await_1',
      kind: 'awaiting-answer',
      awaitingId: 'await_1',
      title: '等待已超时',
      text: '{\n  "status": "error",\n  "error": {\n    "code": "timeout",\n    "message": "等待项已超时"\n  }\n}',
      status: 'completed',
      expanded: false,
      ts: 223,
    });
  });

  it('buffers tool args and upgrades argsText to pretty JSON once complete', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_1',
      toolName: 'demo.run',
      toolType: 'fireworks',
      viewportKey: 'viewport_demo',
    }, 'replay', false);
    processAndApply(state, { type: 'tool.args', toolId: 'tool_1', delta: '{\"foo\"' }, 'replay', false);
    processAndApply(state, { type: 'tool.args', toolId: 'tool_1', delta: ':\"bar\"}' }, 'replay', false);

    expect(state.toolStates.get('tool_1')?.toolParams).toEqual({ foo: 'bar' });
    expect(state.timelineNodes.get('tool_0')?.argsText).toBe('{\n  "foo": "bar"\n}');
  });

  it('marks incomplete tool args when the run ends before buffered args form valid JSON', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_2',
      toolName: 'sandbox.exec',
    }, 'replay', false);
    processAndApply(state, {
      type: 'tool.args',
      toolId: 'tool_2',
      delta: '{"command":"cat << \'PYTHON_SCRIPT\' > /workspace/create.py',
    }, 'replay', false);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_2',
      result: 'exitCode: -1',
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.argsText).toContain('[incomplete tool args]');
    expect(state.timelineNodes.get('tool_0')?.status).toBe('success');
  });

  it('records file_write line stats from object tool results', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_write',
      toolName: 'file_write',
      runId: 'run_1',
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_write',
      result: {
        status: 'written',
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 12,
          deletedLines: 3,
          editedLines: 3,
        },
      },
      timestamp: 120,
    }, 'live', true);

    expect(state.fileChanges).toEqual([
      {
        runId: 'run_1',
        filePath: '/workspace/src/App.tsx',
        addedLines: 12,
        deletedLines: 3,
        editedLines: 3,
        operationCount: 1,
        lastUpdatedAt: 120,
      },
    ]);
  });

  it('records file_edit line stats from JSON string replay results', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.snapshot',
      toolId: 'tool_edit',
      toolName: 'file_edit',
      runId: 'run_1',
      arguments: '{"file_path":"/workspace/src/App.tsx"}',
      timestamp: 100,
    }, 'replay', false);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_edit',
      result: JSON.stringify({
        status: 'edited',
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: '4',
          deletedLines: '1',
          editedLines: '1',
        },
      }),
      timestamp: 140,
    }, 'replay', false);

    expect(state.fileChanges).toEqual([
      {
        runId: 'run_1',
        filePath: '/workspace/src/App.tsx',
        addedLines: 4,
        deletedLines: 1,
        editedLines: 1,
        operationCount: 1,
        lastUpdatedAt: 140,
      },
    ]);
  });

  it('aggregates multiple file mutations for the same file', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_write_once',
      toolName: 'file_write',
      runId: 'run_1',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_write_once',
      result: {
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 2,
          deletedLines: 0,
          editedLines: 0,
        },
      },
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_edit_once',
      toolName: 'file_edit',
      runId: 'run_1',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_edit_once',
      result: {
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 4,
          deletedLines: 1,
          editedLines: 1,
        },
      },
      timestamp: 130,
    }, 'live', true);

    expect(state.fileChanges).toEqual([
      {
        runId: 'run_1',
        filePath: '/workspace/src/App.tsx',
        addedLines: 6,
        deletedLines: 1,
        editedLines: 1,
        operationCount: 2,
        lastUpdatedAt: 130,
      },
    ]);
  });

  it('keeps file change aggregates separate by run id', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_write_run_1',
      toolName: 'file_write',
      runId: 'run_1',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_write_run_1',
      result: {
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 2,
          deletedLines: 0,
          editedLines: 0,
        },
      },
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_write_run_2',
      toolName: 'file_write',
      runId: 'run_2',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_write_run_2',
      result: {
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 3,
          deletedLines: 1,
          editedLines: 1,
        },
      },
      timestamp: 130,
    }, 'live', true);

    expect(state.fileChanges).toEqual([
      {
        runId: 'run_1',
        filePath: '/workspace/src/App.tsx',
        addedLines: 2,
        deletedLines: 0,
        editedLines: 0,
        operationCount: 1,
        lastUpdatedAt: 100,
      },
      {
        runId: 'run_2',
        filePath: '/workspace/src/App.tsx',
        addedLines: 3,
        deletedLines: 1,
        editedLines: 1,
        operationCount: 1,
        lastUpdatedAt: 130,
      },
    ]);
  });

  it('ignores failed, non-file, and malformed tool results for file changes', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_failed_write',
      toolName: 'file_write',
      runId: 'run_1',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_failed_write',
      result: {
        exitCode: -1,
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 2,
          deletedLines: 0,
          editedLines: 0,
        },
      },
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_not_file',
      toolName: 'bash',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_not_file',
      result: {
        filePath: '/workspace/src/App.tsx',
        lineStats: {
          addedLines: 2,
          deletedLines: 0,
          editedLines: 0,
        },
      },
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.start',
      toolId: 'tool_missing_stats',
      toolName: 'file_edit',
      runId: 'run_1',
    }, 'live', true);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_missing_stats',
      result: {
        filePath: '/workspace/src/App.tsx',
      },
    }, 'live', true);

    expect(state.fileChanges).toEqual([]);
  });

  it('marks tool.result as failed when object result has non-zero camelCase exitCode', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_exit_object',
      result: {
        exitCode: 1,
        stdout: 'The build failed. Fix the build errors and run again.',
        stderr: '',
      },
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.status).toBe('failed');
  });

  it('marks tool.result as failed when JSON string result has non-zero camelCase exitCode', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_exit_json_camel',
      result: JSON.stringify({
        exitCode: 1,
        stdout: 'The build failed. Fix the build errors and run again.',
        stderr: '',
      }),
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.status).toBe('failed');
  });

  it('marks tool.result as failed when JSON string result has non-zero snake_case exit_code', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_exit_json_snake',
      result: JSON.stringify({
        exit_code: 1,
        stdout: 'The build failed. Fix the build errors and run again.',
        stderr: '',
      }),
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.status).toBe('failed');
  });

  it('keeps tool.result successful when structured exitCode is zero', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_exit_zero',
      result: JSON.stringify({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      }),
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.status).toBe('success');
  });

  it('does not infer tool.result failure from non-JSON text mentioning exitCode', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'tool_exit_text',
      result: 'exitCode: -1',
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')?.status).toBe('success');
  });

  it('hydrates tool.snapshot from snapshot payload and links a later tool.result', () => {
    const state = createState();

    processAndApply(state, {
      type: 'tool.snapshot',
      toolId: 'call_1',
      toolName: 'datetime',
      toolLabel: '日期时间',
      arguments: '{"offset":"+2D"}',
      toolDescription: '获取当前或偏移后的日期时间',
      timestamp: 100,
    }, 'replay', false);
    processAndApply(state, {
      type: 'tool.result',
      toolId: 'call_1',
      result: '{"date":"2026-03-22"}',
      timestamp: 110,
    }, 'replay', false);

    expect(state.timelineNodes.get('tool_0')).toMatchObject({
      toolId: 'call_1',
      toolName: 'datetime',
      toolLabel: '日期时间',
      description: '获取当前或偏移后的日期时间',
      argsText: '{\n  "offset": "+2D"\n}',
      status: 'success',
      result: {
        text: '{"date":"2026-03-22"}',
        isCode: false,
      },
    });
  });

  it('materializes tool.result even when the mapped tool node is not in state yet', () => {
    const state = createState();
    state.toolNodeById.set('call_2', 'tool_0');
    state.toolStates.set('call_2', {
      toolId: 'call_2',
      argsBuffer: '{\n  "offset": "+2D"\n}',
      toolLabel: '日期时间',
      toolName: 'datetime',
      toolType: '',
      viewportKey: '',
      toolTimeout: null,
      toolParams: { offset: '+2D' },
      description: '获取当前时间',
      runId: 'run_1',
    });

    processAndApply(state, {
      type: 'tool.result',
      toolId: 'call_2',
      result: '{"date":"2026-03-22"}',
      timestamp: 120,
    }, 'live', true);

    expect(state.timelineNodes.get('tool_0')).toMatchObject({
      toolId: 'call_2',
      toolName: 'datetime',
      toolLabel: '日期时间',
      description: '获取当前时间',
      argsText: '{\n  "offset": "+2D"\n}',
      status: 'success',
      result: {
        text: '{"date":"2026-03-22"}',
        isCode: false,
      },
    });
  });

  it('resets plan runtime when planId changes and clears current running task on completion', () => {
    const state = createState();

    processAndApply(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'a' }],
    }, 'live', true);
    processAndApply(state, { type: 'task.start', taskId: 'task_1' }, 'live', true);
    expect(state.planCurrentRunningTaskId).toBe('task_1');

    processAndApply(state, {
      type: 'plan.update',
      planId: 'plan_2',
      plan: [{ taskId: 'task_2', description: 'b' }],
    }, 'live', true);
    expect(state.planRuntimeByTaskId.size).toBe(0);
    expect(state.planCurrentRunningTaskId).toBe('');

    processAndApply(state, { type: 'task.start', taskId: 'task_2' }, 'live', true);
    processAndApply(state, { type: 'task.complete', taskId: 'task_2' }, 'live', true);
    expect(state.planRuntimeByTaskId.get('task_2')?.status).toBe('completed');
    expect(state.planCurrentRunningTaskId).toBe('');
  });

  it('stores task metadata and attaches explicit task ids to visible timeline nodes', () => {
    const state = createState();

    processAndApply(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'Explore orchestrator' }],
    }, 'live', true);
    processAndApply(state, {
      type: 'task.start',
      taskId: 'task_1',
      taskName: 'Explore agentOrchestrator definition',
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'content.delta',
      contentId: 'content_1',
      taskId: 'task_1',
      delta: 'searching',
      timestamp: 120,
    }, 'live', true);
    processAndApply(state, {
      type: 'task.complete',
      taskId: 'task_1',
      timestamp: 220,
    }, 'live', true);

    expect(state.taskItemsById.get('task_1')).toMatchObject({
      taskId: 'task_1',
      taskName: 'Explore agentOrchestrator definition',
      taskGroupId: 'task_group_task_1',
      subAgentKey: '',
      status: 'completed',
      startedAt: 100,
      endedAt: 220,
      durationMs: 120,
    });
    expect(state.timelineNodes.get('content_0')).toMatchObject({
      taskId: 'task_1',
      taskName: 'Explore agentOrchestrator definition',
      taskGroupId: 'task_group_task_1',
      subAgentKey: undefined,
    });
    expect(state.timelineNodes.has('agent_group_task_group_task_1')).toBe(false);
  });

  it('tracks sub-agent tasks without creating an agent-group timeline node', () => {
    const state = createState();

    processAndApply(state, {
      type: 'task.start',
      taskId: 'task_child',
      taskName: 'Parallel child task',
      subAgentKey: 'subagent_1',
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'task.complete',
      taskId: 'task_child',
      subAgentKey: 'subagent_1',
      timestamp: 160,
    }, 'live', true);

    expect(state.taskItemsById.get('task_child')).toMatchObject({
      taskId: 'task_child',
      subAgentKey: 'subagent_1',
      status: 'completed',
    });
    expect(state.timelineNodes.has('agent_group_task_group_task_child')).toBe(false);
  });

  it('auto-assigns visible nodes to the only running task when events omit taskId', () => {
    const state = createState();

    processAndApply(state, {
      type: 'task.start',
      taskId: 'task_1',
      taskName: 'Single running task',
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'reasoning.delta',
      reasoningId: 'reasoning_1',
      delta: 'thinking',
      timestamp: 120,
    }, 'live', true);

    expect(state.timelineNodes.get('thinking_0')).toMatchObject({
      taskId: 'task_1',
      taskName: 'Single running task',
      taskGroupId: 'task_group_task_1',
      subAgentKey: '',
    });
  });

  it('does not guess task ownership when multiple tasks are running in parallel', () => {
    const state = createState();

    processAndApply(state, {
      type: 'task.start',
      taskId: 'task_1',
      taskName: 'Parallel task A',
      timestamp: 100,
    }, 'live', true);
    processAndApply(state, {
      type: 'task.start',
      taskId: 'task_2',
      taskName: 'Parallel task B',
      timestamp: 120,
    }, 'live', true);
    processAndApply(state, {
      type: 'content.delta',
      contentId: 'content_1',
      delta: 'unassigned',
      timestamp: 140,
    }, 'live', true);

    expect(state.timelineNodes.get('content_0')).toMatchObject({
      taskId: undefined,
      taskName: undefined,
      taskGroupId: undefined,
    });
    expect(state.taskItemsById.get('task_2')?.taskGroupId).toBe('task_group_task_1');
  });
});
