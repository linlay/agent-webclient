/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentEvent } from "@/app/state/types";
import type { ChatDetailResponse } from "@/shared/data";
import { buildChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";
import { ReadOnlyConversationTimeline } from "./ReadOnlyConversationTimeline";

const EPOCH = 1_710_000_000_000;

jest.mock("react-virtuoso", () => {
  const ReactRuntime = require("react") as typeof React;
  return {
    Virtuoso: (props: {
      data?: unknown[];
      computeItemKey?: (index: number, item: unknown) => React.Key;
      itemContent: (index: number, item: unknown) => React.ReactNode;
      className?: string;
    }) =>
      ReactRuntime.createElement(
        "div",
        { className: props.className, "data-testid": "virtuoso" },
        ...(props.data || []).map((item, index) =>
          ReactRuntime.createElement(
            ReactRuntime.Fragment,
            { key: props.computeItemKey?.(index, item) || index },
            props.itemContent(index, item),
          ),
        ),
      ),
  };
});

jest.mock("@/features/timeline/components/TimelineRow", () => ({
  TimelineRow: ({ node }: { node?: { kind?: string; text?: string } }) =>
    React.createElement(
      "div",
      { "data-testid": "timeline-row", "data-node-kind": node?.kind || "tool-group" },
      node?.text || node?.kind || "tool-group",
    ),
  formatTimelineTime: () => ({ short: "", full: "" }),
}));

jest.mock("@/features/timeline/components/TimelineRenderEntryView", () => {
  const ReactRuntime = require("react") as typeof React;
  const { useTimelineInteraction } = jest.requireActual(
    "@/features/timeline/components/TimelineInteractionContext",
  ) as typeof import("@/features/timeline/components/TimelineInteractionContext");
  return {
    TimelineRenderEntryView: ({
      entry,
    }: {
      entry: {
        kind: string;
        node?: { kind?: string; text?: string };
        taskId?: string;
      };
    }) => {
      const interaction = useTimelineInteraction();
      return ReactRuntime.createElement(
        "div",
        {
          "data-testid": "render-entry",
          "data-entry-kind": entry.kind,
          "data-node-kind": entry.node?.kind || "",
          "data-task-id": entry.taskId || "",
          "data-read-only": String(Boolean(interaction?.readOnly)),
          "data-surface-chat-id": interaction?.surfaceContext?.chatId || "",
        },
        entry.node?.text || entry.taskId || entry.kind,
      );
    },
  };
});

jest.mock("@/features/timeline/components/RunTerminalNotice", () => ({
  RunTerminalNotice: ({ terminalType }: { terminalType: string }) =>
    React.createElement("div", { "data-terminal-type": terminalType }),
}));

jest.mock("@/features/surfaces/openTarget", () => ({
  useOpenTarget: () => jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => key,
  }),
}));

function completedChatEvents(): AgentEvent[] {
  return [
    {
      type: "request.query",
      requestId: "request-1",
      chatId: "chat-history",
      runId: "run-1",
      message: "Question one",
      timestamp: EPOCH + 100,
    },
    {
      type: "reasoning.snapshot",
      reasoningId: "reasoning-1",
      chatId: "chat-history",
      runId: "run-1",
      text: "Reasoning one",
      timestamp: EPOCH + 110,
    },
    {
      type: "tool.snapshot",
      toolId: "tool-1",
      toolName: "search",
      chatId: "chat-history",
      runId: "run-1",
      arguments: "{}",
      timestamp: EPOCH + 120,
    },
    {
      type: "task.start",
      taskId: "task-1",
      taskName: "Research task",
      subAgentKey: "agent-child",
      chatId: "chat-history",
      runId: "run-1",
      timestamp: EPOCH + 125,
    },
    {
      type: "content.snapshot",
      contentId: "task-content-1",
      taskId: "task-1",
      chatId: "chat-history",
      runId: "run-1",
      text: "Task answer",
      timestamp: EPOCH + 130,
    },
    {
      type: "task.complete",
      taskId: "task-1",
      chatId: "chat-history",
      runId: "run-1",
      timestamp: EPOCH + 140,
    },
    {
      type: "content.snapshot",
      contentId: "content-1",
      chatId: "chat-history",
      runId: "run-1",
      text: "Answer one",
      timestamp: EPOCH + 150,
    },
    {
      type: "run.complete",
      chatId: "chat-history",
      runId: "run-1",
      timestamp: EPOCH + 160,
    },
    {
      type: "request.query",
      requestId: "request-2",
      chatId: "chat-history",
      runId: "run-2",
      message: "Question two",
      timestamp: EPOCH + 200,
    },
    {
      type: "content.snapshot",
      contentId: "content-2",
      chatId: "chat-history",
      runId: "run-2",
      text: "Answer two",
      timestamp: EPOCH + 210,
    },
    {
      type: "run.complete",
      chatId: "chat-history",
      runId: "run-2",
      timestamp: EPOCH + 220,
    },
  ];
}

