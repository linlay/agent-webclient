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

/**
 * 单帧位移容差只适合滚轮/拖滚动条这类大跳变；手机触摸把一次上滑拆成很多
 * 零点几像素的 scroll 事件，单帧差值永远跨不过 1px。累计上移超过这个距离
 * 仍算用户上滚，避免贴底把用户缓慢攒起的位移反复清零。
 */
export const CONVERSATION_SCROLL_USER_ACCUM_PX = 4;

/** 手指位移超过这个距离才认定为有意的上滑，过滤按住时的轻微抖动。 */
export const CONVERSATION_GESTURE_UP_PX = 4;

/** 手指抬起后留给惯性滚动的时间，期间不自动写 scrollTop。 */
export const CONVERSATION_GESTURE_SETTLE_MS = 600;

/** 显式“回到底部”的平滑动画结束后，用 auto 校正残余误差。 */
export const CONVERSATION_SCROLL_SETTLE_DELAY_MS = 500;

/**
 * 内容生长先把视口顶离底部、下一帧贴底又会回到 atBottom=true。
 * 按钮延后这么久再出现，避免流式输出时每个 chunk 都闪一下。
 */
export const CONVERSATION_SCROLL_BUTTON_REVEAL_DELAY_MS = 250;

/**
 * 用户展开/收起局部区块后的最小免贴底时长。展开期间 Virtuoso 的 atBottom
 * 回调可能还在用旧高度报“仍在底部”，这段时间不恢复贴底，避免刚展开就被
 * 补一帧贴底、把已有内容向上顶走。
 */
export const CONVERSATION_LAYOUT_GUARD_MS = 1200;

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
  /**
   * 自上次向下滚动或程序化贴底以来累计的向上位移（px）。
   * 触摸滚动每帧只有不到 1px，必须靠累计值识别意图。
   */
  scrollUpDistancePx?: number;
}): boolean {
  const scrollUpDistancePx = input.scrollUpDistancePx ?? 0;
  // 容差内的轻微上移不算离开，但真的累计上滚了就不能再被“仍在容差内”吞掉。
  if (input.atBottom) {
    return scrollUpDistancePx < CONVERSATION_SCROLL_USER_ACCUM_PX;
  }
  if (
    input.scrollTop <
    input.previousScrollTop - CONVERSATION_SCROLL_USER_DELTA_PX
  ) {
    return false;
  }
  if (scrollUpDistancePx >= CONVERSATION_SCROLL_USER_ACCUM_PX) {
    return false;
  }
  return input.following;
}

export function shouldPinConversationToBottom(input: {
  following: boolean;
  restorationReady: boolean;
  restoring: boolean;
  /** 手指按住或刚抬起（惯性期）时不写 scrollTop，避免和原生触摸手势互相覆盖。 */
  userGestureActive: boolean;
  /**
   * 用户展开/收起过局部区块、视口暂归用户（直到他重新回到真实底部）。原地
   * 长高不能按“新输出”贴底：贴底会把新增高度全部吃进底部、已有内容整块向上
   * 顶，而不是让内容自然向下延伸。用状态而不是固定时间窗，是为了接住晚到的
   * 高度（工具输出终端、图片、VIEW iframe），避免窗口过期后又贴回底部。
   */
  userLayoutChangeActive?: boolean;
}): boolean {
  if (input.userLayoutChangeActive) return false;
  return (
    input.following &&
    input.restorationReady &&
    !input.restoring &&
    !input.userGestureActive
  );
}
