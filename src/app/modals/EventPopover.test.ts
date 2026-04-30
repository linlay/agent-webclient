import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { EventPopover, __TEST_ONLY__ } from "@/app/modals/EventPopover";
import type { AgentEvent } from "@/app/state/types";

const {
  canCollectEvent,
  copyText,
  formatReadableTimestamp,
  getCollectibleRelatedEvents,
  buildCollectedSnapshot,
  buildEventCopyMenuItems,
  buildCopyMenuTitle,
  getPrimaryCopyMenuItem,
  resolveEventGroupMeta,
  resolveDebugPreCallCopyPayloads,
  resolveInjectedPromptPayloads,
  resolveInitialPopoverState,
} = __TEST_ONLY__;

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

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

  it("groups artifact.publish events by runId", () => {
    const event: AgentEvent = {
      type: "artifact.publish",
      runId: "run_1",
      chatId: "chat_1",
      artifacts: [],
    };

    expect(resolveEventGroupMeta(event)).toEqual({
      family: "artifact",
      idKey: "runId",
      idValue: "run_1",
    });
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
    expect(html).toContain('aria-label="打开复制菜单"');
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

    expect(html).toContain('aria-label="打开复制菜单"');
    expect(html).toContain('aria-label="关闭事件详情"');
    expect(html).not.toContain('aria-label="收集事件快照"');
  });

  it("renders a copy menu trigger for debug.preCall instead of flat copy buttons", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.preCall",
      runId: "run_1",
      data: {
        requestBody: {
          messages: [{ role: "system", content: "system prompt" }],
          tools: [{ name: "search" }],
        },
      },
      timestamp: 1776518171300,
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      events: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="打开复制菜单"');
    expect(html).not.toContain('aria-label="复制 systemPrompt"');
    expect(html).not.toContain('aria-label="复制 tools"');
  });

  it("renders an injected prompt viewer trigger for debug.preCall when payload exists", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.preCall",
      runId: "run_1",
      data: {
        requestBody: {
          messages: [{ role: "system", content: "system prompt" }],
        },
        injectedPrompt: {
          systemPrompt: "system prompt",
          systemPromptTokens: 3,
          providerMessages: [
            { role: "system", content: "system prompt", estimatedTokens: 3 },
            { role: "user", content: "show debug", estimatedTokens: 2 },
          ],
          providerMessagesTokens: 5,
        },
      },
      timestamp: 1776518171300,
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      events: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="查看注入 Prompt"');
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

  it("extracts debug.preCall copy payloads from an OpenAI-style requestBody", () => {
    expect(
      resolveDebugPreCallCopyPayloads({
        type: "debug.preCall",
        data: {
          requestBody: {
            messages: [{ role: "system", content: "system prompt" }],
            tools: [{ name: "search" }],
          },
        },
      }),
    ).toEqual({
      requestBodyText: JSON.stringify(
        {
          messages: [{ role: "system", content: "system prompt" }],
          tools: [{ name: "search" }],
        },
        null,
        2,
      ),
      systemPromptText: "system prompt",
      toolsText: JSON.stringify([{ name: "search" }], null, 2),
      modelText: "",
    });
  });

  it("extracts debug.preCall copy payloads from an Anthropic-style requestBody", () => {
    expect(
      resolveDebugPreCallCopyPayloads({
        type: "debug.preCall",
        data: {
          requestBody: {
            system: "anthropic system",
            tools: [{ name: "browser" }],
          },
        },
      }),
    ).toEqual({
      requestBodyText: JSON.stringify(
        {
          system: "anthropic system",
          tools: [{ name: "browser" }],
        },
        null,
        2,
      ),
      systemPromptText: "anthropic system",
      toolsText: JSON.stringify([{ name: "browser" }], null, 2),
      modelText: "",
    });
  });

  it("extracts injected prompt payloads with token counts", () => {
    expect(
      resolveInjectedPromptPayloads({
        type: "debug.preCall",
        data: {
          injectedPrompt: {
            systemPrompt: "system prompt",
            systemPromptTokens: 3,
            systemSections: [
              {
                id: "agent-identity",
                title: "Agent Identity",
                role: "system",
                category: "agent.identity",
                content: "Agent Identity\nkey: jira",
                tokens: 5,
              },
              {
                id: "runtime-session",
                title: "Runtime Context: Session",
                role: "system",
                category: "runtime.session",
                content: "Runtime Context: Session\nchatId: chat-1",
                tokens: 6,
              },
            ],
            historyMessages: [
              { role: "user", content: "first user", estimatedTokens: 2 },
              { role: "assistant", content: "first answer", estimatedTokens: 3 },
              { role: "tool", content: "tool output", estimatedTokens: 4 },
              { role: "user", content: "second user", estimatedTokens: 2 },
            ],
            historyMessagesTokens: 11,
            currentUserMessage: { role: "user", content: "show debug", estimatedTokens: 2 },
            currentUserMessageTokens: 2,
            providerMessages: [
              { role: "system", content: "system prompt", estimatedTokens: 3 },
              { role: "user", content: "show debug", estimatedTokens: 2 },
            ],
            providerMessagesTokens: 5,
          },
        },
      }),
    ).toEqual({
      rawJsonText: JSON.stringify(
        {
          systemPrompt: "system prompt",
          systemPromptTokens: 3,
          systemSections: [
            {
              id: "agent-identity",
              title: "Agent Identity",
              role: "system",
              category: "agent.identity",
              content: "Agent Identity\nkey: jira",
              tokens: 5,
            },
            {
              id: "runtime-session",
              title: "Runtime Context: Session",
              role: "system",
              category: "runtime.session",
              content: "Runtime Context: Session\nchatId: chat-1",
              tokens: 6,
            },
          ],
          historyMessages: [
            { role: "user", content: "first user", estimatedTokens: 2 },
            { role: "assistant", content: "first answer", estimatedTokens: 3 },
            { role: "tool", content: "tool output", estimatedTokens: 4 },
            { role: "user", content: "second user", estimatedTokens: 2 },
          ],
          historyMessagesTokens: 11,
          currentUserMessage: { role: "user", content: "show debug", estimatedTokens: 2 },
          currentUserMessageTokens: 2,
          providerMessages: [
            { role: "system", content: "system prompt", estimatedTokens: 3 },
            { role: "user", content: "show debug", estimatedTokens: 2 },
          ],
          providerMessagesTokens: 5,
        },
        null,
        2,
      ),
      systemPromptText: "system prompt",
      systemPromptTokens: 3,
      historyMessagesText: JSON.stringify(
        [
          { role: "user", content: "first user", estimatedTokens: 2 },
          { role: "assistant", content: "first answer", estimatedTokens: 3 },
          { role: "tool", content: "tool output", estimatedTokens: 4 },
          { role: "user", content: "second user", estimatedTokens: 2 },
        ],
        null,
        2,
      ),
      historyMessagesTokens: 11,
      currentUserMessageText: JSON.stringify(
        { role: "user", content: "show debug", estimatedTokens: 2 },
        null,
        2,
      ),
      currentUserMessageTokens: 2,
      providerMessagesText: JSON.stringify(
        [
          { role: "system", content: "system prompt", estimatedTokens: 3 },
          { role: "user", content: "show debug", estimatedTokens: 2 },
        ],
        null,
        2,
      ),
      providerMessagesTokens: 5,
      entries: [
        {
          id: "agent-identity",
          title: "Agent Identity",
          role: "system",
          category: "agent.identity",
          tokens: 5,
          contentText: "Agent Identity\nkey: jira",
          rawJsonText: JSON.stringify(
            {
              id: "agent-identity",
              title: "Agent Identity",
              role: "system",
              category: "agent.identity",
              content: "Agent Identity\nkey: jira",
              tokens: 5,
            },
            null,
            2,
          ),
        },
        {
          id: "runtime-session",
          title: "Runtime Context: Session",
          role: "system",
          category: "runtime.session",
          tokens: 6,
          contentText: "Runtime Context: Session\nchatId: chat-1",
          rawJsonText: JSON.stringify(
            {
              id: "runtime-session",
              title: "Runtime Context: Session",
              role: "system",
              category: "runtime.session",
              content: "Runtime Context: Session\nchatId: chat-1",
              tokens: 6,
            },
            null,
            2,
          ),
        },
        {
          id: "history-1",
          title: "History Message #1",
          role: "user",
          tokens: 2,
          roundNumber: 1,
          contentText: "first user",
          rawJsonText: JSON.stringify(
            { role: "user", content: "first user", estimatedTokens: 2 },
            null,
            2,
          ),
        },
        {
          id: "history-2",
          title: "History Message #2",
          role: "assistant",
          tokens: 3,
          roundNumber: 1,
          contentText: "first answer",
          rawJsonText: JSON.stringify(
            { role: "assistant", content: "first answer", estimatedTokens: 3 },
            null,
            2,
          ),
        },
        {
          id: "history-3",
          title: "History Message #3",
          role: "tool",
          tokens: 4,
          roundNumber: 1,
          contentText: "tool output",
          rawJsonText: JSON.stringify(
            { role: "tool", content: "tool output", estimatedTokens: 4 },
            null,
            2,
          ),
        },
        {
          id: "history-4",
          title: "History Message #4",
          role: "user",
          tokens: 2,
          roundNumber: 2,
          contentText: "second user",
          rawJsonText: JSON.stringify(
            { role: "user", content: "second user", estimatedTokens: 2 },
            null,
            2,
          ),
        },
        {
          id: "current-user",
          title: "Current User Message #5",
          role: "user",
          tokens: 2,
          contentText: "show debug",
          rawJsonText: JSON.stringify(
            { role: "user", content: "show debug", estimatedTokens: 2 },
            null,
            2,
          ),
        },
        {
          id: "provider-1",
          title: "Provider Message #1",
          role: "system",
          tokens: 3,
          contentText: "system prompt",
          rawJsonText: JSON.stringify(
            { role: "system", content: "system prompt", estimatedTokens: 3 },
            null,
            2,
          ),
        },
        {
          id: "provider-2",
          title: "Provider Message #2",
          role: "user",
          tokens: 2,
          contentText: "show debug",
          rawJsonText: JSON.stringify(
            { role: "user", content: "show debug", estimatedTokens: 2 },
            null,
            2,
          ),
        },
      ],
    });
  });

  it("builds copy menu items from requestBody-derived debug.preCall content", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "debug.preCall",
          data: {
            requestBody: {
              model: "gpt-5",
              messages: [{ role: "system", content: "system prompt" }],
              tools: [{ name: "search" }],
            },
          },
        },
        [],
        '{"type":"debug.preCall"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"debug.preCall"}',
      },
      {
        key: "requestBody",
        label: "Copy requestBody",
        text: JSON.stringify(
          {
            model: "gpt-5",
            messages: [{ role: "system", content: "system prompt" }],
            tools: [{ name: "search" }],
          },
          null,
          2,
        ),
      },
      {
        key: "systemPrompt",
        label: "Copy systemPrompt",
        text: "system prompt",
      },
      {
        key: "tools",
        label: "Copy tools",
        text: JSON.stringify([{ name: "search" }], null, 2),
      },
      {
        key: "model",
        label: "Copy model",
        text: "gpt-5",
      },
    ]);
  });

  it("builds chat event copy menu items", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "chat.update",
          chatId: "chat_1",
          chatName: "Alpha",
        },
        [],
        '{"type":"chat.update"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"chat.update"}',
      },
      {
        key: "chatId",
        label: "Copy chatId",
        text: "chat_1",
      },
      {
        key: "chatName",
        label: "Copy chatName",
        text: "Alpha",
      },
    ]);
  });

  it("builds request event copy menu items with message and references", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "request.query",
          requestId: "req_1",
          message: "hello",
          references: [{ id: "file_1", url: "https://example.com/a.txt" }],
        },
        [],
        '{"type":"request.query"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"request.query"}',
      },
      {
        key: "requestId",
        label: "Copy requestId",
        text: "req_1",
      },
      {
        key: "message",
        label: "Copy message",
        text: "hello",
      },
      {
        key: "references",
        label: "Copy references",
        text: JSON.stringify(
          [{ id: "file_1", url: "https://example.com/a.txt" }],
          null,
          2,
        ),
      },
    ]);
  });

  it("builds content copy menu items with current text and collected snapshot", () => {
    const event: AgentEvent = {
      type: "content.delta",
      contentId: "content_1",
      delta: "hello",
    };
    const relatedEvents = [
      createEntry({ type: "content.start", contentId: "content_1" }, 0),
      createEntry(event, 1),
      createEntry(
        {
          type: "content.end",
          contentId: "content_1",
          text: "hello world",
          timestamp: 123,
        },
        2,
      ),
    ];

    expect(
      buildEventCopyMenuItems(event, relatedEvents, '{"type":"content.delta"}'),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"content.delta"}',
      },
      {
        key: "contentId",
        label: "Copy contentId",
        text: "content_1",
      },
      {
        key: "currentText",
        label: "Copy current text",
        text: "hello",
      },
      {
        key: "collectedText",
        label: "Copy collected text",
        text: "hello",
      },
      {
        key: "collectedSnapshot",
        label: "Copy collected snapshot JSON",
        text: JSON.stringify(
          {
            type: "content.snapshot",
            contentId: "content_1",
            delta: "hello",
            text: "hello",
            timestamp: 123,
          },
          null,
          2,
        ),
      },
    ]);
  });

  it("prefers parsed tool params over arguments and delta when building tool copy menu items", () => {
    const event: AgentEvent = {
      type: "tool.args",
      toolId: "tool_1",
      toolLabel: "搜索工具",
      toolName: "search",
      toolParams: { q: "zenmind" },
      arguments: "{\"ignored\":true}",
      delta: "{\"fallback\":true}",
    };

    const items = buildEventCopyMenuItems(
      event,
      [createEntry(event, 0)],
      '{"type":"tool.args"}',
    );

    expect(items.map((item) => item.key)).toEqual([
      "eventJson",
      "toolId",
      "toolName",
      "arguments",
      "collectedSnapshot",
    ]);
    expect(items[0]).toEqual({
      key: "eventJson",
      label: "Copy all",
      text: '{"type":"tool.args"}',
    });
    expect(items[3]).toEqual({
      key: "arguments",
      label: "Copy arguments",
      text: JSON.stringify({ q: "zenmind" }, null, 2),
    });
    expect(JSON.parse(items[4].text)).toEqual({
      type: "tool.snapshot",
      toolId: "tool_1",
      toolLabel: "搜索工具",
      toolName: "search",
      toolParams: { q: "zenmind" },
      arguments: "{\"fallback\":true}",
      delta: "{\"fallback\":true}",
      text: "{\"fallback\":true}",
    });
  });

  it("falls back from action arguments string to buffered delta when needed", () => {
    const eventWithArguments: AgentEvent = {
      type: "action.end",
      actionId: "action_1",
      actionName: "switch_theme",
      arguments: "{\"theme\":\"dark\"}",
    };
    expect(
      buildEventCopyMenuItems(
        eventWithArguments,
        [createEntry(eventWithArguments, 0)],
        '{"type":"action.end"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"action.end"}',
      },
      {
        key: "actionId",
        label: "Copy actionId",
        text: "action_1",
      },
      {
        key: "actionName",
        label: "Copy actionName",
        text: "switch_theme",
      },
      {
        key: "arguments",
        label: "Copy arguments",
        text: "{\"theme\":\"dark\"}",
      },
      {
        key: "collectedSnapshot",
        label: "Copy collected snapshot JSON",
        text: JSON.stringify(
          {
            type: "action.snapshot",
            actionId: "action_1",
            actionName: "switch_theme",
            arguments: "{\"theme\":\"dark\"}",
          },
          null,
          2,
        ),
      },
    ]);

    const deltaEvents = [
      createEntry(
        {
          type: "action.start",
          actionId: "action_2",
          actionName: "switch_theme",
        },
        0,
      ),
      createEntry(
        {
          type: "action.args",
          actionId: "action_2",
          delta: "{\"theme\":",
        },
        1,
      ),
      createEntry(
        {
          type: "action.args",
          actionId: "action_2",
          delta: "\"light\"}",
        },
        2,
      ),
    ];

    const deltaItems = buildEventCopyMenuItems(
      deltaEvents[1].event,
      deltaEvents,
      '{"type":"action.args"}',
    );
    expect(deltaItems.map((item) => item.key)).toEqual([
      "eventJson",
      "actionId",
      "arguments",
      "collectedSnapshot",
    ]);
    expect(deltaItems[0]).toEqual({
      key: "eventJson",
      label: "Copy all",
      text: '{"type":"action.args"}',
    });
    expect(deltaItems[2]).toEqual({
      key: "arguments",
      label: "Copy arguments",
      text: "{\"theme\":\"light\"}",
    });
    expect(JSON.parse(deltaItems[3].text)).toEqual({
      type: "action.snapshot",
      actionId: "action_2",
      delta: "\"light\"}",
      actionName: "switch_theme",
      arguments: "{\"theme\":\"light\"}",
    });
  });

  it("builds artifact publish copy menu items with url list", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "artifact.publish",
          runId: "run_1",
          artifacts: [
            { artifactId: "a1", url: "https://example.com/a" },
            { artifactId: "a2", url: "https://example.com/b" },
          ],
        },
        [],
        '{"type":"artifact.publish"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"artifact.publish"}',
      },
      {
        key: "runId",
        label: "Copy runId",
        text: "run_1",
      },
      {
        key: "artifacts",
        label: "Copy artifacts JSON",
        text: JSON.stringify(
          [
            { artifactId: "a1", url: "https://example.com/a" },
            { artifactId: "a2", url: "https://example.com/b" },
          ],
          null,
          2,
        ),
      },
      {
        key: "artifactUrls",
        label: "Copy artifact URLs",
        text: "https://example.com/a\nhttps://example.com/b",
      },
    ]);
  });

  it("builds awaiting copy menu items from structured payloads", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "awaiting.payload",
          awaitingId: "await_1",
          questions: [{ id: "q1", question: "继续吗？", type: "text" as const }],
        },
        [],
        '{"type":"awaiting.payload"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"awaiting.payload"}',
      },
      {
        key: "awaitingId",
        label: "Copy awaitingId",
        text: "await_1",
      },
      {
        key: "awaitingItems",
        label: "Copy question/approval/form JSON",
        text: JSON.stringify(
          [{ id: "q1", question: "继续吗？", type: "text" }],
          null,
          2,
        ),
      },
    ]);
  });

  it("omits unavailable copy options and keeps event JSON for other events", () => {
    expect(
      buildEventCopyMenuItems(
        {
          type: "debug.preCall",
          data: {
            requestBody: {
              model: "mock-model",
            },
          },
        },
        [],
        '{"type":"debug.preCall"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"debug.preCall"}',
      },
      {
        key: "requestBody",
        label: "Copy requestBody",
        text: JSON.stringify(
          {
            model: "mock-model",
          },
          null,
          2,
        ),
      },
      {
        key: "model",
        label: "Copy model",
        text: "mock-model",
      },
    ]);

    expect(
      buildEventCopyMenuItems(
        {
          type: "debug.postCall",
          data: {
            requestBody: {
              system: "ignored",
            },
          },
        },
        [],
        '{"type":"debug.postCall"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"debug.postCall"}',
      },
    ]);
  });

  it("keeps copy-all as the primary copy item", () => {
    const items = buildEventCopyMenuItems(
      {
        type: "chat.update",
        chatId: "chat_1",
      },
      [],
      '{"type":"chat.update"}',
    );

    expect(getPrimaryCopyMenuItem(items)).toEqual({
      key: "eventJson",
      label: "Copy all",
      text: '{"type":"chat.update"}',
    });
  });

  it("builds copy button titles from dynamic item labels", () => {
    expect(
      buildCopyMenuTitle(
        { key: "eventJson", label: "All" },
        { eventJson: "copied" },
      ),
    ).toBe("Copied All");
    expect(
      buildCopyMenuTitle(
        { key: "artifactUrls", label: "artifact URLs" },
        { artifactUrls: "error" },
      ),
    ).toBe("artifact URLs copy failed");
    expect(
      buildCopyMenuTitle(
        { key: "eventJson", label: "All" },
        {},
      ),
    ).toBe("Open copy menu");
  });
});
