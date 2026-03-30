import type { TimelineNode } from "../../context/types";
import {
	buildToolPillRecords,
	canExpandToolPill,
	formatToolArgumentsInline,
	formatToolPillTitle,
	getExpandableToolPillRecords,
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
				statusLabel: "等待中",
				hasDetails: false,
				description: "",
				argsText: "",
				argsInlineText: "",
				result: null,
			},
		]);
		expect(canExpandToolPill(node)).toBe(false);
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
				hasDetails: true,
				description: "",
				argsText: "echo 1",
				argsInlineText: "echo 1",
				result: { text: "1", isCode: false },
			},
			{
				key: "tool_2",
				title: "第 2 次",
				status: "failed",
				statusLabel: "失败",
				hasDetails: true,
				description: "在沙箱容器中执行命令。",
				argsText: "exit 1",
				argsInlineText: "exit 1",
				result: { text: "boom", isCode: false },
			},
		]);
		expect(canExpandToolPill(group)).toBe(true);
	});

	it("does not allow description alone to make a single tool expandable", () => {
		const node = createToolNode({
			id: "tool_1",
			kind: "tool",
			ts: 100,
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
			description: "在沙箱容器中执行命令。",
		});

		expect(buildToolPillRecords(node)).toEqual([
			{
				key: "tool_1",
				title: "第 1 次",
				status: "pending",
				statusLabel: "等待中",
				hasDetails: false,
				description: "",
				argsText: "",
				argsInlineText: "",
				result: null,
			},
		]);
		expect(canExpandToolPill(node)).toBe(false);
	});

	it("allows args or result to make a tool expandable and keeps description as a supplement", () => {
		const argsNode = createToolNode({
			id: "tool_1",
			kind: "tool",
			ts: 100,
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
			description: "在沙箱容器中执行命令。",
			argsText: "echo 1",
		});
		const resultNode = createToolNode({
			id: "tool_2",
			kind: "tool",
			ts: 110,
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
			description: "在沙箱容器中执行命令。",
			result: { text: "1", isCode: false },
		});

		expect(buildToolPillRecords(argsNode)[0]).toMatchObject({
			hasDetails: true,
			description: "在沙箱容器中执行命令。",
			argsText: "echo 1",
			argsInlineText: "echo 1",
		});
		expect(buildToolPillRecords(resultNode)[0]).toMatchObject({
			hasDetails: true,
			description: "在沙箱容器中执行命令。",
			result: { text: "1", isCode: false },
		});
		expect(canExpandToolPill(argsNode)).toBe(true);
		expect(canExpandToolPill(resultNode)).toBe(true);
	});

	it("keeps grouped pills collapsed when all records only have description", () => {
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
					description: "first only description",
				}),
				createToolNode({
					id: "tool_2",
					kind: "tool",
					ts: 110,
					description: "second only description",
				}),
			],
		};

		expect(canExpandToolPill(group)).toBe(false);
		expect(getExpandableToolPillRecords(buildToolPillRecords(group))).toEqual([]);
	});

	it("shows only grouped records that actually have args or result", () => {
		const group = {
			kind: "tool-group" as const,
			key: "tool_group_tool_1",
			toolName: "_sandbox_bash_",
			toolLabel: "执行命令",
			count: 3,
			nodes: [
				createToolNode({
					id: "tool_1",
					kind: "tool",
					ts: 100,
					description: "first only description",
				}),
				createToolNode({
					id: "tool_2",
					kind: "tool",
					ts: 110,
					description: "second with args",
					argsText: "echo 2",
				}),
				createToolNode({
					id: "tool_3",
					kind: "tool",
					ts: 120,
					description: "third with result",
					result: { text: "3", isCode: false },
				}),
			],
		};

		expect(formatToolPillTitle(group)).toBe("执行命令 x3");
		expect(getExpandableToolPillRecords(buildToolPillRecords(group))).toEqual([
			expect.objectContaining({
				key: "tool_2",
				title: "第 2 次",
				hasDetails: true,
				description: "second with args",
			}),
			expect.objectContaining({
				key: "tool_3",
				title: "第 3 次",
				hasDetails: true,
				description: "third with result",
			}),
		]);
		expect(canExpandToolPill(group)).toBe(true);
	});

	it("compacts arguments into a single line for display when possible", () => {
		expect(formatToolArgumentsInline('{\n  "cmd": "echo 1",\n  "timeout": 3\n}')).toBe(
			'{"cmd":"echo 1","timeout":3}',
		);
		expect(formatToolArgumentsInline("line 1\n  line 2")).toBe("line 1 line 2");
	});
});
