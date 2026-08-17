import type { AgentEvent } from "@/app/state/types";
import {
  classifyChatSurfaceEvent,
  shouldReloadChatSurfaceOnLifecycle,
} from "@/features/surfaces/useChatSurfaceReplay";

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
});
