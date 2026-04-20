import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskGroupSection } from "@/features/timeline/components/TaskGroupSection";
import type { TaskGroupDisplayItem } from "@/features/timeline/lib/timelineDisplay";

jest.mock("@/features/timeline/components/TimelineRow", () => ({
	TimelineRow: (props: { node?: { id?: string }; toolGroup?: { key?: string } }) =>
		React.createElement(
			"div",
			{
				"data-testid": "timeline-row",
				"data-node-id": props.node?.id || "",
				"data-tool-key": props.toolGroup?.key || "",
			},
			"timeline-row",
		),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
	MaterialIcon: (props: { name: string }) =>
		React.createElement("span", { "data-icon": props.name }),
}));

function createGroup(): TaskGroupDisplayItem {
	return {
		groupId: "group_parallel",
		title: "Running 3 tasks...",
		status: "running",
		startedAt: 100,
		endedAt: 160,
		durationMs: 60_000,
		nodes: [],
		renderEntries: [],
		childTasks: [
			{
				taskId: "task_1",
				taskName: "Explore agentOrchestrator definition",
				taskGroupId: "group_parallel",
				status: "completed",
				startedAt: 100,
				endedAt: 140,
				durationMs: 40_000,
				latestSummary: "Searching for 10 patterns, reading 10 files…",
				nodes: [],
				renderEntries: [],
			},
			{
				taskId: "task_2",
				taskName: "Explore _invoke_agent_ runtime orchestration",
				taskGroupId: "group_parallel",
				status: "running",
				startedAt: 110,
				endedAt: undefined,
				durationMs: 30_000,
				latestSummary: "Searching for 5 patterns, reading 8 files…",
				nodes: [],
				renderEntries: [],
			},
		],
	};
}

describe("TaskGroupSection", () => {
	it("renders collapsed by default and only shows group title and duration", () => {
		const html = renderToStaticMarkup(
			React.createElement(TaskGroupSection, {
				group: createGroup(),
			}),
		);

		expect(html).toContain("Running 3 tasks...");
		expect(html).toContain("1分0秒");
		expect(html).not.toContain("Explore agentOrchestrator definition");
		expect(html).toContain('aria-expanded="false"');
	});

	it("renders child task summaries when expanded", () => {
		const html = renderToStaticMarkup(
			React.createElement(TaskGroupSection, {
				group: createGroup(),
				initialExpanded: true,
			}),
		);

		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain("Explore agentOrchestrator definition");
		expect(html).toContain("Explore _invoke_agent_ runtime orchestration");
		expect(html).toContain("Searching for 10 patterns, reading 10 files…");
		expect(html).toContain("timeline-task-summary-list");
	});
});
