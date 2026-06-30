import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import type {
  TaskItemMeta,
  TimelineNode,
  WorkerConversationRow,
  WorkerRow,
} from "@/app/state/types";
import {
  buildTimelineAgentOptions,
  ConversationStage,
  dispatchTimelineAgentSwitch,
  filterTimelineAgentOptions,
  shouldEnableQueryAnchors,
  TimelineAgentSwitcher,
} from "@/features/timeline/components/ConversationStage";

let mockCurrentWorker: {
  key: string;
  type: "agent" | "team";
  sourceId: string;
  displayName: string;
  role: string;
  raw: Record<string, unknown> | null;
  row: WorkerRow;
  relatedChats: WorkerConversationRow[];
} | null = null;

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => mockCurrentWorker,
}));

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: () => React.createElement("span", { className: "agent-icon" }, "agent-icon"),
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
  CustomEvent?: typeof CustomEvent;
  window?: {
    dispatchEvent: jest.Mock;
    location: {
      pathname: string;
      search: string;
    };
  };
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

function createTimelineMap(nodes: TimelineNode[]): Map<string, TimelineNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function createAgentWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  const sourceId = overrides.sourceId || "xiao-zhai";
  return {
    key: `agent:${sourceId}`,
    type: "agent",
    agentType: "agent",
    sourceId,
    displayName: "小宅",
    role: "生活助理",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: `${sourceId} 小宅 生活助理`,
    ...overrides,
  };
}

