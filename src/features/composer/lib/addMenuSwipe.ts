/** 移动端二级面板右滑返回一级的判定：只认水平向右且足够远的滑动。 */
export const ADD_MENU_BACK_SWIPE_MIN_PX = 56;
export const ADD_MENU_BACK_SWIPE_HORIZONTAL_RATIO = 1.5;

export function shouldGoBackFromSwipe(input: {
  dx: number;
  dy: number;
  startedInEditable?: boolean;
}): boolean {
  // 输入框内的横向拖动属于选择文本，不能当成返回手势。
  if (input.startedInEditable) return false;
  if (input.dx < ADD_MENU_BACK_SWIPE_MIN_PX) return false;
  return Math.abs(input.dx) >= Math.abs(input.dy) * ADD_MENU_BACK_SWIPE_HORIZONTAL_RATIO;
}
