import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import {
  canSendToTargetChat,
  resolveDifferentChatDetachRunDetail,
  resolveQueryStreamExecutor,
  syncLiveSessionTerminalState,
  useMessageActions,
} from "@/features/composer/hooks/useMessageActions";
import type { WorkerRow } from "@/app/state/types";
import { executeQueryStreamSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";

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

jest.mock("@/features/transport/lib/queryStreamRuntime.sse", () => ({
  executeQueryStreamSse: jest.fn(),
}));

jest.mock("@/features/transport/lib/queryStreamRuntime.ws", () => ({
  executeQueryStreamWs: jest.fn(),
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

describe("resolveQueryStreamExecutor", () => {
  it("returns the sse executor for sse mode", () => {
    expect(resolveQueryStreamExecutor("sse")).toBe(executeQueryStreamSse);
  });

  it("returns the ws executor for ws mode", () => {
    expect(resolveQueryStreamExecutor("ws")).toBe(executeQueryStreamWs);
  });
});

describe("useMessageActions temporary pin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    state.transportMode = "ws";
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

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_TEMPORARY_PINNED_AGENT_KEY",
      agentKey: "",
    });
    expect(executeQueryStreamWs).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          owner: { kind: "agent", agentKey: "agent-coder" },
          message: "hello",
        }),
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
    state.transportMode = "ws";
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

    expect(executeQueryStreamWs).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TIMELINE_NODE" }),
    );
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
