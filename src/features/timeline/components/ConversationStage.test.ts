import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import type { TaskItemMeta, TimelineNode } from "@/app/state/types";
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

  it("renders task group header and keeps task body collapsed by default", () => {
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
    useAppState.mockReturnValue({
      ...state,
      events: [
        { type: "request.query", timestamp: 100 },
        { type: "run.complete", timestamp: 200 },
      ],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
      taskItemsById,
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("timeline-task-group-header");
    expect(html).toContain("Main agent task");
    expect(html).toContain("已完成");
    expect(html).toContain("70毫秒");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).not.toContain("answer");
    expect(html).not.toContain("Running 1 agents");
    expect(html).not.toContain("timeline-task-group-body");
  });

  it("renders sub-agent task nodes as collapsed task groups", () => {
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
    useAppState.mockReturnValue({
      ...state,
      events: [
        { type: "request.query", timestamp: 100 },
        { type: "run.complete", timestamp: 200 },
      ],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
      taskItemsById,
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("timeline-task-group-header");
    expect(html).toContain("Sub agent task");
    expect(html).toContain("已完成");
    expect(html).not.toContain("child answer");
    expect(html).not.toContain("Running 1 agents");
  });
});
