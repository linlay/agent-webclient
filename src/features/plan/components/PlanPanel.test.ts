import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import type { PlanRuntime, TaskItemMeta } from "@/app/state/types";
import { buildPlanSummaryView, PlanPanel } from "@/features/plan/components/PlanPanel";

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

const { useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe('buildPlanSummaryView', () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it('shows in-progress count based on latest started task position', () => {
    const runtimeByTaskId = new Map<string, PlanRuntime>([
      ['task_1', { status: 'completed', updatedAt: 1, error: '' }],
      ['task_2', { status: 'running', updatedAt: 2, error: '' }],
    ]);

    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [
        { taskId: 'task_1', description: 'A' },
        { taskId: 'task_2', description: 'B' },
        { taskId: 'task_3', description: 'C' },
        { taskId: 'task_4', description: 'D' },
      ],
    }, runtimeByTaskId);

    expect(summary.progressText).toBe('2/4');
    expect(summary.statusText).toBe('进行中');
    expect(summary.titleText).toBe('任务列表');
  });

  it('shows completed once all tasks are done', () => {
    const runtimeByTaskId = new Map<string, PlanRuntime>([
      ['task_1', { status: 'completed', updatedAt: 1, error: '' }],
      ['task_2', { status: 'completed', updatedAt: 2, error: '' }],
      ['task_3', { status: 'completed', updatedAt: 3, error: '' }],
      ['task_4', { status: 'completed', updatedAt: 4, error: '' }],
    ]);

    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [
        { taskId: 'task_1', description: 'A' },
        { taskId: 'task_2', description: 'B' },
        { taskId: 'task_3', description: 'C' },
        { taskId: 'task_4', description: 'D' },
      ],
    }, runtimeByTaskId);

    expect(summary.progressText).toBe('4/4');
    expect(summary.statusText).toBe('已完成');
  });

  it('keeps the plan title and plan items sourced from the plan definition when task metadata is present', () => {
    const taskItemsById = new Map<string, TaskItemMeta>([
      ['task_1', {
        taskId: 'task_1',
        taskName: 'Agent task name',
        taskGroupId: 'group_parallel',
        runId: 'run_1',
        status: 'completed',
        updatedAt: 1,
        error: '',
      }],
    ]);
    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [{ taskId: 'task_1', description: 'Plan task name' }],
    }, new Map<string, PlanRuntime>(), taskItemsById);

    expect(summary.titleText).toBe('任务列表');
    expect(summary.normalizedTasks).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        description: 'Plan task name',
      }),
    ]);
  });

  it('shows final duration text when task metadata has durationMs', () => {
    const taskItemsById = new Map<string, TaskItemMeta>([
      ['task_1', {
        taskId: 'task_1',
        taskName: 'Task A',
        taskGroupId: 'task_group_task_1',
        runId: 'run_1',
        status: 'completed',
        startedAt: 100,
        endedAt: 5_100,
        durationMs: 5_000,
        updatedAt: 5_100,
        error: '',
      }],
    ]);

    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [{ taskId: 'task_1', description: 'Task A' }],
    }, new Map<string, PlanRuntime>([
      ['task_1', { status: 'completed', updatedAt: 5_100, error: '' }],
    ]), taskItemsById, 8_000);

    expect(summary.normalizedTasks).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        durationText: '5.0秒',
      }),
    ]);
  });

  it('shows live duration text for a running task with startedAt', () => {
    const taskItemsById = new Map<string, TaskItemMeta>([
      ['task_1', {
        taskId: 'task_1',
        taskName: 'Task A',
        taskGroupId: 'task_group_task_1',
        runId: 'run_1',
        status: 'running',
        startedAt: 5_000,
        endedAt: undefined,
        durationMs: undefined,
        updatedAt: 5_000,
        error: '',
      }],
    ]);

    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [{ taskId: 'task_1', description: 'Task A' }],
    }, new Map<string, PlanRuntime>([
      ['task_1', { status: 'running', updatedAt: 5_000, error: '' }],
    ]), taskItemsById, 8_200);

    expect(summary.normalizedTasks).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        durationText: '3.2秒',
      }),
    ]);
  });

  it('omits duration text when task timing metadata is unavailable', () => {
    const taskItemsById = new Map<string, TaskItemMeta>([
      ['task_1', {
        taskId: 'task_1',
        taskName: 'Task A',
        taskGroupId: 'task_group_task_1',
        runId: 'run_1',
        status: 'pending',
        updatedAt: 1,
        error: '',
      }],
    ]);

    const summary = buildPlanSummaryView({
      planId: 'plan_main',
      plan: [{ taskId: 'task_1', description: 'Task A' }],
    }, new Map<string, PlanRuntime>(), taskItemsById, 10_000);

    expect(summary.normalizedTasks).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        durationText: '',
      }),
    ]);
  });

  it('renders plan panel items from plan descriptions instead of agent group task names', () => {
    const state = createInitialState();
    useAppState.mockReturnValue({
      ...state,
      plan: {
        planId: 'plan_main',
        plan: [
          { taskId: 'task_1', description: 'Ordinary task A' },
          { taskId: 'task_2', description: 'Ordinary task B' },
        ],
      },
      planRuntimeByTaskId: new Map<string, PlanRuntime>([
        ['task_1', { status: 'completed', updatedAt: 1, error: '' }],
        ['task_2', { status: 'running', updatedAt: 2, error: '' }],
      ]),
      taskItemsById: new Map<string, TaskItemMeta>([
        ['task_1', {
          taskId: 'task_1',
          taskName: 'Parallel agent task A',
          taskGroupId: 'group_parallel',
          runId: 'run_1',
          status: 'completed',
          durationMs: 90_000,
          updatedAt: 1,
          error: '',
        }],
        ['task_2', {
          taskId: 'task_2',
          taskName: 'Parallel agent task B',
          taskGroupId: 'group_parallel',
          runId: 'run_1',
          status: 'running',
          startedAt: Date.now() - 3_000,
          updatedAt: 2,
          error: '',
        }],
      ]),
    });

    const html = renderToStaticMarkup(React.createElement(PlanPanel));

    expect(html).toContain('>任务列表<');
    expect(html).toContain('Ordinary task A');
    expect(html).toContain('Ordinary task B');
    expect(html).toContain('1分30秒');
    expect(html).not.toContain('>PLAN<');
    expect(html).not.toContain('Parallel agent task A');
    expect(html).not.toContain('Parallel agent task B');
  });
});
