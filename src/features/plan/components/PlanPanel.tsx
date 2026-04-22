import React, { useEffect, useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { Plan, PlanRuntime, TaskItemMeta } from "@/app/state/types";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
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
    durationText?: string;
  }>;
  totalTasks: number;
  currentCount: number;
  progressText: string;
  statusText: string;
  statusTone: "default" | "accent" | "muted" | "danger";
  titleText: string;
}

function formatTaskDuration(durationMs?: number): string {
  if (!Number.isFinite(durationMs) || Number(durationMs) < 0) {
    return "";
  }

  const value = Number(durationMs);
  if (value < 1000) {
    return `${Math.round(value)}毫秒`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}秒`;
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}分${seconds}秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}小时${remainMinutes}分`;
}

export function buildPlanSummaryView(
  plan: Plan | null,
  planRuntimeByTaskId: Map<string, PlanRuntime>,
  taskItemsById?: Map<string, TaskItemMeta>,
  now = Date.now(),
): PlanSummaryView {
  const tasks = plan?.plan || [];
  const normalizedTasks = tasks.map((task) => {
    const runtime = planRuntimeByTaskId.get(task.taskId);
    const taskMeta = taskItemsById?.get(task.taskId);
    const status = normalizePlanStatus(runtime?.status || task.status);
    const durationMs = Number.isFinite(taskMeta?.durationMs)
      ? taskMeta?.durationMs
      : status === "running" && Number.isFinite(taskMeta?.startedAt)
        ? Math.max(0, now - Number(taskMeta?.startedAt))
        : undefined;
    return {
      taskId: task.taskId,
      description: task.description,
      status,
      durationText: formatTaskDuration(durationMs),
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
    titleText: "任务列表",
  };
}

export const PlanPanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.plan) {
      return;
    }
    const hasRunningTask = Array.from(state.planRuntimeByTaskId.values()).some(
      (runtime) => normalizePlanStatus(runtime.status) === "running",
    );
    if (!hasRunningTask) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.plan, state.planRuntimeByTaskId]);

  if (!state.plan) return null;

  const planListId = `floating-plan-list-${String(state.plan.planId || "plan").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const summary = useMemo(
    () => buildPlanSummaryView(state.plan, state.planRuntimeByTaskId, state.taskItemsById, now),
    [state.plan, state.planRuntimeByTaskId, state.taskItemsById, now],
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
              data-status={task.status}
            >
							<span
								className="tool-status-dot"
								data-tool-status={task.status}
							/>
              <span className="plan-item-text">
                {task.description || task.taskId}
              </span>
              {task.durationText ? (
                <span className="plan-item-duration">{task.durationText}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
