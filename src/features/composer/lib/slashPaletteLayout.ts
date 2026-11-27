/**
 * Slash 浮层朝输入框上方展开（placement: topLeft），底边锚在 Composer 顶端：
 * 它能用的高度只由「锚点顶边到视口顶边」决定，跟视口高度没有固定关系。
 *
 * 早年用 `min(360px, calc(100vh - 120px))` 估算：120px 只够覆盖折叠态输入框
 * （84px + 10px 外边距 + 底部留白），浮层真正需要的空间随会话区高度变化。
 * 窗口矮时 100vh - 120 会大于输入框上方的真实空间，浮层就顶出视口被裁掉，
 * 所以这里改成用锚点的实际位置算上限。
 */
export const SLASH_POPOVER_MAX_HEIGHT = 360;

/** 与 Popover 的 `calc(100vw - 24px)` 保持一致，四周各留 12px。 */
export const SLASH_POPOVER_VIEWPORT_MARGIN = 12;

/**
 * 极矮窗口下仍保留的最小高度：低于这个值时保持可滚动的最小面板，
 * 交回 antd 的 autoAdjustOverflow 决定是否翻转到下方，避免面板高度被算成 0 而不可见。
 */
export const SLASH_POPOVER_MIN_HEIGHT = 96;

/**
 * @param anchorTop 浮层锚点（Composer 顶边）的视口坐标，取自 getBoundingClientRect().top。
 */
export function getSlashPopoverMaxHeight(
  anchorTop: number,
  margin = SLASH_POPOVER_VIEWPORT_MARGIN,
): number {
  if (!Number.isFinite(anchorTop)) {
    return SLASH_POPOVER_MAX_HEIGHT;
  }
  const available = anchorTop - margin;
  if (available <= SLASH_POPOVER_MIN_HEIGHT) {
    return SLASH_POPOVER_MIN_HEIGHT;
  }
  return Math.min(SLASH_POPOVER_MAX_HEIGHT, available);
}
