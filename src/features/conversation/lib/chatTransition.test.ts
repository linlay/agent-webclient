import type { ChatTransition } from "@/features/conversation/lib/conversationState";
import {
  isChatTransitionBlockingInteractions,
  isChatTransitionPending,
} from "@/features/conversation/lib/chatTransition";

function createTransition(
  overrides: Partial<ChatTransition> = {},
): ChatTransition {
  return {
    seq: 1,
    sourceChatId: "chat-source",
    targetChatId: "chat-target",
    phase: "loading",
    kind: "history-switch",
    displayMode: "blocking",
    focusComposerOnReady: false,
    error: "",
    ...overrides,
  };
}

describe("chat transition display mode", () => {
  it("blocks interactions for pending history transitions", () => {
    const transition = createTransition();

    expect(isChatTransitionPending(transition)).toBe(true);
    expect(isChatTransitionBlockingInteractions(transition)).toBe(true);
  });

  it("keeps active-run background restoration interactive", () => {
    expect(isChatTransitionBlockingInteractions(createTransition({
      displayMode: "background",
    }))).toBe(false);
    expect(isChatTransitionBlockingInteractions(createTransition({
      phase: "restoring",
      displayMode: "background",
    }))).toBe(false);
  });

  it("always blocks a transition error", () => {
    expect(isChatTransitionBlockingInteractions(createTransition({
      phase: "error",
      displayMode: "background",
      error: "history failed",
    }))).toBe(true);
  });
});
