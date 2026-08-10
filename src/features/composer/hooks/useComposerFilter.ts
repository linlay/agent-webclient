import { useRef } from "react";

export interface UseComposerFilterResult {
  filterText: string;
  /** 筛选范围在 inputValue 中的起始位置（触发字符位置 + 1） */
  startIndex: number;
}

/**
 * 统一的面板筛选逻辑：
 * - 当 open 变为 true 时，记录起始位置 = triggerIndex
 * - filterText = inputValue 从起始位置截取
 * - 选中某项后，调用方用 startIndex 清空 inputValue 的筛选部分
 */
export function useComposerFilter(
  open: boolean,
  inputValue: string,
  triggerIndex?: number,
): UseComposerFilterResult {
  const startRef = useRef(0);
  const wasOpenRef = useRef(false);

  // 渲染时检测 open 由 false → true 的跃迁
  if (open && !wasOpenRef.current) {
    startRef.current = triggerIndex ?? inputValue.length;
  }
  wasOpenRef.current = open;

  const filterText = open ? inputValue.slice(startRef.current) : "";

  return { filterText, startIndex: startRef.current };
}
