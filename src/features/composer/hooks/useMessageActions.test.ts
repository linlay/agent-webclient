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

jest.mock("@/features/timeline/hooks/useAgentEventHandler", () => ({
  useAgentEventHandler: jest.fn(() => ({ handleEvent: jest.fn() })),
}));

jest.mock("@/features/voice/lib/voiceRuntime", () => ({
  getVoiceRuntime: jest.fn(() => ({
    resetVoiceRuntime: jest.fn(),
    stopAllVoiceSessions: jest.fn(),
  })),
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
      actions = useMessageActions();
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
          agentKey: "agent-coder",
          message: "hello",
        }),
      }),
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
      stateStreaming: true,
    });

    expect(allowed).toBe(false);
    expect(session.streaming).toBe(true);
  });

  it("recovers from stale live-session streaming state after the run has already ended", () => {
    const session = {
      streaming: true,
      abortController: new AbortController(),
      chatId: "chat_1",
    };

    const allowed = canSendToTargetChat({
      currentActiveSession: session,
      currentStateChatId: "chat_1",
      targetChatId: "chat_1",
      stateStreaming: false,
    });

    expect(allowed).toBe(true);
    expect(session.streaming).toBe(false);
    expect(session.abortController).toBeNull();
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
