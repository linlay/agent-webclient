export interface TaskItemMeta {
  taskId: string;
  taskName: string;
  taskGroupId: string;
  subAgentKey?: string;
  runId: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  updatedAt: number;
  error: string;
}

export interface TasksState {
  taskItemsById: Map<string, TaskItemMeta>;
  activeTaskIds: Set<string>;
}

export type TasksAction =
  | { type: "SET_TASK_ITEM_META"; taskId: string; task: TaskItemMeta }
  | { type: "ADD_ACTIVE_TASK_ID"; taskId: string }
  | { type: "REMOVE_ACTIVE_TASK_ID"; taskId: string };

export function createInitialTasksState(): TasksState {
  return { taskItemsById: new Map(), activeTaskIds: new Set() };
}

export function reduceTasksState(state: TasksState, action: TasksAction): TasksState {
  switch (action.type) {
    case "SET_TASK_ITEM_META": return { ...state, taskItemsById: new Map(state.taskItemsById).set(action.taskId, action.task) };
    case "ADD_ACTIVE_TASK_ID": return { ...state, activeTaskIds: new Set(state.activeTaskIds).add(action.taskId) };
    case "REMOVE_ACTIVE_TASK_ID": { const next = new Set(state.activeTaskIds); next.delete(action.taskId); return { ...state, activeTaskIds: next }; }
  }
}
