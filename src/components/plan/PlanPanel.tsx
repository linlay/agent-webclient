import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiTag } from "../ui/UiTag";

function normalizePlanStatus(status?: string): string {
	const value = String(status || "pending").trim().toLowerCase();
	if (["completed", "done", "success", "ok"].includes(value)) return "completed";
	if (["running", "in_progress", "working", "doing"].includes(value)) return "running";
	if (["failed", "error"].includes(value)) return "failed";
	if (["canceled", "cancelled"].includes(value)) return "canceled";
	return "pending";
}

export const PlanPanel: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	if (!state.plan) return null;

	const tasks = state.plan.plan || [];
	const normalizedTasks = useMemo(() => {
		return tasks.map((task) => {
			const runtime = state.planRuntimeByTaskId.get(task.taskId);
			return {
				...task,
				status: normalizePlanStatus(runtime?.status || task.status),
			};
		});
	}, [state.planRuntimeByTaskId, tasks]);
	const totalTasks = normalizedTasks.length;
	const completedTasks = normalizedTasks.filter(
		(task) => task.status === "completed",
	).length;
	const runningTask =
		normalizedTasks.find((task) => task.taskId === state.planCurrentRunningTaskId) ||
		normalizedTasks.find((task) => task.status === "running");
	const lastTouchedTask = normalizedTasks.find(
		(task) => task.taskId === state.planLastTouchedTaskId,
	);
	const focusTask =
		runningTask ||
		lastTouchedTask ||
		normalizedTasks.find((task) => task.status === "failed") ||
		normalizedTasks.find((task) => task.status === "pending") ||
		normalizedTasks[normalizedTasks.length - 1];
	const summaryText = focusTask?.description || "No active plan";
	const summaryCount = `${Math.min(
		totalTasks,
		runningTask
			? normalizedTasks.findIndex((task) => task.taskId === runningTask.taskId) + 1
			: completedTasks || (totalTasks > 0 ? 1 : 0),
	)}/${totalTasks}`;

	return (
		<div className={`floating-plan ${state.planExpanded ? "is-expanded" : ""}`} id="floating-plan">
			<UiButton
				className="plan-header"
				variant="ghost"
				size="sm"
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
				<UiTag className="plan-summary-status" tone="accent">
					PLAN {summaryCount}
				</UiTag>
				<span className="plan-summary-text">{summaryText}</span>
				<UiTag className="plan-id-label" tone="muted">
					{state.plan.planId}
				</UiTag>
				<span className="plan-chevron" aria-hidden="true">
					<MaterialIcon
						name={state.planExpanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
					/>
				</span>
			</UiButton>

			<ul className="plan-list">
				{normalizedTasks.map((task) => {
					return (
						<li key={task.taskId} className="plan-item" data-status={task.status}>
							<span className="plan-badge" />
							<span className="plan-item-text">{task.description || task.taskId}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
};
