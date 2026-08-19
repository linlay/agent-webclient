import type { AgentEvent } from "@/app/state/types";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import {
  chatSurfaceReplayErrorCode,
  classifyChatSurfaceEvent,
  decideChatSurfaceReplayRecovery,
  resolveChatSurfaceOwner,
  shouldReloadChatSurfaceOnLifecycle,
} from "@/features/surfaces/useChatSurfaceReplay";
import { ApiError } from "@/shared/data";

describe("standalone Overview/Debug live replay policy", () => {
  const event = (values: Record<string, unknown>): AgentEvent => ({
    type: "content.snapshot",
    timestamp: 1_710_000_000_000,
    ...values,
  } as AgentEvent);

  it("deduplicates sequence numbers and rejects events from other runs", () => {
    expect(classifyChatSurfaceEvent({
      event: event({ chatId: "chat_1", runId: "run_1", seq: 8 }),
      chatId: "chat_1",
      runId: "run_1",
      lastSeq: 8,
    })).toEqual({ action: "ignore", nextSeq: 8 });
    expect(classifyChatSurfaceEvent({
      event: event({ chatId: "chat_1", runId: "run_2", seq: 9 }),
      chatId: "chat_1",
      runId: "run_1",
      lastSeq: 8,
    })).toEqual({ action: "ignore", nextSeq: 8 });
  });

  it("applies the next event and reloads the chat snapshot on a gap", () => {
    expect(classifyChatSurfaceEvent({
      event: event({ chatId: "chat_1", runId: "run_1", seq: 9 }),
      chatId: "chat_1",
      runId: "run_1",
      lastSeq: 8,
    })).toEqual({ action: "apply", nextSeq: 9 });
    expect(classifyChatSurfaceEvent({
      event: event({ chatId: "chat_1", runId: "run_1", seq: 11 }),
      chatId: "chat_1",
      runId: "run_1",
      lastSeq: 8,
    })).toEqual({ action: "reload", nextSeq: 8 });
  });

  it("reloads Desktop replay-only surfaces only after hidden becomes active", () => {
    expect(shouldReloadChatSurfaceOnLifecycle(null, true)).toBe(false);
    expect(shouldReloadChatSurfaceOnLifecycle(true, false)).toBe(false);
    expect(shouldReloadChatSurfaceOnLifecycle(false, false)).toBe(false);
    expect(shouldReloadChatSurfaceOnLifecycle(false, true)).toBe(true);
  });

  it("recognizes replay recovery codes from transport and API errors", () => {
    expect(chatSurfaceReplayErrorCode(new RealtimeTransportError(
      "replay_required",
      "reload",
    ))).toBe("replay_required");
    expect(chatSurfaceReplayErrorCode(new ApiError("expired", {
      code: "seq_expired",
    }))).toBe("seq_expired");
    expect(chatSurfaceReplayErrorCode(new ApiError("expired", {
      code: 400,
      platformError: {
        code: "seq_expired",
        category: null,
        scope: null,
        status: 400,
        retryable: true,
        message: "expired",
        diagnostics: null,
        raw: null,
        technicalText: "expired",
      },
    }))).toBe("seq_expired");
  });

  it("allows one replay recovery per binding generation", () => {
    const cause = new ApiError("expired", { code: "seq_expired" });
    const first = decideChatSurfaceReplayRecovery({
      cause,
      bindingKey: "0:chat-1:run-1",
      attemptedBindingKey: "",
    });
    expect(first).toEqual({
      recover: true,
      attemptedBindingKey: "0:chat-1:run-1",
    });
    expect(decideChatSurfaceReplayRecovery({
      cause,
      bindingKey: "0:chat-1:run-1",
      attemptedBindingKey: first.attemptedBindingKey,
    })).toEqual({
      recover: false,
      attemptedBindingKey: "0:chat-1:run-1",
    });
    expect(decideChatSurfaceReplayRecovery({
      cause,
      bindingKey: "1:chat-1:run-1",
      attemptedBindingKey: first.attemptedBindingKey,
    }).recover).toBe(true);
    expect(decideChatSurfaceReplayRecovery({
      cause: new RealtimeTransportError("replay_required", "reload"),
      bindingKey: "0:chat-1:run-2",
      attemptedBindingKey: "",
    }).recover).toBe(true);
    expect(decideChatSurfaceReplayRecovery({
      cause: new ApiError("denied", { code: "capability_denied" }),
      bindingKey: "1:chat-1:run-1",
      attemptedBindingKey: "",
    }).recover).toBe(false);
  });

  it("recovers a completed chat owner from the newest persisted run", () => {
    expect(resolveChatSurfaceOwner({
      chatId: "chat_1",
      runs: [
        { runId: "run_2", agentKey: "agent-latest" },
        { runId: "run_1", agentKey: "agent-old" },
      ],
    }, null)).toEqual({ kind: "agent", agentKey: "agent-latest" });
  });

  it("keeps active and team ownership ahead of completed-run fallbacks", () => {
    expect(resolveChatSurfaceOwner({
      runs: [{ runId: "run_1", agentKey: "agent-old" }],
    }, {
      runId: "run_live",
      agentKey: "agent-live",
    })).toEqual({ kind: "agent", agentKey: "agent-live" });

    expect(resolveChatSurfaceOwner({
      runs: [{ runId: "run_team", agentKey: "member", teamId: "team-1" }],
    }, null)).toEqual({ kind: "orchestrated-team", teamId: "team-1" });
  });
});
