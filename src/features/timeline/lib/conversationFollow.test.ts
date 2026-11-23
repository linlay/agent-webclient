import {
  CONVERSATION_AT_BOTTOM_THRESHOLD_PX,
  CONVERSATION_SCROLL_USER_ACCUM_PX,
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

  it("stops following once slow touch scrolling accumulates enough distance", () => {
    // 触摸滚动每帧只有不到 1px：单帧差值过不了阈值，只能靠累计位移。
    let accumulated = 0;
    for (let index = 0; index < 8; index += 1) {
      accumulated += 0.5;
      expect(
        resolveConversationFollowIntent({
          following: true,
          atBottom: false,
          scrollTop: 1_600 - accumulated,
          previousScrollTop: 1_600 - accumulated + 0.5,
          scrollUpDistancePx: accumulated,
        }),
      ).toBe(accumulated >= CONVERSATION_SCROLL_USER_ACCUM_PX ? false : true);
    }
  });

  it("leaves the bottom when the user nudges up past the accumulated tolerance", () => {
    // 还在 24px 容差内，但已经真实上滚，不能再被“就在底部”吞掉。
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: true,
        scrollTop: 1_590,
        previousScrollTop: 1_590,
        scrollUpDistancePx: CONVERSATION_SCROLL_USER_ACCUM_PX,
      }),
    ).toBe(false);
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: true,
        scrollTop: 1_590,
        previousScrollTop: 1_590,
        scrollUpDistancePx: CONVERSATION_SCROLL_USER_ACCUM_PX - 1,
      }),
    ).toBe(true);
  });

  it("does not treat a downward scroll as leaving the bottom", () => {
    expect(
      resolveConversationFollowIntent({
        following: true,
        atBottom: false,
        scrollTop: 1_200,
        previousScrollTop: 1_000,
        scrollUpDistancePx: 0,
      }),
    ).toBe(true);
  });
});

describe("shouldPinConversationToBottom", () => {
  it("pins only while following, ready, idle and not restoring", () => {
    expect(
      shouldPinConversationToBottom({
        following: true,
        restorationReady: true,
        restoring: false,
        userGestureActive: false,
      }),
    ).toBe(true);
    for (const blocked of [
      { following: false, restorationReady: true, restoring: false, userGestureActive: false },
      { following: true, restorationReady: false, restoring: false, userGestureActive: false },
      { following: true, restorationReady: true, restoring: true, userGestureActive: false },
      { following: true, restorationReady: true, restoring: false, userGestureActive: true },
    ]) {
      expect(shouldPinConversationToBottom(blocked)).toBe(false);
    }
  });
});
