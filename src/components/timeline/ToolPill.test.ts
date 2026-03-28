import type { TimelineNode } from "../../context/types";
import {
	buildToolPillRecords,
	formatToolPillTitle,
} from "./ToolPill";

function createToolNode(
	partial: Partial<TimelineNode> & Pick<TimelineNode, "id" | "kind" | "ts">,
): TimelineNode {
	return {
		...partial,
	} as TimelineNode;
}

describe("ToolPill helpers", () => {
	it("keeps the original label for a single tool node", () => {
		const node = createToolNode({
			id: "tool_1",
			kind: "tool",
			ts: 100,
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
		});

		expect(formatToolPillTitle(node)).toBe("执行命令");
		expect(buildToolPillRecords(node)).toEqual([
			{
				key: "tool_1",
				title: "第 1 次",
				status: "pending",
				statusLabel: "pending",
				description: "",
				argsText: "",
				result: null,
			},
		]);
	});

	it("formats grouped tools with xN and keeps every record in order", () => {
		const group = {
			kind: "tool-group" as const,
			key: "tool_group_tool_1",
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
			count: 2,
			nodes: [
				createToolNode({
					id: "tool_1",
					kind: "tool",
					ts: 100,
					toolName: "_sandbox_bash_",
					toolLabel: "执行命令",
					status: "completed",
					argsText: "echo 1",
					result: { text: "1", isCode: false },
				}),
				createToolNode({
					id: "tool_2",
					kind: "tool",
					ts: 110,
					toolName: "_sandbox_bash_",
					toolLabel: "执行命令",
					status: "failed",
					description: "在沙箱容器中执行命令。",
					argsText: "exit 1",
					result: { text: "boom", isCode: false },
				}),
			],
		};

		expect(formatToolPillTitle(group)).toBe("执行命令 x2");
		expect(buildToolPillRecords(group)).toEqual([
			{
				key: "tool_1",
				title: "第 1 次",
				status: "completed",
				statusLabel: "完成",
				description: "",
				argsText: "echo 1",
				result: { text: "1", isCode: false },
			},
			{
				key: "tool_2",
				title: "第 2 次",
				status: "failed",
				statusLabel: "失败",
				description: "在沙箱容器中执行命令。",
				argsText: "exit 1",
				result: { text: "boom", isCode: false },
			},
		]);
	});
});
