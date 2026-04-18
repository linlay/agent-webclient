import type { PlanRuntime } from '@/app/state/types';
import { buildPlanSummaryView } from '@/features/plan/components/PlanPanel';

describe('buildPlanSummaryView', () => {
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
});
