import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import {
  canSendToTargetChat,
  resolveDifferentChatDetachRunDetail,
  normalizeQueryModelOverride,
  syncLiveSessionTerminalState,
  useMessageActions,
} from "@/features/composer/hooks/useMessageActions";
import type { WorkerRow } from "@/app/state/types";

const startQuery = jest.fn();

function createDetachTestState(overrides: Record<string, unknown> = {}) {
  return {
    chatId: "",
    runId: "",
    streaming: false,
    currentRunAgentKey: "",
    runAgentById: new Map<string, string>(),
    chatAgentById: new Map<string, string>(),
    chats: [],
    ...overrides,
  } as never;
}

jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({
  useRunTransport: () => ({ startQuery }),
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(),
}));

jest.mock("@/features/voice/lib/voiceRuntime", () => ({
  getVoiceRuntime: jest.fn(() => ({
    resetVoiceRuntime: jest.fn(),
    stopAllVoiceSessions: jest.fn(),
  })),
}));

jest.mock("@/features/terminal/lib/terminalDockPersistence", () => ({
  restoreTerminalDockOpen: jest.fn(() => false),
  persistTerminalDockOpen: jest.fn(),
  restoreTerminalDockState: jest.fn(() => ({ open: false, height: null })),
  persistTerminalDockState: jest.fn(),
  resetTerminalDockPersistenceForTests: jest.fn(),
}));

const { useAppContext } = jest.requireMock("@/app/state/AppContext") as {
  useAppContext: jest.Mock;
};

describe("normalizeQueryModelOverride", () => {
  it("preserves all six efforts and normalizes case plus EXTRA_HIGH", () => {
    expect(normalizeQueryModelOverride({ reasoningEffort: "xhigh" })).toEqual({
      reasoningEffort: "XHIGH",
    });
    expect(normalizeQueryModelOverride({ reasoningEffort: "EXTRA_HIGH" })).toEqual({
      reasoningEffort: "XHIGH",
    });
    expect(normalizeQueryModelOverride({ reasoningEffort: "MAX" })).toEqual({
      reasoningEffort: "MAX",
    });
    expect(normalizeQueryModelOverride({ reasoningEffort: "NONE" })).toEqual({
      reasoningEffort: "NONE",
    });
  });
});

describe("useMessageActions temporary pin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startQuery.mockReturnValue({
      accepted: Promise.resolve({
        requestId: "req_1",
        chatId: "chat_1",
        runId: "run_1",
        owner: { kind: "agent", agentKey: "agent-coder" },
      }),
      completion: Promise.resolve({ reason: "done", lastSeq: 1 }),
      detach: jest.fn(),
    });
  });

  it("clears a matching temporary pinned agent when the first query starts", async () => {
    const state = createInitialState();
    const worker: WorkerRow = {
      key: "agent:agent-coder",
      type: "agent",
      sourceId: "agent-coder",
      displayName: "agent-coder",
      role: "",
      teamAgentLabels: [],
      latestChatId: "",
      latestRunId: "",
      latestUpdatedAt: 0,
      latestChatName: "",
      latestRunContent: "",
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: "agent-coder",
    };
    state.agents = [{ key: "agent-coder", name: "agent-coder", mode: "CODER" }];
    state.workerSelectionKey = worker.key;
    state.workerRows = [worker];
    state.workerIndexByKey = new Map([[worker.key, worker]]);
    state.temporaryPinnedAgentKey = "agent-coder";
    const dispatch = jest.fn();
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });

    let actions: ReturnType<typeof useMessageActions> | null = null;
    const Harness = () => {
      actions = useMessageActions({ onAgentEvent: jest.fn() });
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    await actions?.sendMessage(
      "hello",
      [],
      [],
      {},
      undefined,
      undefined,
      "",
      "",
      "",
      false,
      [" pdf ", "PDF", "mock-skill"],
      "agent-coder",
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_TEMPORARY_PINNED_AGENT_KEY",
      agentKey: "",
    });
    expect(startQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { kind: "agent", agentKey: "agent-coder" },
        message: "hello",
        mustUseSkills: ["pdf", "mock-skill"],
      }),
    );
  });

  it("blocks direct query sends when the current main chat has an active run", async () => {
    const state = createInitialState();
    state.chatId = "chat_1";
    state.currentChatActiveRun = {
      chatId: "chat_1",
      runId: "run_1",
      agentKey: "agent_a",
    };
    state.chatAgentById = new Map([["chat_1", "agent_a"]]);
    const dispatch = jest.fn();
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });

    let actions: ReturnType<typeof useMessageActions> | null = null;
    const Harness = () => {
      actions = useMessageActions({ onAgentEvent: jest.fn() });
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    await actions?.sendMessage("hello");

    expect(startQuery).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TIMELINE_NODE" }),
    );
  });

  it("sends the KBASE editing snapshot and clears it on unsupported without retrying", async () => {
    const state = createInitialState();
    const worker: WorkerRow = {
      key: "agent:knowledge",
      type: "agent",
      agentType: "kbase",
      sourceId: "knowledge",
      displayName: "Knowledge",
      role: "",
      teamAgentLabels: [],
      latestChatId: "",
      latestRunId: "",
      latestUpdatedAt: 0,
      latestChatName: "",
      latestRunContent: "",
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: "knowledge",
    };
    state.agents = [{ key: "knowledge", name: "Knowledge", mode: "KBASE" }];
    state.workerSelectionKey = worker.key;
    state.workerRows = [worker];
    state.workerIndexByKey = new Map([[worker.key, worker]]);
    state.editingMode = true;
    const dispatch = jest.fn();
    const activeRequest = { current: "" };
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: activeRequest,
    });
    const unsupported = Object.assign(new Error("unsupported"), {
        platformError: {
          code: "editing_mode_unsupported",
          message: "unsupported",
        },
      });
    startQuery.mockReturnValue({
      accepted: Promise.reject(unsupported),
      completion: Promise.resolve({ reason: "error", lastSeq: 0, error: unsupported }),
      detach: jest.fn(),
    });

    let actions: ReturnType<typeof useMessageActions> | null = null;
    const Harness = () => {
      actions = useMessageActions({ onAgentEvent: jest.fn() });
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    await actions?.sendMessage(
      "edit",
      [],
      [],
      {},
      undefined,
      undefined,
      "",
      "",
      "",
      true,
    );

    expect(startQuery).toHaveBeenCalledTimes(1);
    expect(startQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: "KBASE",
        editingMode: true,
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_EDITING_MODE",
      enabled: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_COMPOSER_DRAFT",
      draft: "edit",
    });
  });
});

