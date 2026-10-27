/**
 * 主对话“贴底跟随”的纯决策。
 *
 * Virtuoso 的 followOutput 只在条目数量变化时求值，流式回答是最后一条自己长高，
 * 因此高度增长必须由 totalListHeightChanged 单独触发重贴底。这里抽出的规则：
 * - 真正处于底部时总是恢复跟随；
 * - 只有用户向上滚动才是退出跟随的信号；
 * - 内容变高、视口变矮导致的“不在底部”不退出跟随，否则第一次生长就会关掉跟随。
 */

/** 主对话判定“贴底”的容差。比旧值 100px 小，避免差几十像素也被当作已到底。 */
export const CONVERSATION_AT_BOTTOM_THRESHOLD_PX = 24;

/** 用户滚动与程序化贴底之间的判定容差。 */
export const CONVERSATION_SCROLL_USER_DELTA_PX = 1;

/** 显式“回到底部”的平滑动画结束后，用 auto 校正残余误差。 */
export const CONVERSATION_SCROLL_SETTLE_DELAY_MS = 500;

/**
 * 内容生长先把视口顶离底部、下一帧贴底又会回到 atBottom=true。
 * 按钮延后这么久再出现，避免流式输出时每个 chunk 都闪一下。
 */
export const CONVERSATION_SCROLL_BUTTON_REVEAL_DELAY_MS = 250;

/** 滚动事件里判断“仍在跟随区间”：和 atBottomThreshold 使用同一容差。 */
export function isWithinConversationFollowThreshold(input: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}): boolean {
  const maximumScrollTop = Math.max(
    0,
    input.scrollHeight - input.clientHeight,
  );
  return (
    maximumScrollTop - input.scrollTop <= CONVERSATION_AT_BOTTOM_THRESHOLD_PX
  );
}

export function resolveConversationFollowIntent(input: {
  following: boolean;
  atBottom: boolean;
  scrollTop: number;
  previousScrollTop: number;
}): boolean {
  if (input.atBottom) return true;
  if (
    input.scrollTop <
    input.previousScrollTop - CONVERSATION_SCROLL_USER_DELTA_PX
  ) {
    return false;
  }
  return input.following;
}

export function shouldPinConversationToBottom(input: {
  following: boolean;
  restorationReady: boolean;
  restoring: boolean;
}): boolean {
  return input.following && input.restorationReady && !input.restoring;
}
