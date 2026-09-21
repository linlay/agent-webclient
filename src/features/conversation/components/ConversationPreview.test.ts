/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { ChatDetailResponse } from "@/shared/data";
import { buildChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";
import { conversationPreviewDataFromReplay } from "@/features/conversation/lib/conversationPreviewData";
import { ConversationPreview } from "./ConversationPreview";

import { copyText } from "@/shared/utils/copy";

const mockCopySuccess = jest.fn();
const mockCopyError = jest.fn();
jest.mock("@/shared/utils/copy", () => ({ copyText: jest.fn().mockResolvedValue(undefined) }));

const EPOCH = 1_710_000_000_000;

jest.mock("react-virtuoso", () => {
  const ReactRuntime = require("react") as typeof React;
  return {
    Virtuoso: ReactRuntime.forwardRef((props: {
      data?: unknown[];
      computeItemKey?: (index: number, item: unknown) => React.Key;
      itemContent: (index: number, item: unknown) => React.ReactNode;
      className?: string;
    }, ref: React.Ref<unknown>) => {
      ReactRuntime.useImperativeHandle(ref, () => ({ autoscrollToBottom: jest.fn(), scrollToIndex: jest.fn() }));
      return ReactRuntime.createElement(
        "div",
        { className: props.className, "data-testid": "virtuoso" },
        ...(props.data || []).map((item, index) =>
          ReactRuntime.createElement(
            ReactRuntime.Fragment,
            { key: props.computeItemKey?.(index, item) || index },
            props.itemContent(index, item),
          ),
        ),
      );
    }),
  };
});

jest.mock("@/features/timeline/components/TimelineRow", () => ({
  TimelineRow: ({ node, metaNode }: { node?: { kind?: string; text?: string }; metaNode?: React.ReactNode }) =>
    React.createElement(
      "div",
      { "data-testid": "timeline-row", "data-node-kind": node?.kind || "tool-group" },
      node?.text || node?.kind || "tool-group",
      metaNode,
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

describe("ConversationPreview", () => {
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

  const renderTimeline = (chat: ChatDetailResponse, viewportMode: "container" | "document" = "container") => {
    const projection = buildChatReplayProjection(chat.chatId, chat);
    act(() => {
      root.render(
        React.createElement(ConversationPreview, {
          data: conversationPreviewDataFromReplay(chat, projection),
          onCopyResult: (success) => success
            ? mockCopySuccess("timeline.toolPill.copy.copied")
            : mockCopyError("timeline.toolPill.copy.failed"),
          agents: [
            { key: "agent-parent", name: "Parent" },
            { key: "agent-child", name: "Child" },
          ],
          agentKey: "agent-parent",
          teamChat: false,
          viewportMode,
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
    act(() => (container.querySelector(".timeline-run-collapse [role=button]") as HTMLElement).click());
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

  it("omits user and answer metadata in the document share view", () => {
    renderTimeline({ chatId: "chat-history", events: completedChatEvents() }, "document");

    expect(container.querySelectorAll(".timeline-run-meta")).toHaveLength(0);
    expect(container.querySelectorAll('[data-run-id] [aria-label="timeline.toolPill.copy.action"]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-label="timeline.toolPill.copy.action"]')).toHaveLength(0);
    expect(container.querySelectorAll(".timeline-row-time")).toHaveLength(0);
    expect(container.textContent).toContain("Answer one");
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

  it("copies one complete Run including its query and process, without feedback or branch controls", async () => {
    renderTimeline({ chatId: "chat-history", events: completedChatEvents() });
    const runs = container.querySelectorAll("[data-run-id]");
    expect(runs[0].querySelector('[aria-label="timeline.feedback.downvote"]')).toBeNull();
    expect(runs[0].querySelector('[aria-label="timeline.run.deriveChat"]')).toBeNull();
    await act(async () => (runs[0].querySelector('[aria-label="timeline.toolPill.copy.action"]') as HTMLButtonElement).click());
    const first = jest.mocked(copyText).mock.calls[0][0];
    expect(first).toContain("Query\nQuestion one");
    expect(first).toContain("Thinking\nReasoning one");
    expect(first).toContain("Tools\n1. search");
    expect(first).toContain("Task answer");
    expect(first).toContain("Answer one");
    expect(first).not.toContain("Question two");
    expect(first).not.toContain("Answer two");
    expect(mockCopySuccess).toHaveBeenCalledWith("timeline.toolPill.copy.copied");
    await act(async () => (runs[1].querySelector('[aria-label="timeline.toolPill.copy.action"]') as HTMLButtonElement).click());
    expect(jest.mocked(copyText).mock.calls[1][0]).toBe("Query\nQuestion two\n\nAnswer\nAnswer two");
  });

  it("reports a clipboard failure without changing the conversation", async () => {
    jest.mocked(copyText).mockRejectedValueOnce(new Error("Clipboard unavailable"));
    renderTimeline({ chatId: "chat-history", events: completedChatEvents() });
    await act(async () => (container.querySelector('[data-run-id] [aria-label="timeline.toolPill.copy.action"]') as HTMLButtonElement).click());
    expect(mockCopyError).toHaveBeenCalledWith("timeline.toolPill.copy.failed");
    expect(container.textContent).toContain("Answer one");
  });

  it("shows an empty history state without interactive controls", () => {
    renderTimeline({ chatId: "chat-empty", events: [] });

    expect(container.textContent).toContain("automationHistory.chat.empty");
    expect(container.querySelector("button")).toBeNull();
  });
});