describe("syncLiveSessionTerminalState", () => {
  it("marks the live session as finished for terminal run events", () => {
    const session = {
      streaming: true,
      abortController: new AbortController(),
    };

    const changed = syncLiveSessionTerminalState(session, {
      type: "run.complete",
    } as never);

    expect(changed).toBe(true);
    expect(session.streaming).toBe(false);
    expect(session.abortController).toBeNull();
  });

  it("keeps the live session active for non-terminal events", () => {
    const controller = new AbortController();
    const session = {
      streaming: true,
      abortController: controller,
    };

    const changed = syncLiveSessionTerminalState(session, {
      type: "content.delta",
    } as never);

    expect(changed).toBe(false);
    expect(session.streaming).toBe(true);
    expect(session.abortController).toBe(controller);
  });
});

describe("canSendToTargetChat", () => {
  it("blocks duplicate sends while the same chat is still actively streaming", () => {
    const session = {
      streaming: true,
      abortController: new AbortController(),
      chatId: "chat_1",
    };

    const allowed = canSendToTargetChat({
      currentActiveSession: session,
      currentStateChatId: "chat_1",
      targetChatId: "chat_1",
    });

    expect(allowed).toBe(false);
    expect(session.streaming).toBe(true);
  });

  it("keeps duplicate sends blocked while the active session is still marked streaming", () => {
    const session = {
      streaming: true,
      abortController: new AbortController(),
      chatId: "chat_1",
    };

    const allowed = canSendToTargetChat({
      currentActiveSession: session,
      currentStateChatId: "chat_1",
      targetChatId: "chat_1",
    });

    expect(allowed).toBe(false);
    expect(session.streaming).toBe(true);
    expect(session.abortController).not.toBeNull();
  });
});

describe("resolveDifferentChatDetachRunDetail", () => {
  it("returns detach event detail before sending to another chat while streaming", () => {
    const state = createDetachTestState({
      chatId: "chat_old",
      runId: "run_old",
      streaming: true,
      runAgentById: new Map([["run_old", "agent_old"]]),
    });

    const detail = resolveDifferentChatDetachRunDetail({
      currentActiveSession: {
        streaming: true,
        chatId: "chat_old",
        runId: "run_old",
        agentKey: "",
      },
      currentState: state,
      targetChatId: "chat_new",
    });

    expect(detail).toEqual({
      chatId: "chat_old",
      runId: "run_old",
      agentKey: "agent_old",
      owner: { kind: "agent", agentKey: "agent_old" },
      reason: "chat_switch",
    });
  });

  it("does not detach when sending to the currently active chat", () => {
    const state = createDetachTestState({
      chatId: "chat_old",
      runId: "run_old",
      streaming: true,
    });

    expect(resolveDifferentChatDetachRunDetail({
      currentActiveSession: {
        streaming: true,
        chatId: "chat_old",
        runId: "run_old",
        agentKey: "agent_old",
      },
      currentState: state,
      targetChatId: "chat_old",
    })).toBeNull();
  });
});
