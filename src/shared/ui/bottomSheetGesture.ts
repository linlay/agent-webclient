/**
 * Bottom sheet 下拉关闭手势的纯逻辑：只负责判定，不碰 DOM 事件与动画，
 * 方便在 jsdom 里直接验证阈值和方向规则。
 */

/** 手指必须先竖着往下走一段，手势才接管这次触摸。 */
export const SHEET_DRAG_SLOP_PX = 6;
/** 超过面板高度的这个比例，松手即关闭。 */
export const SHEET_DISMISS_HEIGHT_RATIO = 0.28;
/** 再短的下拉，只要够快也会关闭。 */
export const SHEET_DISMISS_MIN_PX = 84;
/** 快速下滑的判定线（px/ms）：约 550px/s。 */
export const SHEET_DISMISS_VELOCITY = 0.55;

export interface SheetDragState {
  /** 手指累计下拉距离，向上为负。 */
  offset: number;
  /** 最近一次采样的向下速度（px/ms）。 */
  velocity: number;
  /** 面板当前高度。 */
  height: number;
}

/** 松手时是否应该关闭面板。 */
export function shouldDismissSheet({ offset, velocity, height }: SheetDragState): boolean {
  if (offset <= 0) return false;
  const distance = Math.max(SHEET_DISMISS_MIN_PX, height * SHEET_DISMISS_HEIGHT_RATIO);
  return offset >= distance || velocity >= SHEET_DISMISS_VELOCITY;
}

/** 这次触摸是否该由面板接管：必须是向下、竖直、且菜单已经回到顶部。 */
export function isSheetDragCandidate(input: {
  dx: number;
  dy: number;
  scrollTop: number;
}): boolean {
  const { dx, dy, scrollTop } = input;
  if (dy < SHEET_DRAG_SLOP_PX) return false;
  if (Math.abs(dx) > dy) return false;
  return scrollTop <= 0;
}

/**
 * 面板内最近的可纵向滚动容器。下拉手势只在它贴顶时才接管，
 * 否则把这次触摸完整交还给菜单自身的滚动。
 */
export function findSheetScrollParent(
  target: Element | null,
  boundary: HTMLElement,
): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    if (node.scrollHeight > node.clientHeight + 2) {
      const { overflowY } = window.getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}
