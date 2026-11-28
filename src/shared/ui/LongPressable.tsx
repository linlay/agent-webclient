import React from "react";
import { useLongPress } from "./hooks/useLongPress";

/**
 * 让任意列表行接入共享长按手势，并通过 render prop 把事件和 click 吞掉能力交给行本身。
 * 触屏才需要；onLongPress 不传时不会附加任何手势。
 */
export const LongPressable: React.FC<{
  onLongPress?: () => void;
  children: (gesture: ReturnType<typeof useLongPress>) => React.ReactNode;
}> = ({ onLongPress, children }) => {
  const gesture = useLongPress(onLongPress);
  return <>{children(gesture)}</>;
};
