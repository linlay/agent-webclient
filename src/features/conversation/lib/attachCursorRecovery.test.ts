import {
  ATTACH_CURSOR_RECOVERY_DELAYS_MS,
  createAttachCursorRecovery,
  isAttachCursorExpired,
} from "@/features/conversation/lib/attachCursorRecovery";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";

function createHarness(currentChatId = "chat-1") {
  const timers: Array<{ callback: () => void; delayMs: number; cleared: boolean }> = [];
  const reloads: string[] = [];
  const state = { currentChatId };
  const recovery = createAttachCursorRecovery({
    reload: (chatId) => reloads.push(chatId),
    isCurrentChat: (chatId) => chatId === state.currentChatId,
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as { cleared: boolean }).cleared = true;
    },
  });
  const fireLatest = () => {
    const timer = timers.at(-1)!;
    if (!timer.cleared) timer.callback();
  };
  return { recovery, timers, reloads, state, fireLatest };
}

test("recognizes expired attach cursors from transport and platform errors", () => {
  expect(isAttachCursorExpired(new RealtimeTransportError("seq_expired", "expired"))).toBe(true);
  expect(isAttachCursorExpired({ code: "replay_required" })).toBe(true);
  expect(isAttachCursorExpired({ platformError: { code: "seq_expired" } })).toBe(true);
  expect(isAttachCursorExpired(new RealtimeTransportError("WS_DISCONNECTED", "disconnected"))).toBe(false);
  expect(isAttachCursorExpired(undefined)).toBe(false);
});

test("reloads the current Chat after an expired cursor and backs off while it keeps expiring", () => {
  const h = createHarness();
  h.recovery.expired("chat-1", "run-1");
  expect(h.timers[0].delayMs).toBe(ATTACH_CURSOR_RECOVERY_DELAYS_MS[0]);
  h.fireLatest();
  expect(h.reloads).toEqual(["chat-1"]);

  h.recovery.expired("chat-1", "run-1");
  h.recovery.expired("chat-1", "run-1");
  expect(h.timers.map((timer) => timer.delayMs)).toEqual([2_000, 4_000, 8_000]);
  for (let attempt = 0; attempt < 5; attempt += 1) h.recovery.expired("chat-1", "run-1");
  expect(h.timers.at(-1)!.delayMs).toBe(30_000);
});

test("a confirmation request reloads immediately instead of waiting for the backoff", () => {
  const h = createHarness();
  h.recovery.expired("chat-1", "run-1");
  h.recovery.nudge("chat-other");
  expect(h.reloads).toEqual([]);
  h.recovery.nudge("chat-1");
  expect(h.reloads).toEqual(["chat-1"]);
  expect(h.timers[0].cleared).toBe(true);
  // Nothing is scheduled any more, so later asks do not reload a healthy attach.
  h.recovery.nudge("chat-1");
  expect(h.reloads).toEqual(["chat-1"]);
});

test("leaving the Chat abandons the pending recovery", () => {
  const h = createHarness();
  h.recovery.expired("chat-1", "run-1");
  h.state.currentChatId = "chat-2";
  h.fireLatest();
  expect(h.reloads).toEqual([]);
  h.recovery.nudge("chat-1");
  expect(h.reloads).toEqual([]);
});

test("a different Run restarts the backoff and cancel clears the timer", () => {
  const h = createHarness();
  h.recovery.expired("chat-1", "run-1");
  h.recovery.expired("chat-1", "run-1");
  h.recovery.expired("chat-1", "run-2");
  expect(h.timers.at(-1)!.delayMs).toBe(2_000);
  h.recovery.cancel();
  expect(h.timers.at(-1)!.cleared).toBe(true);
});
