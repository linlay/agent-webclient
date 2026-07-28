import React, { memo } from "react";
import Style from "./index.module.css";

export interface DotLoadingProps {
  /** 圆点颜色，支持 'default' | 'primary' 或自定义 CSS 颜色值 */
  color?: "default" | "primary" | string;
}

const colorMap: Record<string, string> = {
  default: "var(--text-sub, #999)",
  primary: "var(--accent, #1677ff)",
};

export const DotLoading = memo<DotLoadingProps>(({ color = "default" }) => {
  const resolvedColor = colorMap[color] ?? color;

  return (
    <span
      className={Style.DotLoading}
      style={{ color: resolvedColor }}
      role="img"
      aria-label="加载中"
    >
      <svg height="1em" viewBox="0 0 100 40" className={Style.Svg}>
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            fill="currentColor"
            x={20 + i * 26}
            y="16"
            width="8"
            height="8"
            rx="2"
          >
            <animate
              attributeName="y"
              from="16"
              to="16"
              dur="2s"
              begin={`${i * 0.2}s`}
              repeatCount="indefinite"
              values="16; 6; 26; 16; 16"
              keyTimes="0; 0.1; 0.3; 0.4; 1"
            />
          </rect>
        ))}
      </svg>
    </span>
  );
});

DotLoading.displayName = "DotLoading";
