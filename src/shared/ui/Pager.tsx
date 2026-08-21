import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface PagerProps {
  /** 当前激活面板索引，超出范围会被自动夹紧 */
  index: number;
  /** 面板列表，按顺序横向排列 */
  panels: React.ReactNode[];
  /** 容器额外 className */
  className?: string;
  /** 单个面板额外 className */
  panelClassName?: string;
  /** 滑动过渡时长（ms） */
  duration?: number;
}

interface PagerPanelState {
  index: number;
  /** 首次挂载时的滑入方向：+1 从右、-1 从左、0 无动画 */
  enterFrom: number;
}

/**
 * 轻量方向性翻页器。
 *
 * - 懒渲染：仅挂载当前面板与过渡中的上一个面板，避免面板过多时一次性渲染全部。
 * - 高度自适应：容器高度通过 ResizeObserver 跟随当前激活面板，不取最高面板。
 * - 方向滑动：index 增大向左滑、减小向右滑，方向由索引差自动决定。
 *
 * 面板采用绝对定位 + translateX（百分比相对面板自身宽 = 容器宽）定位，
 * 由当前激活面板撑起容器高度，其余面板脱离文档流。
 */
export const Pager: React.FC<PagerProps> = ({
  index,
  panels,
  className,
  panelClassName,
  duration = 280,
}) => {
  const total = panels.length;
  const active = total > 0 ? Math.max(0, Math.min(index, total - 1)) : 0;

  const [renderWindow, setRenderWindow] = useState<PagerPanelState[]>(() =>
    total > 0 ? [{ index: active, enterFrom: 0 }] : [],
  );
  const [height, setHeight] = useState<number | undefined>(undefined);
  const activePanelRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(active);

  useEffect(() => {
    const prevActive = prevActiveRef.current;
    if (prevActive === active) {
      return;
    }
    prevActiveRef.current = active;

    const enterFrom = active > prevActive ? 1 : -1;
    setRenderWindow((current) => {
      const kept = current.filter(
        (p) => p.index === prevActive && p.index < total,
      );
      return [...kept, { index: active, enterFrom }];
    });

    const timer = window.setTimeout(() => {
      setRenderWindow([{ index: active, enterFrom: 0 }]);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [active, duration, total]);

  // panels 数量变化时校准窗口，避免残留越界面板
  useEffect(() => {
    setRenderWindow([{ index: active, enterFrom: 0 }]);
    prevActiveRef.current = active;
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = activePanelRef.current;
    if (!el) {
      return;
    }
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, renderWindow]);

  if (total === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height,
      }}
    >
      {renderWindow.map((p) => (
        <PagerPanel
          key={p.index}
          ref={p.index === active ? activePanelRef : undefined}
          className={panelClassName}
          enterFrom={p.enterFrom}
          offset={(p.index - active) * 100}
          duration={duration}
        >
          {panels[p.index]}
        </PagerPanel>
      ))}
    </div>
  );
};

Pager.displayName = "Pager";

interface PagerPanelProps {
  className?: string;
  /** 首次挂载时的滑入起点：+1 从右、-1 从左、0 无动画 */
  enterFrom: number;
  /** 相对激活面板的横向偏移（百分比，负值向左） */
  offset: number;
  duration: number;
  children: React.ReactNode;
}

const PagerPanel = React.forwardRef<HTMLDivElement, PagerPanelProps>(
  ({ className, enterFrom, offset, duration, children }, ref) => {
    const [settled, setSettled] = useState(enterFrom === 0);

    useLayoutEffect(() => {
      if (settled) {
        return;
      }
      const raf = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(raf);
    }, [settled]);

    const translateX = settled ? offset : enterFrom * 100;

    return (
      <div
        ref={ref}
        className={className}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateX(${translateX}%)`,
          transition: settled ? `transform ${duration}ms ease` : "none",
        }}
      >
        {children}
      </div>
    );
  },
);

PagerPanel.displayName = "PagerPanel";
