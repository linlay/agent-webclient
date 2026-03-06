import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { UiButton } from "../ui/UiButton";
import { UiTag } from "../ui/UiTag";

export const PlanPanel: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	if (!state.plan) return null;

	const tasks = state.plan.plan || [];
	const totalTasks = tasks.length;
	const completedTasks = tasks.filter((t) => t.status === "completed").length;
	const runningTask = tasks.find((t) => t.status === "running");

	const summaryText = runningTask
		? runningTask.description || "执行中..."
		: completedTasks === totalTasks
			? "所有任务已完成"
			: `${completedTasks}/${totalTasks} 完成`;

	return (
		<div
			className={`floating-plan ${state.planExpanded ? "is-expanded" : ""}`}
			id="floating-plan"
		>
			<UiButton
				className="plan-header"
				variant="ghost"
				size="sm"
				onClick={() => {
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
					PLAN
				</UiTag>
				<span className="plan-summary-text">{summaryText}</span>
				<UiTag className="plan-id-label" tone="muted">
					{state.plan.planId}
				</UiTag>
			</UiButton>

			<ul className="plan-list">
				{tasks.map((task) => {
					const runtime = state.planRuntimeByTaskId.get(task.taskId);
					const status = runtime?.status || task.status || "pending";

					return (
						<li
							key={task.taskId}
							className="plan-item"
							data-status={status}
						>
							<span className="plan-badge" />
							<span>{task.description || task.taskId}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
};
