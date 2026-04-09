import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import type { Plan, PlanRuntime } from "../../context/types";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiTag } from "../ui/UiTag";
import { Flex } from "antd";

function normalizePlanStatus(status?: string): string {
  const value = String(status || "pending")
    .trim()
    .toLowerCase();
  if (["completed", "done", "success", "ok"].includes(value))
    return "completed";
  if (["running", "in_progress", "working", "doing"].includes(value))
    return "running";
  if (["failed", "error"].includes(value)) return "failed";
  if (["canceled", "cancelled"].includes(value)) return "canceled";
  return "pending";
}

export interface PlanSummaryView {
  normalizedTasks: Array<{
    taskId: string;
    description?: string;
    status: string;
  }>;
  totalTasks: number;
  currentCount: number;
  progressText: string;
  statusText: string;
  statusTone: "default" | "accent" | "muted" | "danger";
  titleText: string;
}

export function buildPlanSummaryView(
  plan: Plan | null,
  planRuntimeByTaskId: Map<string, PlanRuntime>,
): PlanSummaryView {
  const tasks = plan?.plan || [];
  const normalizedTasks = tasks.map((task) => {
    const runtime = planRuntimeByTaskId.get(task.taskId);
    return {
      taskId: task.taskId,
      description: task.description,
      status: normalizePlanStatus(runtime?.status || task.status),
    };
  });
  const totalTasks = normalizedTasks.length;
  const currentCount = normalizedTasks.reduce((maxIndex, task, index) => {
    return task.status === "pending" ? maxIndex : index + 1;
  }, 0);
  const completedTasks = normalizedTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const hasFailed = normalizedTasks.some((task) => task.status === "failed");
  const hasRunning = normalizedTasks.some((task) => task.status === "running");
  const hasCanceled = normalizedTasks.some(
    (task) => task.status === "canceled",
  );

  let statusText = "待开始";
  let statusTone: PlanSummaryView["statusTone"] = "muted";
  if (totalTasks > 0 && completedTasks === totalTasks) {
    statusText = "已完成";
    statusTone = "accent";
  } else if (hasFailed) {
    statusText = "失败";
    statusTone = "danger";
  } else if (hasRunning) {
    statusText = "进行中";
    statusTone = "accent";
  } else if (hasCanceled) {
    statusText = "已取消";
    statusTone = "default";
  } else if (currentCount > 0) {
    statusText = "进行中";
    statusTone = "accent";
  }

  return {
    normalizedTasks,
    totalTasks,
    currentCount,
    progressText: `${currentCount}/${totalTasks}`,
    statusText,
    statusTone,
    titleText: "PLAN",
  };
}

export const PlanPanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (!state.plan) return null;

  const planListId = `floating-plan-list-${String(state.plan.planId || "plan").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const summary = useMemo(
    () => buildPlanSummaryView(state.plan, state.planRuntimeByTaskId),
    [state.plan, state.planRuntimeByTaskId],
  );

  return (
    <div
      className={`floating-plan ${state.planExpanded ? "is-expanded" : ""}`}
      id="floating-plan"
    >
      <UiButton
        className="plan-header"
        variant="ghost"
        size="sm"
        aria-expanded={state.planExpanded}
        aria-controls={planListId}
        onClick={() => {
          if (state.planAutoCollapseTimer) {
            window.clearTimeout(state.planAutoCollapseTimer);
            dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
          }
          dispatch({
            type: "SET_PLAN_EXPANDED",
            expanded: !state.planExpanded,
          });
          dispatch({
            type: "SET_PLAN_MANUAL_OVERRIDE",
            override: !state.planExpanded,
          });
        }}
      >
				<Flex align="center" gap={10}>
					<span className="plan-title">{summary.titleText}</span>
					<UiTag className="plan-summary-status" tone="accent">
						{summary.progressText}
					</UiTag>
					<span className="plan-header-badges" aria-hidden="true">
						{summary.normalizedTasks.map((task) => (
							<span
								key={task.taskId}
								className="tool-status-dot"
								data-tool-status={task.status}
							/>
						))}
					</span>
					<span className="plan-chevron" aria-hidden="true">
						<MaterialIcon
							name={
								state.planExpanded ? "keyboard_arrow_down" : "keyboard_arrow_up"
							}
						/>
					</span>
				</Flex>
      </UiButton>

      <ul className="plan-list" id={planListId}>
        {summary.normalizedTasks.map((task) => {
          return (
            <li
              key={task.taskId}
              className="plan-item"
            >
							<span
								className="tool-status-dot"
								data-tool-status={task.status}
							/>
              <span className="plan-item-text">
                {task.description || task.taskId}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
