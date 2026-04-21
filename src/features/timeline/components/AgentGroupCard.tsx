import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface AgentGroupCardProps {
	groupId: string;
}

function summarizeStatus(statuses: string[]): "running" | "completed" | "failed" | "canceled" {
	if (statuses.some((status) => status === "running")) return "running";
	if (statuses.some((status) => status === "failed")) return "failed";
	if (statuses.some((status) => status === "canceled")) return "canceled";
	return "completed";
}

export const AgentGroupCard: React.FC<AgentGroupCardProps> = ({ groupId }) => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const group = state.agentGroupsByGroupId.get(groupId);
	const node = state.timelineNodes.get(`agent_group_${groupId}`);

	if (!group || !node || node.kind !== "agent-group") {
		return null;
	}

	const taskRows = group.taskIds.map((taskId) => state.taskItemsById.get(taskId)).filter(Boolean);
	const completedCount = taskRows.filter((task) => task?.status === "completed").length;
	const status = summarizeStatus(taskRows.map((task) => String(task?.status || "")));
	const iconName =
		status === "running"
			? "progress_activity"
			: status === "failed"
				? "error"
				: status === "canceled"
					? "stop_circle"
					: "check_circle";

	return (
		<section className={`timeline-task-group is-${status} ${node.expanded ? "is-expanded" : "is-collapsed"}`.trim()}>
			<button
				type="button"
				className="timeline-task-group-header"
				aria-expanded={node.expanded}
				onClick={() => dispatch({ type: "TOGGLE_AGENT_GROUP_EXPANDED", groupId })}
			>
				<span className="timeline-task-group-header-copy">
					<span className="timeline-task-group-title">
						<MaterialIcon name={iconName} /> Running {group.taskIds.length} agents
					</span>
				</span>
				<span className="timeline-task-group-header-meta">
					<span className="timeline-task-group-duration">{completedCount} completed</span>
					<span className="timeline-task-group-chevron" aria-hidden="true">
						<MaterialIcon name={node.expanded ? "keyboard_arrow_down" : "keyboard_arrow_right"} />
					</span>
				</span>
			</button>

			{node.expanded ? (
				<div className="timeline-task-group-body">
					<div className="timeline-task-summary-list">
						{taskRows.map((task) => {
							if (!task) return null;
							return (
								<button
									key={task.taskId}
									type="button"
									className="timeline-task-summary-item"
									data-task-id={task.taskId}
									onClick={() => {
										const target = document.querySelector(`[data-task-id="${task.taskId}"]`);
										if (target instanceof HTMLElement) {
											target.scrollIntoView({ behavior: "smooth", block: "center" });
										}
									}}
								>
									<span className="timeline-task-card-title-row">
										<span
											className="timeline-task-card-status-dot"
											data-task-status={task.status}
											aria-hidden="true"
										/>
										<span className="timeline-task-card-title">{task.taskName}</span>
									</span>
									<span className="timeline-task-summary-copy">{task.taskId}</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</section>
	);
};
