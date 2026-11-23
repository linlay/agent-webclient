/**
 * 时间线条目内的展开/收起（思考、工具、来源、等待、计划正文、长消息…）会让所在
 * 条目原地长高。时间线舞台不在这些组件内部，用这个事件把“这是原地布局变化，
 * 不是新输出”告诉它：舞台据此停止贴底、把视口交给用户，让新增内容自然向下
 * 延伸，而不是被贴底塞进视口底部、把已有内容整块向上顶。
 */
export const LOCAL_LAYOUT_TOGGLE_EVENT = "agent:timeline-local-layout-toggle";

export function notifyLocalLayoutToggle(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_LAYOUT_TOGGLE_EVENT));
}
