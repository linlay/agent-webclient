import {
  canSendToTargetChat,
  resolveQueryStreamExecutor,
  syncLiveSessionTerminalState,
} from "@/features/composer/hooks/useMessageActions";
import { executeQueryStreamSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";

jest.mock("@/features/transport/lib/queryStreamRuntime.sse", () => ({
  executeQueryStreamSse: jest.fn(),
}));

jest.mock("@/features/transport/lib/queryStreamRuntime.ws", () => ({
  executeQueryStreamWs: jest.fn(),
}));

describe("resolveQueryStreamExecutor", () => {
  it("returns the sse executor for sse mode", () => {
    expect(resolveQueryStreamExecutor("sse")).toBe(executeQueryStreamSse);
  });

  it("returns the ws executor for ws mode", () => {
    expect(resolveQueryStreamExecutor("ws")).toBe(executeQueryStreamWs);
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
