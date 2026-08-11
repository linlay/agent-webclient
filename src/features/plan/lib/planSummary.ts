import type { Plan, PlanRuntime, TaskItemMeta } from "@/app/state/types";
import { readEpochMillis } from "@/shared/utils/platformTime";
import type { TranslateParams } from "@/shared/i18n/types";

function normalizePlanStatus(status?: string): string {
	const value = String(status || "pending")
		.trim()
		.toLowerCase();
	if (["completed", "done", "success", "ok"].includes(value)) {
		return "completed";
	}
	if (["running", "in_progress", "working", "doing"].includes(value)) {
		return "running";
	}
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

function formatTaskDuration(
	durationMs: number | undefined,
	t: (key: string, params?: TranslateParams) => string,
): string {
	if (!Number.isFinite(durationMs) || Number(durationMs) < 0) {
		return "";
	}

	const value = Number(durationMs);
	if (value < 1000) {
		return t("plan.summary.duration.ms", { count: String(Math.round(value)) });
	}
	if (value < 60_000) {
		return t("plan.summary.duration.seconds", { count: (value / 1000).toFixed(value >= 10_000 ? 0 : 1) });
	}

	const totalSeconds = Math.round(value / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) {
		return t("plan.summary.duration.minSec", { m: String(minutes), s: String(seconds) });
	}

	const hours = Math.floor(minutes / 60);
	const remainMinutes = minutes % 60;
	return t("plan.summary.duration.hourMin", { h: String(hours), m: String(remainMinutes) });
}

export function buildPlanSummaryView(
	plan: Plan | null,
	planRuntimeByTaskId: Map<string, PlanRuntime>,
	taskItemsById: Map<string, TaskItemMeta> | undefined,
	t: (key: string, params?: TranslateParams) => string,
	now = Date.now(),
	isConversationActive: boolean = true,
): PlanSummaryView {
	const tasks = plan?.plan || [];
	const normalizedTasks = tasks.map((task) => {
		const runtime = planRuntimeByTaskId.get(task.taskId);
		const taskMeta = taskItemsById?.get(task.taskId);
		let status = normalizePlanStatus(runtime?.status || task.status);
		if (!isConversationActive && status === "running") {
			status = "pending";
		}
		const startedAt = readEpochMillis(taskMeta?.startedAt);
		const durationMs = Number.isFinite(taskMeta?.durationMs)
			? taskMeta?.durationMs
      : status === "running" && startedAt !== undefined
				? Math.max(0, now - startedAt)
				: undefined;
		return {
			taskId: task.taskId,
			description: task.description,
			status,
			durationText: formatTaskDuration(durationMs, t),
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

	let statusText = t("plan.summary.status.pending");
	let statusTone: PlanSummaryView["statusTone"] = "muted";
	if (totalTasks > 0 && completedTasks === totalTasks) {
		statusText = t("plan.summary.status.completed");
		statusTone = "accent";
	} else if (hasFailed) {
		statusText = t("plan.summary.status.failed");
		statusTone = "danger";
	} else if (hasRunning) {
		statusText = t("plan.summary.status.running");
		statusTone = "accent";
	} else if (hasCanceled) {
		statusText = t("plan.summary.status.canceled");
		statusTone = "default";
	} else if (currentCount > 0) {
		statusText = t("plan.summary.status.running");
		statusTone = "accent";
	}

	return {
		normalizedTasks,
		totalTasks,
		currentCount,
		progressText: `${currentCount}/${totalTasks}`,
		statusText,
		statusTone,
		titleText: t("plan.summary.titleText"),
	};
}

export function hasRunningPlanTask(
	planRuntimeByTaskId: Map<string, PlanRuntime>,
): boolean {
	return Array.from(planRuntimeByTaskId.values()).some(
		(runtime) => normalizePlanStatus(runtime.status) === "running",
	);
}
