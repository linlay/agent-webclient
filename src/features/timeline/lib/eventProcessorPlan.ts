import type { AgentEvent, PlanItem } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import {
  buildNextAgentGroup,
  buildNextTaskGroup,
  buildNextTaskItem,
  readTaskGroupId,
  readTaskGroupTitle,
  resolveTaskGroupIdForStart,
} from "@/features/timeline/lib/eventProcessorShared";

export function processPlanEvent(
  event: AgentEvent,
  state: EventProcessorState,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if ((type === "plan.create" || type === "plan.update") && event.plan) {
    const nextPlanId = String(event.planId || "plan");
    commands.push({
      cmd: "SET_PLAN",
      plan: {
        planId: nextPlanId,
        plan: event.plan.map((item) => ({ ...item })) as PlanItem[],
      },
      resetRuntime: Boolean(
        state.getPlanId?.() && state.getPlanId?.() !== nextPlanId,
      ),
    });
    return commands;
  }

  if (type === "task.start") {
    const taskId = toText(event.taskId).trim();
    if (!taskId) return commands;
    const updatedAt = event.timestamp || Date.now();
    const existingTask = state.getTaskItem(taskId);
    const groupId = resolveTaskGroupIdForStart(event, state, existingTask);
    const nextTask = buildNextTaskItem({
      event,
      state,
      taskId,
      status: "running",
      updatedAt,
      existing: existingTask,
      groupId,
    });
    const nextGroup = buildNextTaskGroup({
      event,
      state,
      groupId,
      explicitTitle: readTaskGroupTitle(event),
      nextTask,
      existing: state.getTaskGroup(groupId),
    });
    commands.push({ cmd: "SET_TASK_ITEM_META", taskId, task: nextTask });
    commands.push({ cmd: "SET_TASK_GROUP_META", groupId, group: nextGroup });
    commands.push({ cmd: "ADD_ACTIVE_TASK_ID", taskId });
    const mainToolId = toText((event as Record<string, unknown>).mainToolId);
    if (groupId && nextTask.subAgentKey) {
      const agentGroup = buildNextAgentGroup({
        groupId,
        mainToolId,
        taskId,
        createdAt: updatedAt,
        existing: state.getAgentGroup?.(groupId),
      });
      const nodeId = `agent_group_${groupId}`;
      const existingNode = state.getTimelineNode(nodeId);
      if (!existingNode) {
        commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });
      }
      commands.push({
        cmd: "SET_AGENT_GROUP_ADD_TASK",
        groupId,
        group: agentGroup,
      });
      commands.push({
        cmd: "SET_TIMELINE_NODE",
        id: nodeId,
        node: {
          id: nodeId,
          kind: "agent-group",
          groupId,
          mainToolId,
          text:
            toText((event as Record<string, unknown>).description) ||
            nextTask.taskName,
          status: nextGroup.status,
          expanded: existingNode?.expanded ?? false,
          ts: existingNode?.ts || updatedAt,
        },
      });
    }
    commands.push({ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId });
    commands.push({ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId });
    commands.push({
      cmd: "SET_PLAN_RUNTIME",
      taskId,
      runtime: { status: "running", updatedAt, error: "" },
    });
    return commands;
  }

  if (type === "task.complete" || type === "task.fail" || type === "task.cancel") {
    const taskId = toText(event.taskId).trim();
    if (!taskId) return commands;
    const status =
      type === "task.complete"
        ? "completed"
        : type === "task.cancel"
          ? "canceled"
          : "failed";
    const updatedAt = event.timestamp || Date.now();
    const existingTask = state.getTaskItem(taskId);
    const groupId =
      readTaskGroupId(event) || existingTask?.taskGroupId || `task_group_${taskId}`;
    const nextTask = buildNextTaskItem({
      event,
      state,
      taskId,
      status,
      updatedAt,
      existing: existingTask,
      groupId,
    });
    const nextGroup = buildNextTaskGroup({
      event,
      state,
      groupId,
      explicitTitle: readTaskGroupTitle(event),
      nextTask,
      existing: state.getTaskGroup(groupId),
    });
    commands.push({ cmd: "SET_TASK_ITEM_META", taskId, task: nextTask });
    commands.push({ cmd: "SET_TASK_GROUP_META", groupId, group: nextGroup });
    commands.push({ cmd: "REMOVE_ACTIVE_TASK_ID", taskId });
    if (groupId && nextTask.subAgentKey) {
      const existingAgentGroup = state.getAgentGroup?.(groupId);
      const nodeId = `agent_group_${groupId}`;
      const existingNode = state.getTimelineNode(nodeId);
      if (existingAgentGroup && existingNode) {
        commands.push({
          cmd: "SET_TIMELINE_NODE",
          id: nodeId,
          node: {
            ...existingNode,
            kind: "agent-group",
            groupId,
            mainToolId:
              existingNode.mainToolId ||
              toText((event as Record<string, unknown>).mainToolId),
            status: nextGroup.status,
            ts: existingNode.ts || updatedAt,
          },
        });
      }
    }
    commands.push({
      cmd: "SET_PLAN_RUNTIME",
      taskId,
      runtime: {
        status,
        updatedAt,
        error: type === "task.fail" && event.error ? String(event.error) : "",
      },
    });
    commands.push({ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId });
    if (state.currentRunningPlanTaskId === taskId) {
      commands.push({ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId: "" });
    }
    return commands;
  }

  return commands;
}

