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
  resolveDebugPreCallCopyPayloads,
  resolveInjectedPromptPayloads,
  resolveInjectedPromptPayloadFromLLMTrace,
  resolveInjectedPromptPayloadFromRequestBody,
  resolvePromptAnalysisCalls,
  resolvePromptAnalysisPayloadFromTraceText,
  buildPromptAnalysisTimeoutLoadState,
  PROMPT_ANALYSIS_LOAD_TIMEOUT_MS,
  resolveInitialPopoverState,
  resolveRawJsonlChatId,
  buildRawJsonlCopyMenuItem,
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

    expect(html).toContain('aria-label="Open copy menu"');
    expect(html).not.toContain('aria-label="复制 systemPrompt"');
    expect(html).not.toContain('aria-label="复制 tools"');
  });

  it("does not render prompt analysis directly on debug.preCall when payload exists", () => {
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

    expect(html).not.toContain('aria-label="Prompt analysis"');
  });

  it("renders prompt analysis for run.start with same-run llm chat calls", () => {
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
        trace: { file: "llm/run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event, llmChatEvent],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="Prompt analysis"');
  });

  it("renders prompt analysis for debug.llmChat with a valid trace file", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        trace: { file: "llm/run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).toContain('aria-label="Prompt analysis"');
  });

  it("does not render prompt analysis for debug.llmChat with an invalid trace file", () => {
    const state = createInitialState();
    const event: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        trace: { file: "llm/../run_1_001.json" },
      },
    };
    useAppState.mockReturnValue({
      ...state,
      eventPopoverIndex: 0,
      eventPopoverEventRef: event,
      debugEvents: [event],
    });

    const html = renderToStaticMarkup(React.createElement(EventPopover));

    expect(html).not.toContain('aria-label="Prompt analysis"');
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

  it("extracts structured prompt payloads from llm trace json", () => {
    const payload = resolveInjectedPromptPayloadFromLLMTrace({
      injectedPrompt: {
        systemPrompt: "trace system",
        systemPromptTokens: 3,
        providerMessages: [
          { role: "system", content: "trace system", estimatedTokens: 3 },
          { role: "user", content: "trace user", estimatedTokens: 2 },
        ],
        providerMessagesTokens: 5,
      },
    });

    expect(payload).toMatchObject({
      systemPromptText: "trace system",
      systemPromptTokens: 3,
      providerMessagesTokens: 5,
    });
    expect(payload?.entries.map((entry) => entry.title)).toEqual([
      "System Prompt",
      "Provider Message #1",
      "Provider Message #2",
    ]);
  });

  it("falls back to OpenAI-style trace request messages for prompt analysis", () => {
    const payload = resolveInjectedPromptPayloadFromRequestBody({
      model: "gpt-5",
      messages: [
        { role: "system", content: "openai system" },
        { role: "user", content: "first user" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second user" },
      ],
    });

    expect(payload?.systemPromptText).toBe("openai system");
    expect(payload?.historyMessagesText).toContain("first user");
    expect(payload?.historyMessagesText).toContain("first answer");
    expect(payload?.currentUserMessageText).toContain("second user");
    expect(payload?.providerMessagesText).toContain("openai system");
  });

  it("falls back to trace requestBody fields for prompt analysis", () => {
    const payload = resolveInjectedPromptPayloadFromLLMTrace({
      requestBody: {
        model: "gpt-5",
        messages: [
          { role: "system", content: "requestBody system" },
          { role: "user", content: "requestBody user" },
        ],
      },
    });

    expect(payload?.systemPromptText).toBe("requestBody system");
    expect(payload?.currentUserMessageText).toContain("requestBody user");
  });

  it("falls back to Anthropic-style trace request system text for prompt analysis", () => {
    const payload = resolveInjectedPromptPayloadFromRequestBody({
      model: "claude",
      system: "anthropic system",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(payload?.systemPromptText).toBe("anthropic system");
    expect(payload?.providerMessagesText).toContain("anthropic system");
    expect(payload?.currentUserMessageText).toContain("hello");
  });

  it("parses prompt analysis payloads from raw trace text", () => {
    expect(
      resolvePromptAnalysisPayloadFromTraceText(
        JSON.stringify({
          request: {
            messages: [
              { role: "system", content: "raw system" },
              { role: "user", content: "raw user" },
            ],
          },
        }),
      )?.systemPromptText,
    ).toBe("raw system");

    expect(resolvePromptAnalysisPayloadFromTraceText("{not json")).toBeNull();
  });

  it("parses prompt analysis payloads from trace objects and data wrappers", () => {
    expect(
      resolvePromptAnalysisPayloadFromTraceText({
        request: {
          messages: [
            { role: "system", content: "object system" },
            { role: "user", content: "object user" },
          ],
        },
      })?.systemPromptText,
    ).toBe("object system");

    expect(
      resolvePromptAnalysisPayloadFromTraceText({
        data: {
          request: {
            messages: [
              { role: "system", content: "wrapped system" },
              { role: "user", content: "wrapped user" },
            ],
          },
        },
      })?.currentUserMessageText,
    ).toContain("wrapped user");

    expect(
      resolvePromptAnalysisPayloadFromTraceText({
        data: JSON.stringify({
          request: {
            messages: [
              { role: "system", content: "string-wrapped system" },
              { role: "user", content: "string-wrapped user" },
            ],
          },
        }),
      })?.systemPromptText,
    ).toBe("string-wrapped system");
  });

  it("builds an error load state for prompt analysis timeout", () => {
    expect(PROMPT_ANALYSIS_LOAD_TIMEOUT_MS).toBe(15_000);
    expect(buildPromptAnalysisTimeoutLoadState("timeout")).toEqual({
      status: "error",
      message: "timeout",
    });
  });

  it("collects prompt analysis calls for run.start and excludes direct debug.preCall", () => {
    const legacyPreCall: AgentEvent = {
      type: "debug.preCall",
      runId: "run_1",
      data: {
        injectedPrompt: {
          systemPrompt: "legacy system",
          systemPromptTokens: 3,
          providerMessages: [
            { role: "system", content: "legacy system", estimatedTokens: 3 },
          ],
          providerMessagesTokens: 3,
        },
      },
    };
    const llmChat: AgentEvent = {
      type: "debug.llmChat",
      runId: "run_1",
      data: {
        model: { key: "mock-model" },
        runSeq: 2,
        status: "ok",
        trace: { file: "llm/run_1_002.json" },
      },
    };

    expect(resolvePromptAnalysisCalls(legacyPreCall, [legacyPreCall])).toEqual([]);
    expect(
      resolvePromptAnalysisCalls(
        { type: "run.start", runId: "run_1" },
        [legacyPreCall, llmChat, { type: "debug.llmChat", runId: "other" }],
      ).map((call) => ({
        kind: call.kind,
        title: call.title,
        modelLabel: call.modelLabel,
      })),
    ).toEqual([
      { kind: "inline", title: "debug.preCall", modelLabel: "" },
      { kind: "trace", title: "LLM #2", modelLabel: "mock-model" },
    ]);
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

  it("resolves raw llm trace file only from debug.llmChat events", () => {
    expect(
      resolveRawLLMTraceFile({
        type: "debug.llmChat",
        data: {
          trace: {
            file: "llm/run_1_001.json",
          },
        },
      }),
    ).toBe("llm/run_1_001.json");

    expect(
      resolveRawLLMTraceFile({
        type: "debug.postCall",
        data: {
          trace: {
            file: "llm/run_1_001.json",
          },
        },
      }),
    ).toBe("");

    expect(
      resolveRawLLMTraceFile({
        type: "debug.llmChat",
        data: {
          trace: {
            file: "llm/../run_1_001.json",
          },
        },
      }),
    ).toBe("");
  });

  it("builds a deferred raw llm trace copy menu item", async () => {
    const loadRawLLMTrace = jest.fn(async () => '{"runId":"run_1"}\n');
    const item = buildRawLLMTraceCopyMenuItem(
      " llm/run_1_001.json ",
      (key) => (key === "eventPopover.copy.rawLlmJson" ? "Copy raw LLM JSON" : key),
      loadRawLLMTrace,
    );

    expect(item).toMatchObject({
      key: "rawLlmJson",
      label: "Copy raw LLM JSON",
      text: "",
    });
    await expect(item!.loadText!()).resolves.toBe('{"runId":"run_1"}\n');
    expect(loadRawLLMTrace).toHaveBeenCalledWith("llm/run_1_001.json");
    expect(buildRawLLMTraceCopyMenuItem("", (key) => key)).toBeNull();
    expect(isValidRawLLMTraceFile("llm/run_1_001.txt")).toBe(false);
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
