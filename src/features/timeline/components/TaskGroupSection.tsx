import React from "react";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { TimelineRow } from "@/features/timeline/components/TimelineRow";
import type {
	TaskGroupDisplayItem,
	TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";

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

function renderTaskEntries(entries: TimelineRenderEntry[]): React.ReactNode {
	return entries.map((entry) =>
		entry.kind === "node" ? (
			<TimelineRow key={entry.key} node={entry.node} />
		) : (
			<TimelineRow key={entry.key} toolGroup={entry} />
		),
	);
}

interface TaskGroupSectionProps {
	group: TaskGroupDisplayItem;
	initialExpanded?: boolean;
}

export const TaskGroupSection: React.FC<TaskGroupSectionProps> = ({
	group,
	initialExpanded = false,
}) => {
	const [expanded, setExpanded] = React.useState(initialExpanded);
	const duration = formatTaskDuration(group.durationMs);

	return (
		<section
			className={`timeline-task-group is-${group.status} ${expanded ? "is-expanded" : "is-collapsed"}`.trim()}
			data-task-group-id={group.groupId}
		>
			<button
				type="button"
				className="timeline-task-group-header"
				aria-expanded={expanded}
				onClick={() => setExpanded((current) => !current)}
			>
				<span className="timeline-task-group-header-copy">
					<span className="timeline-task-group-title">{group.title}</span>
				</span>
				<span className="timeline-task-group-header-meta">
					{duration ? (
						<span className="timeline-task-group-duration">{duration}</span>
					) : null}
					<span className="timeline-task-group-chevron" aria-hidden="true">
						<MaterialIcon
							name={expanded ? "keyboard_arrow_down" : "keyboard_arrow_right"}
						/>
					</span>
				</span>
			</button>

			{expanded ? (
				<div className="timeline-task-group-body">
					{group.childTasks.length > 1 ? (
						<div className="timeline-task-summary-list">
							{group.childTasks.map((task) => {
								const taskDuration = formatTaskDuration(task.durationMs);
								return (
									<div
										key={task.taskId}
										className="timeline-task-summary-item"
										data-task-id={task.taskId}
									>
										<span className="timeline-task-card-title-row">
											<span
												className="timeline-task-card-status-dot"
												data-task-status={task.status}
												aria-hidden="true"
											/>
											<span className="timeline-task-card-title">
												{task.taskName}
											</span>
										</span>
										<span className="timeline-task-summary-copy">
											{task.latestSummary ? (
												<span className="timeline-task-card-summary">
													{task.latestSummary}
												</span>
											) : null}
											{taskDuration ? (
												<span className="timeline-task-card-duration">
													{taskDuration}
												</span>
											) : null}
										</span>
									</div>
								);
							})}
						</div>
					) : null}
					{group.renderEntries.length > 0 ? (
						<div className="timeline-task-group-entries">
							{renderTaskEntries(group.renderEntries)}
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
};