describe("ReadOnlyConversationTimeline", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderTimeline = (chat: ChatDetailResponse) => {
    const projection = buildChatReplayProjection(chat.chatId, chat);
    act(() => {
      root.render(
        React.createElement(ReadOnlyConversationTimeline, {
          chat,
          projection,
          agents: [
            { key: "agent-parent", name: "Parent" },
            { key: "agent-child", name: "Child" },
          ],
          agentKey: "agent-parent",
          teamChat: false,
        }),
      );
    });
    return projection;
  };

  it("renders projected message, content, reasoning, tool, and task history", () => {
    const chat: ChatDetailResponse = {
      chatId: "chat-history",
      agentKey: "agent-parent",
      events: completedChatEvents(),
    };
    const projection = renderTimeline(chat);

    expect(
      Array.from(projection.state.timelineNodes.values()).map(
        (node) => node.kind,
      ),
    ).toEqual(
      expect.arrayContaining(["message", "thinking", "tool", "content"]),
    );
    expect(projection.state.taskItemsById.has("task-1")).toBe(true);
    expect(
      container.querySelectorAll('[data-testid="timeline-row"]'),
    ).toHaveLength(2);
    expect(
      Array.from(container.querySelectorAll('[data-testid="render-entry"]')).map(
        (element) =>
          element.getAttribute("data-node-kind") ||
          element.getAttribute("data-entry-kind"),
      ),
    ).toEqual(expect.arrayContaining(["thinking", "tool", "content", "task-group"]));
    expect(
      container.querySelector('[data-task-id="task-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-read-only="true"][data-surface-chat-id="chat-history"]'),
    ).not.toBeNull();
  });

  it("renders every run with the same presentation and without execution-specific decoration", () => {
    renderTimeline({ chatId: "chat-history", events: completedChatEvents() });

    expect(container.textContent).toContain("Question one");
    expect(container.textContent).toContain("Answer one");
    expect(container.textContent).toContain("Question two");
    expect(container.textContent).toContain("Answer two");
    const runs = Array.from(container.querySelectorAll("[data-run-id]"));
    expect(runs.map((run) => run.getAttribute("data-run-id"))).toEqual([
      "run-1",
      "run-2",
    ]);
    expect(new Set(runs.map((run) => run.className)).size).toBe(1);
    expect(
      container.querySelector('[data-current-execution="true"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain(
      "automationHistory.chat.currentExecution",
    );
  });

  it("keeps all user-visible runs when an automation query is hidden", () => {
    const events = completedChatEvents().map((event, index) =>
      index === 0
        ? {
            ...event,
            role: "automation",
            hidden: true,
            message: "Internal automation request",
          }
        : event,
    );
    renderTimeline({ chatId: "chat-history", events });

    expect(container.textContent).not.toContain("Internal automation request");
    expect(container.textContent).toContain("Answer one");
    expect(container.textContent).toContain("Question two");
    expect(container.textContent).toContain("Answer two");
    expect(
      Array.from(container.querySelectorAll("[data-run-id]")).map((run) =>
        run.getAttribute("data-run-id"),
      ),
    ).toEqual(["run-1", "run-2"]);
  });

  it("keeps a running chat snapshot in the full history without special treatment", () => {
    const events = completedChatEvents().slice(0, 8).concat([
      {
        type: "request.query",
        requestId: "request-running",
        chatId: "chat-history",
        runId: "run-running",
        message: "Running question",
        timestamp: EPOCH + 300,
      },
      {
        type: "content.snapshot",
        contentId: "content-running",
        chatId: "chat-history",
        runId: "run-running",
        text: "Partial answer",
        timestamp: EPOCH + 310,
      },
    ] as AgentEvent[]);
    renderTimeline({
      chatId: "chat-history",
      activeRun: { runId: "run-running" },
      events,
    });

    expect(container.textContent).toContain("Running question");
    expect(container.textContent).toContain("Partial answer");
    expect(
      container.querySelector('[data-current-execution="true"]'),
    ).toBeNull();
  });

  it("shows an empty history state without interactive controls", () => {
    renderTimeline({ chatId: "chat-empty", events: [] });

    expect(container.textContent).toContain("automationHistory.chat.empty");
    expect(container.querySelector("button")).toBeNull();
  });
});
