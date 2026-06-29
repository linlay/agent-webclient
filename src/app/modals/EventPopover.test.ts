import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { EventPopover, __TEST_ONLY__ } from "@/app/modals/EventPopover";
import {
  configureI18nRuntime,
  DEFAULT_LOCALES,
  getDefaultTermsForLocale,
} from "@/shared/i18n";
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
  resolveSystemPromptCalls,
  resolveSystemPromptTextFromTraceText,
  resolveSystemPromptTextFromRequestBody,
  buildSystemPromptTimeoutLoadState,
  SYSTEM_PROMPT_LOAD_TIMEOUT_MS,
  resolveInitialPopoverState,
  resolveRawJsonlChatId,
  buildRawJsonlCopyMenuItem,
  shouldIncludeRawJsonlCopyItem,
  resolveRawLLMTraceFile,
  buildRawLLMTraceCopyMenuItem,
  isValidRawLLMTraceFile,
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
    expect(canCollectEvent("planning.start")).toBe(true);
    expect(canCollectEvent("planning.delta")).toBe(true);
    expect(canCollectEvent("planning.end")).toBe(true);
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
    expect(canCollectEvent("planning.snapshot")).toBe(false);
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

  it("groups planning events by planningId", () => {
    const event: AgentEvent = {
      type: "planning.delta",
      planningId: "planning_1",
      runId: "run_1",
    };

    expect(resolveEventGroupMeta(event)).toEqual({
      family: "planning",
      idKey: "planningId",
      idValue: "planning_1",
    });
  });

  it("falls back to planId for planning event grouping", () => {
    const event: AgentEvent = {
      type: "planning.delta",
      planId: "plan_1",
      runId: "run_1",
    };

    expect(resolveEventGroupMeta(event)).toEqual({
      family: "planning",
      idKey: "planningId",
      idValue: "plan_1",
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
      debugEvents: [
        { type: "reasoning.start", reasoningId: "r1" },
        event,
      ],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="Collect event snapshot"');
    expect(html).toContain('aria-label="Open copy menu"');
    expect(html).toContain('aria-label="Close event details"');
    expect(html).toContain(
      `Time: ${formatReadableTimestamp(1776518171300)}`,
    );
  });

  it("collects related events from debugEvents instead of raw events", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "reasoning.delta",
      reasoningId: "r1",
      timestamp: 1776518171300,
      delta: "visible",
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 1,
      eventPopoverEventRef: event,
      events: [
        { type: "reasoning.delta", reasoningId: "other", delta: "raw" },
      ],
      debugEvents: [
        { type: "reasoning.start", reasoningId: "r1" },
        event,
      ],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain("reasoningId: r1 · 2/2");
    expect(html).toContain('aria-label="Collect event snapshot"');
    expect(html).not.toContain("other");
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

    expect(html).toContain('aria-label="Open copy menu"');
    expect(html).toContain('aria-label="Close event details"');
    expect(html).not.toContain('aria-label="Collect event snapshot"');
  });

  it("renders system prompt action for run.start with same-run llm chat calls", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "run.start",
      runId: "run_1",
      timestamp: 1776518171300,
    };
    const llmChatEvent: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        model: { key: "mock-model" },
        runSeq: 1,
        status: "ok",
	        trace: { file: "chat_1/.llm-records/run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event, llmChatEvent],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="System Prompt"');
  });

  it("renders system prompt action for debug.llmChat with a valid trace file", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        trace: { file: "chat_1/.llm-records/run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="System Prompt"');
  });

  it("does not render system prompt action for debug.llmChat with an invalid trace file", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        trace: { file: "chat_1/../run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).not.toContain('aria-label="System Prompt"');
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

  it("builds a planning snapshot from grouped planning events", () => {
    const currentEvent: AgentEvent = {
      type: "planning.start",
      planningId: "planning_1",
      planningLabel: "Plan",
      text: "先",
      runId: "run_1",
      seq: 31,
    };
    const relatedEvents = [
      createEntry(currentEvent, 0),
      createEntry(
        {
          type: "planning.delta",
          planningId: "planning_1",
          delta: "看日志。",
        },
        1,
      ),
      createEntry(
        {
          type: "planning.end",
          planningId: "planning_1",
          seq: 33,
          timestamp: 1776518171301,
        },
        2,
      ),
    ];

    expect(buildCollectedSnapshot(currentEvent, relatedEvents)).toEqual(
      expect.objectContaining({
        type: "planning.snapshot",
        planningId: "planning_1",
        planningLabel: "Plan",
        runId: "run_1",
        seq: 33,
        timestamp: 1776518171301,
        text: "先看日志。",
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
  beforeEach(() => {
    configureI18nRuntime({
      locale: "zh-CN",
      fallbackLocale: "zh-CN",
      locales: DEFAULT_LOCALES,
      terms: getDefaultTermsForLocale("zh-CN"),
    });
  });

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

  it("extracts OpenAI-style system prompt text from trace request messages", () => {
    expect(
      resolveSystemPromptTextFromRequestBody({
      model: "gpt-5",
      messages: [
        { role: "system", content: "openai system" },
        { role: "user", content: "first user" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second user" },
      ],
      }),
    ).toBe("openai system");
  });

  it("extracts system prompt text from requestBody trace fields", () => {
    expect(
      resolveSystemPromptTextFromTraceText({
      requestBody: {
        model: "gpt-5",
        messages: [
          { role: "system", content: "requestBody system" },
          { role: "user", content: "requestBody user" },
        ],
      },
      }),
    ).toBe("requestBody system");
  });

  it("extracts Anthropic-style system text before system messages", () => {
    expect(
      resolveSystemPromptTextFromRequestBody({
      model: "claude",
      system: "anthropic system",
        messages: [
          { role: "system", content: "openai system" },
          { role: "user", content: "hello" },
        ],
      }),
    ).toBe("anthropic system\n\nopenai system");
  });

  it("parses system prompt text from raw trace text", () => {
    expect(
      resolveSystemPromptTextFromTraceText(
        JSON.stringify({
          request: {
            messages: [
              { role: "system", content: "raw system" },
              { role: "user", content: "raw user" },
            ],
          },
        }),
      ),
    ).toBe("raw system");

    expect(resolveSystemPromptTextFromTraceText("{not json")).toBe("");
  });

  it("parses system prompt text from trace objects and data wrappers", () => {
    expect(
      resolveSystemPromptTextFromTraceText({
        request: {
          messages: [
            { role: "system", content: "object system" },
            { role: "user", content: "object user" },
          ],
        },
      }),
    ).toBe("object system");

    expect(
      resolveSystemPromptTextFromTraceText({
        data: {
          request: {
            messages: [
              { role: "system", content: "wrapped system" },
              { role: "user", content: "wrapped user" },
            ],
          },
        },
      }),
    ).toBe("wrapped system");

    expect(
      resolveSystemPromptTextFromTraceText({
        data: JSON.stringify({
          request: {
            messages: [
              { role: "system", content: "string-wrapped system" },
              { role: "user", content: "string-wrapped user" },
            ],
          },
        }),
      }),
    ).toBe("string-wrapped system");
  });

  it("builds an error load state for system prompt timeout", () => {
    expect(SYSTEM_PROMPT_LOAD_TIMEOUT_MS).toBe(15_000);
    expect(buildSystemPromptTimeoutLoadState("timeout")).toEqual({
      status: "error",
      message: "timeout",
    });
  });

  it("collects system prompt calls for run.start and direct debug.llmChat", () => {
    const firstLlmChat: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        model: { key: "mock-model" },
        runSeq: 1,
        status: "ok",
        trace: { file: "chat_1/.llm-records/run_1_001.json" },
      },
    };
    const secondLlmChat: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        model: { key: "other-model" },
        runSeq: 2,
        status: "ok",
        trace: { file: "chat_1/.llm-records/run_1_002.json" },
      },
    };

    expect(
      resolveSystemPromptCalls(firstLlmChat, [firstLlmChat]).map((call) => ({
        title: call.title,
        modelLabel: call.modelLabel,
      })),
    ).toEqual([
      { title: "LLM #1", modelLabel: "mock-model" },
    ]);
    expect(
      resolveSystemPromptCalls(
        { type: "run.start", runId: "run_1" },
        [firstLlmChat, secondLlmChat, { type: "debug.llmChat", runId: "other" }],
      ).map((call) => ({
        title: call.title,
        modelLabel: call.modelLabel,
      })),
    ).toEqual([
      { title: "LLM #1", modelLabel: "mock-model" },
      { title: "LLM #2", modelLabel: "other-model" },
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

  it("builds source publish copy menu items", () => {
    const sources = [
      {
        id: "kbase:/docs/refund.md",
        name: "refund.md",
        chunks: [
          {
            chunkId: "hit_1",
            index: 1,
            content: "退款需要先提交申请。",
          },
        ],
      },
    ];

    expect(
      buildEventCopyMenuItems(
        {
          type: "source.publish",
          runId: "run_1",
          toolId: "tool_1",
          query: "退款流程",
          sources,
        },
        [],
        '{"type":"source.publish"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"source.publish"}',
      },
      {
        key: "runId",
        label: "Copy runId",
        text: "run_1",
      },
      {
        key: "toolId",
        label: "Copy toolId",
        text: "tool_1",
      },
      {
        key: "query",
        label: "Copy query",
        text: "退款流程",
      },
      {
        key: "sources",
        label: "Copy sources JSON",
        text: JSON.stringify(sources, null, 2),
      },
    ]);
  });

  it("resolves raw jsonl chatId from current and related events", () => {
    expect(
      resolveRawJsonlChatId(
        { type: "run.start", runId: "run_1", chatId: "chat_1" },
        [],
      ),
    ).toBe("chat_1");

    expect(
      resolveRawJsonlChatId(
        { type: "tool.end", toolId: "tool_1" },
        [
          createEntry(
            { type: "tool.start", toolId: "tool_1", chatId: "chat_related" },
            0,
          ),
        ],
      ),
    ).toBe("chat_related");

    expect(resolveRawJsonlChatId({ type: "tool.end", toolId: "tool_1" }, [])).toBe("");
  });

  it("builds a deferred raw jsonl copy menu item", async () => {
    const loadRawJsonl = jest.fn(async () => '{"_type":"query"}\n');
    const item = buildRawJsonlCopyMenuItem(
      " chat_1 ",
      (key) => (key === "eventPopover.copy.rawJsonl" ? "Copy raw JSONL" : key),
      loadRawJsonl,
    );

    expect(item).toMatchObject({
      key: "rawJsonl",
      label: "Copy raw JSONL",
      text: "",
    });
    await expect(item!.loadText!()).resolves.toBe('{"_type":"query"}\n');
    expect(loadRawJsonl).toHaveBeenCalledWith("chat_1");
    expect(buildRawJsonlCopyMenuItem("", (key) => key)).toBeNull();
  });

  it("includes raw JSONL copy item for run.start events with chatId", () => {
    const event: AgentEvent = {
      type: "run.start",
      runId: "run_1",
      chatId: "chat_1",
    };
    const rawJsonlItem = buildRawJsonlCopyMenuItem(
      resolveRawJsonlChatId(event, []),
      (key) => key,
    );

    expect(shouldIncludeRawJsonlCopyItem(event)).toBe(true);
    expect(rawJsonlItem).toMatchObject({ key: "rawJsonl" });
  });

  it("includes raw JSONL copy item for chat and run events only", () => {
    expect(shouldIncludeRawJsonlCopyItem({ type: "chat.update", chatId: "chat_1" })).toBe(true);
    expect(shouldIncludeRawJsonlCopyItem({ type: "run.complete", chatId: "chat_1" })).toBe(true);
    expect(shouldIncludeRawJsonlCopyItem({ type: "request.query", chatId: "chat_1" })).toBe(false);
    expect(shouldIncludeRawJsonlCopyItem({ type: "usage.snapshot", chatId: "chat_1" })).toBe(false);
    expect(shouldIncludeRawJsonlCopyItem({ type: "artifact.publish", chatId: "chat_1" })).toBe(false);
    expect(shouldIncludeRawJsonlCopyItem({ type: "content.delta", chatId: "chat_1" })).toBe(false);
    expect(shouldIncludeRawJsonlCopyItem({ type: "tool.end", chatId: "chat_1" })).toBe(false);
  });

  it("excludes raw JSONL but keeps raw LLM trace for debug.llmChat events", () => {
    const event: AgentEvent = {
      type: "debug.llmChat",
      chatId: "chat_1",
      data: {
        trace: {
          file: "chat_1/.llm-records/run_1_001.json",
        },
      },
    };
    const rawLlmItem = buildRawLLMTraceCopyMenuItem(
      resolveRawLLMTraceFile(event),
      (key) => (key === "eventPopover.copy.rawLlmJson" ? "Copy raw LLM JSON" : key),
    );

    expect(shouldIncludeRawJsonlCopyItem(event)).toBe(false);
    expect(rawLlmItem).toMatchObject({
      key: "rawLlmJson",
      label: "Copy raw LLM JSON",
    });
  });

  it("resolves raw llm trace file only from debug.llmChat events", () => {
    expect(
	      resolveRawLLMTraceFile({
	        type: "debug.llmChat",
	        data: {
	          trace: {
	            file: "chat_1/.llm-records/run_1_001.json",
	          },
	        },
	      }),
    ).toBe("chat_1/.llm-records/run_1_001.json");

    expect(
	      resolveRawLLMTraceFile({
	        type: "debug.postCall",
	        data: {
	          trace: {
	            file: "chat_1/.llm-records/run_1_001.json",
	          },
	        },
	      }),
    ).toBe("");

    expect(
	      resolveRawLLMTraceFile({
	        type: "debug.llmChat",
	        data: {
	          trace: {
	            file: "chat_1/../run_1_001.json",
	          },
	        },
	      }),
    ).toBe("");
  });

  it("builds a deferred raw llm trace copy menu item", async () => {
    const loadRawLLMTrace = jest.fn(async () => '{"runId":"run_1"}\n');
    const item = buildRawLLMTraceCopyMenuItem(
      " chat_1/.llm-records/run_1_001.json ",
      (key) => (key === "eventPopover.copy.rawLlmJson" ? "Copy raw LLM JSON" : key),
      loadRawLLMTrace,
    );

    expect(item).toMatchObject({
      key: "rawLlmJson",
      label: "Copy raw LLM JSON",
      text: "",
    });
    await expect(item!.loadText!()).resolves.toBe('{"runId":"run_1"}\n');
    expect(loadRawLLMTrace).toHaveBeenCalledWith("chat_1/.llm-records/run_1_001.json");
    expect(buildRawLLMTraceCopyMenuItem("", (key) => key)).toBeNull();
    expect(isValidRawLLMTraceFile("chat_1/.llm-records/run_1_001.txt")).toBe(false);
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
	          type: "awaiting.ask",
	          awaitingId: "await_1",
	          mode: "question",
	          questions: [{ id: "q1", question: "继续吗？", type: "text" as const }],
	        },
	        [],
	        '{"type":"awaiting.ask"}',
      ),
    ).toEqual([
      {
	        key: "eventJson",
	        label: "Copy all",
	        text: '{"type":"awaiting.ask"}',
      },
      {
        key: "awaitingId",
        label: "Copy awaitingId",
        text: "await_1",
      },
      {
        key: "awaitingItems",
        label: "Copy question/approval/form/plan JSON",
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
          type: "debug.llmChat",
          data: {
            requestBody: {
              model: "mock-model",
            },
          },
        },
        [],
        '{"type":"debug.llmChat"}',
      ),
    ).toEqual([
      {
        key: "eventJson",
        label: "Copy all",
        text: '{"type":"debug.llmChat"}',
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