describe("ConversationStage", () => {
  const originalLocalStorage = globalWithStorage.localStorage;
  const originalWindow = globalWithStorage.window;
  const originalCustomEvent = globalWithStorage.CustomEvent;

  beforeEach(() => {
    mockCurrentWorker = null;
    globalWithStorage.window = {
      dispatchEvent: jest.fn(() => true),
      location: {
        pathname: "/",
        search: "?lang=zh-CN",
      },
    };
    globalWithStorage.CustomEvent = class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    } as typeof CustomEvent;
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppDispatch.mockReturnValue(jest.fn());
  });

  afterAll(() => {
    if (originalWindow) {
      globalWithStorage.window = originalWindow;
    } else {
      delete globalWithStorage.window;
    }
    if (originalCustomEvent) {
      globalWithStorage.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithStorage.CustomEvent;
    }
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("enables query anchors only when the scroll area is wide enough", () => {
    expect(shouldEnableQueryAnchors(959)).toBe(false);
    expect(shouldEnableQueryAnchors(960)).toBe(true);
    expect(shouldEnableQueryAnchors(998)).toBe(true);
  });

  it("renders one animated anchor line for each request query item", () => {
    const state = createInitialState();
    const nodes: TimelineNode[] = [
      { id: "user_1", kind: "message", role: "user", text: "hi", ts: 100 },
      {
        id: "content_1",
        kind: "content",
        role: "assistant",
        text: "answer",
        ts: 130,
      },
      { id: "user_2", kind: "message", role: "user", text: "next", ts: 200 },
      {
        id: "content_2",
        kind: "content",
        role: "assistant",
        text: "next answer",
        ts: 230,
      },
    ];
    useAppState.mockReturnValue({
      ...state,
      events: [
        { type: "request.query", timestamp: 100 },
        { type: "run.complete", timestamp: 180 },
        { type: "request.query", timestamp: 200 },
        { type: "run.complete", timestamp: 280 },
      ],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("timeline-query-anchor-rail");
    expect(html).toContain("timeline-query-anchor-row");
    expect(html).toContain("id=\"query-user_1\"");
    expect(html).toContain("data-query-anchor-id=\"query-user_1\"");
    expect(html).toContain("id=\"query-user_2\"");
    expect(html).toContain("data-query-anchor-id=\"query-user_2\"");
    expect(html).toContain("aria-label=\"定位到第 1 个提问\"");
    expect(html).toContain("aria-label=\"定位到第 2 个提问\"");
    expect(html.match(/timeline-query-anchor-row/g)).toHaveLength(2);
    expect(html.match(/class="timeline-query-anchor-line"/g)).toHaveLength(2);
    expect(html.match(/class="timeline-query-anchor-preview"/g)).toHaveLength(2);
    expect(html.match(/class="timeline-query-anchor-preview-query"/g)).toHaveLength(2);
    expect(html.match(/class="timeline-query-anchor-preview-content"/g)).toHaveLength(2);
    expect(html).toContain("hi");
    expect(html).toContain("answer");
    expect(html).toContain("next");
    expect(html).toContain("next answer");
    expect(html).not.toContain("timeline-query-anchor-lines");
    expect(html).not.toContain("query-content_1");
    expect(html).not.toContain("query-content_2");
  });

  it("does not render query anchors for non-query timeline nodes", () => {
    const state = createInitialState();
    const nodes: TimelineNode[] = [
      {
        id: "steer_1",
        kind: "message",
        role: "user",
        messageVariant: "steer",
        text: "/steer",
        ts: 100,
      },
      {
        id: "content_1",
        kind: "content",
        role: "assistant",
        text: "answer",
        ts: 130,
      },
      {
        id: "tool_1",
        kind: "tool",
        toolName: "read_file",
        toolLabel: "Read File",
        text: "tool",
        ts: 150,
      },
    ];
    useAppState.mockReturnValue({
      ...state,
      events: [],
      timelineNodes: createTimelineMap(nodes),
      timelineOrder: nodes.map((node) => node.id),
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).not.toContain("timeline-query-anchor-rail");
    expect(html).not.toContain("timeline-query-anchor-row");
    expect(html).not.toContain("timeline-query-anchor-line");
    expect(html).not.toContain("data-query-anchor-id");
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
      agents: [{ key: "subagent_1", name: "小智" }],
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
    expect(html).toContain("agent-icon");
    expect(html).toContain("小智");
    expect(html).toContain("Sub agent task");
    expect(html).toContain("已完成");
    expect(html).not.toContain("Running 1 agents");
  });

  it("can hide the empty-state prompt for compact shells", () => {
    const state = createInitialState();
    useAppState.mockReturnValue({
      ...state,
      timelineNodes: new Map(),
      timelineOrder: [],
    });

    const html = renderToStaticMarkup(
      React.createElement(ConversationStage, { showEmptyState: false }),
    );

    expect(html).toContain("timeline-stack");
    expect(html).not.toContain("timeline-empty");
    expect(html).not.toContain("今天有什么可以帮您");
  });

  it("renders the empty-state agent switch trigger with a subtle arrow", () => {
    const state = createInitialState();
    const currentRow = createAgentWorkerRow();
    const nextRow = createAgentWorkerRow({
      key: "agent:researcher",
      sourceId: "researcher",
      displayName: "小研",
      role: "研究员",
      searchText: "researcher 小研 研究员",
    });
    mockCurrentWorker = {
      key: currentRow.key,
      type: "agent",
      sourceId: currentRow.sourceId,
      displayName: currentRow.displayName,
      role: currentRow.role,
      raw: null,
      row: currentRow,
      relatedChats: [],
    };
    useAppState.mockReturnValue({
      ...state,
      agents: [
        { key: "xiao-zhai", name: "小宅", role: "生活助理" },
        { key: "researcher", name: "小研", role: "研究员" },
      ],
      workerRows: [currentRow, nextRow],
      workerIndexByKey: new Map([
        [currentRow.key, currentRow],
        [nextRow.key, nextRow],
      ]),
      workerSelectionKey: currentRow.key,
      timelineNodes: new Map(),
      timelineOrder: [],
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("timeline-empty");
    expect(html).toContain("timeline-agent-switcher-trigger");
    expect(html).toContain("小宅");
    expect(html).toContain("keyboard_arrow_down");
    expect(html).toContain("与 ");
    expect(html).toContain(" 对话");
  });

  it("falls back to the static empty-state copy when there is no alternate agent", () => {
    const state = createInitialState();
    const currentRow = createAgentWorkerRow();
    mockCurrentWorker = {
      key: currentRow.key,
      type: "agent",
      sourceId: currentRow.sourceId,
      displayName: currentRow.displayName,
      role: currentRow.role,
      raw: null,
      row: currentRow,
      relatedChats: [],
    };
    useAppState.mockReturnValue({
      ...state,
      agents: [{ key: "xiao-zhai", name: "小宅", role: "生活助理" }],
      workerRows: [currentRow],
      workerIndexByKey: new Map([[currentRow.key, currentRow]]),
      workerSelectionKey: currentRow.key,
      timelineNodes: new Map(),
      timelineOrder: [],
    });

    const html = renderToStaticMarkup(React.createElement(ConversationStage));

    expect(html).toContain("与 小宅 对话");
    expect(html).not.toContain("timeline-agent-switcher-trigger");
  });

  it("filters the agent switch menu by role and renders the empty result", () => {
    const currentRow = createAgentWorkerRow();
    const options = buildTimelineAgentOptions({
      agents: [
        { key: "xiao-zhai", name: "小宅", role: "生活助理" },
        { key: "researcher", name: "小研", role: "研究员" },
      ],
      workerRows: [
        currentRow,
        createAgentWorkerRow({
          key: "agent:researcher",
          sourceId: "researcher",
          displayName: "小研",
          role: "研究员",
          searchText: "researcher 小研 研究员",
        }),
      ],
      currentWorker: {
        key: currentRow.key,
        type: "agent",
        sourceId: currentRow.sourceId,
        displayName: currentRow.displayName,
        role: currentRow.role,
        raw: null,
        row: currentRow,
        relatedChats: [],
      },
    });

    expect(filterTimelineAgentOptions(options, "研究员").map((item) => item.key)).toEqual([
      "researcher",
    ]);

    const matchedHtml = renderToStaticMarkup(
      React.createElement(TimelineAgentSwitcher, {
        currentWorker: {
          key: currentRow.key,
          type: "agent",
          sourceId: currentRow.sourceId,
          displayName: currentRow.displayName,
          role: currentRow.role,
          raw: null,
          row: currentRow,
          relatedChats: [],
        },
        options,
        initialOpen: true,
        initialSearchText: "研究员",
      }),
    );
    expect(matchedHtml).toContain("timeline-agent-switcher-menu");
    expect(matchedHtml).toContain("小研");
    expect(matchedHtml).toContain("研究员");
    expect(matchedHtml).not.toContain("生活助理</span>");

    const emptyHtml = renderToStaticMarkup(
      React.createElement(TimelineAgentSwitcher, {
        currentWorker: {
          key: currentRow.key,
          type: "agent",
          sourceId: currentRow.sourceId,
          displayName: currentRow.displayName,
          role: currentRow.role,
          raw: null,
          row: currentRow,
          relatedChats: [],
        },
        options,
        initialOpen: true,
        initialSearchText: "不存在",
      }),
    );
    expect(emptyHtml).toContain("没有匹配的智能体");
  });

  it("sets hideRole true for coder and kbase agents in buildTimelineAgentOptions", () => {
    const currentRow = createAgentWorkerRow();
    // NB: agents in the fallback list need mode/type to signal coder/kbase.
    const options = buildTimelineAgentOptions({
      agents: [
        { key: "coder-1", name: "Coder", mode: "CODER" },
        { key: "kbase-1", name: "KB", mode: "KBASE" },
        { key: "normal", name: "Normal", role: "角色" },
      ],
      workerRows: [
        createAgentWorkerRow({
          key: "agent:coder-1",
          sourceId: "coder-1",
          displayName: "Coder",
          agentType: "coder",
          role: "不该显示",
          searchText: "coder-1 Coder",
        }),
        createAgentWorkerRow({
          key: "agent:kbase-1",
          sourceId: "kbase-1",
          displayName: "KB",
          agentType: "kbase",
          role: "不该显示",
          searchText: "kbase-1 KB",
        }),
        createAgentWorkerRow({
          key: "agent:normal",
          sourceId: "normal",
          displayName: "Normal",
          agentType: "agent",
          role: "角色",
          searchText: "normal Normal 角色",
        }),
      ],
      currentWorker: {
        key: currentRow.key,
        type: "agent",
        sourceId: currentRow.sourceId,
        displayName: currentRow.displayName,
        role: currentRow.role,
        raw: null,
        row: currentRow,
        relatedChats: [],
      },
    });

    const coderOption = options.find((o) => o.key === "coder-1");
    expect(coderOption?.hideRole).toBe(true);

    const kbaseOption = options.find((o) => o.key === "kbase-1");
    expect(kbaseOption?.hideRole).toBe(true);

    const normalOption = options.find((o) => o.key === "normal");
    expect(normalOption?.hideRole).toBeFalsy();

    // rendering: coder agent should not render the role span
    const html = renderToStaticMarkup(
      React.createElement(TimelineAgentSwitcher, {
        currentWorker: {
          key: currentRow.key,
          type: "agent",
          sourceId: currentRow.sourceId,
          displayName: currentRow.displayName,
          role: currentRow.role,
          raw: null,
          row: currentRow,
          relatedChats: [],
        },
        options,
        initialOpen: true,
      }),
    );
    expect(html).not.toContain("不该显示"); // coder/kbase 的角色不应该出现
    // regular agent should still show its role
    expect(html).toContain("角色");
  });

  it("dispatches the existing worker selection event when selecting an agent", () => {
    dispatchTimelineAgentSwitch({
      key: "researcher",
      name: "小研",
      role: "研究员",
      searchText: "researcher 小研 研究员",
    });

    expect(globalWithStorage.window?.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:select-worker",
        detail: {
          workerKey: "agent:researcher",
          agentKey: "researcher",
          focusComposerOnComplete: true,
          preferNewChat: true,
        },
      }),
    );
  });
});
