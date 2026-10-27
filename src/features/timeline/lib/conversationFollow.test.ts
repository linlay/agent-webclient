import {
  CONVERSATION_AT_BOTTOM_THRESHOLD_PX,
  isWithinConversationFollowThreshold,
  resolveConversationFollowIntent,
  shouldPinConversationToBottom,
} from "./conversationFollow";

describe("isWithinConversationFollowThreshold", () => {
  it("treats the configured tolerance as still following the bottom", () => {
    const distance = CONVERSATION_AT_BOTTOM_THRESHOLD_PX;
    expect(
      isWithinConversationFollowThreshold({
        scrollHeight: 2_200,
        clientHeight: 600,
        scrollTop: 1_600 - distance,
      }),
    ).toBe(true);
    expect(
      isWithinConversationFollowThreshold({
        scrollHeight: 2_200,
        clientHeight: 600,
        scrollTop: 1_600 - distance - 1,
      }),
    ).toBe(false);
  });
});

describe("conversation follow intent", () => {
  it("always follows when the viewport is at the bottom", () => {
    expect(
      resolveConversationFollowIntent({
        following: false,
        atBottom: true,
        scrollTop: 0,
        previousScrollTop: 900,
      }),
    ).toBe(true);
  });

  it("keeps following when content growth moves the bottom without a scroll", () => {
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: false,
        scrollTop: 1_000,
        previousScrollTop: 1_000,
      }),
    ).toBe(true);
  });

  it("stops following on an upward user scroll", () => {
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: false,
        scrollTop: 200,
        previousScrollTop: 1_000,
      }),
    ).toBe(false);
  });

  it("does not treat a downward scroll as leaving the bottom", () => {
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: false,
        scrollTop: 1_200,
        previousScrollTop: 1_000,
      }),
    ).toBe(true);
  });
});

describe("shouldPinConversationToBottom", () => {
  it("pins only while following, ready and not restoring", () => {
    expect(
      shouldPinConversationToBottom({
        following: true,
        restorationReady: true,
        restoring: false,
      }),
    ).toBe(true);
    for (const blocked of [
      { following: false, restorationReady: true, restoring: false },
      { following: true, restorationReady: false, restoring: false },
      { following: true, restorationReady: true, restoring: true },
    ]) {
      expect(shouldPinConversationToBottom(blocked)).toBe(false);
    }
  });
});
