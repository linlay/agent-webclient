import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "../../context/AppContext";
import { EventPopover, __TEST_ONLY__ } from "./EventPopover";
import type { AgentEvent } from "../../context/types";

const {
  canCollectEvent,
  copyText,
  formatReadableTimestamp,
  getCollectibleRelatedEvents,
  buildCollectedSnapshot,
  resolveEventGroupMeta,
  resolveInitialPopoverState,
} = __TEST_ONLY__;

jest.mock("../../context/AppContext", () => {
  const actual = jest.requireActual("../../context/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

const { useAppState, useAppDispatch } = jest.requireMock(
  "../../context/AppContext",
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

function createEntry(event: AgentEvent, index: number) {
  return { event, index };
}

describe("EventPopover collect controls", () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("enables collection for expanded event whitelist", () => {
    expect(canCollectEvent("reasoning.start")).toBe(true);
    expect(canCollectEvent("reasoning.delta")).toBe(true);
    expect(canCollectEvent("reasoning.end")).toBe(true);
    expect(canCollectEvent("content.start")).toBe(true);
    expect(canCollectEvent("content.delta")).toBe(true);
    expect(canCollectEvent("content.end")).toBe(true);
    expect(canCollectEvent("tool.start")).toBe(true);
    expect(canCollectEvent("tool.args")).toBe(true);
    expect(canCollectEvent("tool.end")).toBe(true);
    expect(canCollectEvent("action.start")).toBe(true);
    expect(canCollectEvent("action.args")).toBe(true);
    expect(canCollectEvent("action.end")).toBe(true);

    expect(canCollectEvent("content.snapshot")).toBe(false);
    expect(canCollectEvent("tool.result")).toBe(false);
    expect(canCollectEvent("run.start")).toBe(false);
    expect(canCollectEvent("action.snapshot")).toBe(false);
  });

  it("only collects family-specific stream events and excludes tool.result", () => {
    const event: AgentEvent = {
      type: "tool.start",
      toolId: "call_1",
      runId: "run_1",
    };
    const relatedEvents = [
      createEntry(event, 0),
      createEntry({ type: "tool.args", toolId: "call_1", delta: "{\"q\":" }, 1),
      createEntry({ type: "tool.result", toolId: "call_1", result: "ignored" }, 2),
      createEntry({ type: "tool.end", toolId: "call_1", timestamp: 30 }, 3),
      createEntry({ type: "tool.snapshot", toolId: "call_1", timestamp: 40 }, 4),
    ];

    const collected = getCollectibleRelatedEvents(
      event,
      resolveEventGroupMeta(event),
      relatedEvents,
    );

    expect(collected.map((entry) => entry.event.type)).toEqual([
      "tool.start",
      "tool.args",
      "tool.end",
    ]);
  });

  it("renders copy button for all events and collect button for whitelisted delta events", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "reasoning.delta",
      reasoningId: "r1",
      timestamp: 1776518171300,
      delta: "hello",
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      events: [
        { type: "reasoning.start", reasoningId: "r1" },
        event,
      ],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="收集事件快照"');
    expect(html).toContain('aria-label="复制事件 JSON"');
    expect(html).toContain('aria-label="关闭事件详情"');
    expect(html).toContain(
      `时间: ${formatReadableTimestamp(1776518171300)}`,
    );
  });

  it("does not render collect button for non-collectible events", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "run.start",
      runId: "run_1",
      timestamp: 1776518171300,
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      events: [event, { type: "run.complete", runId: "run_1" }],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="复制事件 JSON"');
    expect(html).toContain('aria-label="关闭事件详情"');
    expect(html).not.toContain('aria-label="收集事件快照"');
  });
});

describe("EventPopover collected snapshot shape", () => {
  it("builds a reasoning snapshot from grouped reasoning events", () => {
    const currentEvent: AgentEvent = {
      type: "reasoning.start",
      reasoningId: "r1",
      runId: "run_1",
      seq: 11,
      reasoningLabel: "我再盘一盘",
    };
    const relatedEvents = [
      createEntry(currentEvent, 0),
      createEntry(
        {
          type: "reasoning.delta",
          reasoningId: "r1",
          delta: "第一段。",
        },
        1,
      ),
      createEntry(
        {
          type: "reasoning.end",
          reasoningId: "r1",
          seq: 13,
          timestamp: 1776518171300,
          text: "最终文本",
        },
        2,
      ),
    ];

    expect(buildCollectedSnapshot(currentEvent, relatedEvents)).toEqual(
      expect.objectContaining({
        type: "reasoning.snapshot",
        reasoningId: "r1",
        runId: "run_1",
        seq: 13,
        timestamp: 1776518171300,
        text: "第一段。",
      }),
    );
  });

  it("builds a content snapshot and falls back to final text when no deltas exist", () => {
    const currentEvent: AgentEvent = {
      type: "content.end",
      contentId: "c1",
      runId: "run_1",
    };
    const relatedEvents = [
      createEntry({ type: "content.start", contentId: "c1", runId: "run_1" }, 0),
      createEntry(
        {
          type: "content.end",
          contentId: "c1",
          runId: "run_1",
          seq: 21,
          timestamp: 123456,
          text: "hello world",
        },
        1,
      ),
    ];

    expect(buildCollectedSnapshot(currentEvent, relatedEvents)).toEqual(
      expect.objectContaining({
        type: "content.snapshot",
        contentId: "c1",
        runId: "run_1",
        seq: 21,
        timestamp: 123456,
        text: "hello world",
      }),
    );
  });

  it("builds a tool snapshot with concatenated arguments and last-event metadata", () => {
    const currentEvent: AgentEvent = {
      type: "tool.start",
      toolId: "call_1",
      runId: "run_1",
      chatId: "chat_1",
      requestId: "req_1",
      toolName: "search",
    };
    const relatedEvents = [
      createEntry(currentEvent, 0),
      createEntry(
        {
          type: "tool.args",
          toolId: "call_1",
          delta: "{\"q\":",
        },
        1,
      ),
      createEntry(
        {
          type: "tool.args",
          toolId: "call_1",
          delta: "\"zenmind\"}",
        },
        2,
      ),
      createEntry(
        {
          type: "tool.end",
          toolId: "call_1",
          runId: "run_1",
          chatId: "chat_1",
          requestId: "req_1",
          seq: 31,
          timestamp: 999,
          toolName: "search",
        },
        3,
      ),
      createEntry(
        {
          type: "tool.result",
          toolId: "call_1",
          result: "not included",
        },
        4,
      ),
    ];

    const filteredRelatedEvents = getCollectibleRelatedEvents(
      currentEvent,
      resolveEventGroupMeta(currentEvent),
      relatedEvents,
    );
    const snapshot = buildCollectedSnapshot(currentEvent, filteredRelatedEvents);

    expect(snapshot).toEqual(
      expect.objectContaining({
        type: "tool.snapshot",
        toolId: "call_1",
        runId: "run_1",
        chatId: "chat_1",
        requestId: "req_1",
        seq: 31,
        timestamp: 999,
        arguments: "{\"q\":\"zenmind\"}",
      }),
    );
    expect(snapshot).not.toHaveProperty("result");
  });

  it("builds an action snapshot with concatenated arguments and keeps context fields", () => {
    const currentEvent: AgentEvent = {
      type: "action.args",
      actionId: "action_1",
      runId: "run_1",
      chatId: "chat_1",
      requestId: "req_1",
      actionName: "switch_theme",
      delta: "{\"theme\":",
    };
    const relatedEvents = [
      createEntry(
        {
          type: "action.start",
          actionId: "action_1",
          runId: "run_1",
          chatId: "chat_1",
          requestId: "req_1",
          actionName: "switch_theme",
        },
        0,
      ),
      createEntry(currentEvent, 1),
      createEntry(
        {
          type: "action.args",
          actionId: "action_1",
          delta: "\"dark\"}",
        },
        2,
      ),
      createEntry(
        {
          type: "action.end",
          actionId: "action_1",
          actionName: "switch_theme",
          seq: 41,
          timestamp: 888,
        },
        3,
      ),
      createEntry(
        {
          type: "action.snapshot",
          actionId: "action_1",
          timestamp: 999,
        },
        4,
      ),
    ];

    const filteredRelatedEvents = getCollectibleRelatedEvents(
      currentEvent,
      resolveEventGroupMeta(currentEvent),
      relatedEvents,
    );
    const snapshot = buildCollectedSnapshot(currentEvent, filteredRelatedEvents);

    expect(filteredRelatedEvents.map((entry) => entry.event.type)).toEqual([
      "action.start",
      "action.args",
      "action.args",
      "action.end",
    ]);
    expect(snapshot).toEqual(
      expect.objectContaining({
        type: "action.snapshot",
        actionId: "action_1",
        actionName: "switch_theme",
        runId: "run_1",
        chatId: "chat_1",
        requestId: "req_1",
        seq: 41,
        timestamp: 888,
        arguments: "{\"theme\":\"dark\"}",
      }),
    );
    expect(snapshot).not.toHaveProperty("result");
    expect(snapshot).not.toHaveProperty("text");
  });
});

describe("EventPopover display and copy helpers", () => {
  it("formats readable timestamps and falls back to --", () => {
    expect(formatReadableTimestamp(1776518171300)).toMatch(
      /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/,
    );
    expect(formatReadableTimestamp(undefined)).toBe("--");
  });

  it("initializes raw json from the original event without injecting readable time", () => {
    const state = resolveInitialPopoverState({
      type: "tool.end",
      toolId: "call_1",
      timestamp: 1776518171300,
    });

    expect(state.rawJsonStr).toContain('"timestamp": 1776518171300');
    expect(state.rawJsonStr).not.toContain(
      formatReadableTimestamp(1776518171300),
    );
    expect(state.displayJsonStr).toBe(state.rawJsonStr);
  });

  it("copies using navigator clipboard when available", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
    });

    await copyText('{"type":"content.start"}');

    expect(writeText).toHaveBeenCalledWith('{"type":"content.start"}');
  });
});
