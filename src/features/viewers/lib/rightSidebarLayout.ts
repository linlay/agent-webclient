export const RIGHT_SIDEBAR_MIN_WIDTH = 280;
export const RIGHT_SIDEBAR_MAIN_MIN_WIDTH = 420;
export const RIGHT_SIDEBAR_COLLAPSED_MAIN_GAP = 6;
export const RIGHT_SIDEBAR_COLLAPSE_DRAG_BUFFER = 96;

/** Match Desktop's minimum-chat-width stop and buffered collapse. */
export function clampRightSidebarLayoutWidth(width: number, maxWidth: number): number {
  const clamped = Math.min(Math.max(Math.round(width), RIGHT_SIDEBAR_MIN_WIDTH), maxWidth);
  const normalMax = maxWidth + RIGHT_SIDEBAR_COLLAPSED_MAIN_GAP - RIGHT_SIDEBAR_MAIN_MIN_WIDTH;
  if (clamped > normalMax) {
    if (normalMax >= RIGHT_SIDEBAR_MIN_WIDTH && clamped < normalMax + RIGHT_SIDEBAR_COLLAPSE_DRAG_BUFFER) return normalMax;
    return maxWidth;
  }
  return clamped;
}

export function rightSidebarWidthFromDrag(initialWidth: number, delta: number, maxWidth: number): number {
  const start = delta < 0 && initialWidth >= maxWidth
    ? Math.max(RIGHT_SIDEBAR_MIN_WIDTH, maxWidth + RIGHT_SIDEBAR_COLLAPSED_MAIN_GAP - RIGHT_SIDEBAR_MAIN_MIN_WIDTH)
    : initialWidth;
  return start + delta;
}
