import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import type { TaskGroupMeta, TaskItemMeta, TimelineNode } from "@/app/state/types";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => null,
}));

jest.mock("@/features/timeline/components/TimelineRow", () => ({
  TimelineRow: (props: { node?: { text?: string; id?: string }; toolGroup?: { key?: string } }) =>
    React.createElement(
      "div",
      {
        "data-testid": "timeline-row",
        "data-node-id": props.node?.id || "",
        "data-tool-key": props.toolGroup?.key || "",
      },
      props.node?.text || "timeline-row",
    ),
  formatTimelineTime: () => ({ short: "", full: "" }),
}));

jest.mock("@/features/timeline/components/TaskGroupSection", () => ({
  TaskGroupSection: (props: { group: { title: string } }) =>
    React.createElement(
      "section",
      { className: "timeline-task-group" },
      React.createElement(
        "button",
        { type: "button", className: "timeline-task-group-header", "aria-expanded": false },
        props.group.title,
      ),
      React.createElement("div", { className: "timeline-task-group-body" }, props.group.title),
    ),
}));

jest.mock("@/features/timeline/components/AgentGroupCard", () => ({
  AgentGroupCard: () => React.createElement("section", { className: "agent-group-card" }, "Running 1 agents"),
}));

const { useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

function createTimelineMap(nodes: TimelineNode[]): Map<string, TimelineNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

describe("ConversationStage", () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppDispatch.mockReturnValue(jest.fn());
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("does not render task group UI for ordinary main-agent tasks", () => {
    const state = createInitialState();
    const nodes: TimelineNode[] = [
      { id: "user_1", kind: "message", role: "user", text: "hi", ts: 100 },
      {
        id: "content_1",
        kind: "content",
        text: "answer",
        taskId: "task_1",
        taskName: "Main agent task",
        taskGroupId: "group_1",
        subAgentKey: "",
        ts: 130,
      },
    ];
    const taskItemsById = new Map<string, TaskItemMeta>([
      ["task_1", {
        taskId: "task_1",
        taskName: "Main agent task",
        taskGroupId: "group_1",
        subAgentKey: "",
        runId: "run_1",
        status: "completed",
        startedAt: 110,
        endedAt: 180,
        durationMs: 70,
        updatedAt: 180,
        error: "",
      }],
    ]);
    const taskGroupsById = new Map<string, TaskGroupMeta>([
      ["group_1", {
        groupId: "group_1",
        runId: "run_1",
        title: "Main agent task",
        status: "completed",
        startedAt: 110,
        endedAt: 180,
        durationMs: 70,
        updatedAt: 180,
        childTaskIds: ["task_1"],
      }],
    ]);

    useAppState.mockReturnValue({
      ...state,
      events: [
        { type: "request.query", timestamp: 100 },
        { type: "run.complete", timestamp: 200 },
      ],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
      taskItemsById,
      taskGroupsById,
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("answer");
    expect(html).not.toContain("Running 1 agents");
    expect(html).not.toContain("timeline-task-group-header");
    expect(html).not.toContain("timeline-task-group-body");
  });

  it("renders task group UI for sub-agent tasks", () => {
    const state = createInitialState();
    const nodes: TimelineNode[] = [
      { id: "user_1", kind: "message", role: "user", text: "hi", ts: 100 },
      {
        id: "content_1",
        kind: "content",
        text: "child answer",
        taskId: "task_1",
        taskName: "Sub agent task",
        taskGroupId: "group_1",
        subAgentKey: "subagent_1",
        ts: 130,
      },
    ];
    const taskItemsById = new Map<string, TaskItemMeta>([
      ["task_1", {
        taskId: "task_1",
        taskName: "Sub agent task",
        taskGroupId: "group_1",
        subAgentKey: "subagent_1",
        runId: "run_1",
        status: "completed",
        startedAt: 110,
        endedAt: 180,
        durationMs: 70,
        updatedAt: 180,
        error: "",
      }],
    ]);
    const taskGroupsById = new Map<string, TaskGroupMeta>([
      ["group_1", {
        groupId: "group_1",
        runId: "run_1",
        title: "Sub agent task",
        status: "completed",
        startedAt: 110,
        endedAt: 180,
        durationMs: 70,
        updatedAt: 180,
        childTaskIds: ["task_1"],
      }],
    ]);

    useAppState.mockReturnValue({
      ...state,
      events: [
        { type: "request.query", timestamp: 100 },
        { type: "run.complete", timestamp: 200 },
      ],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
      taskItemsById,
      taskGroupsById,
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("timeline-task-group-header");
    expect(html).toContain("Sub agent task");
    expect(html).not.toContain("Running 1 agents");
  });
});
