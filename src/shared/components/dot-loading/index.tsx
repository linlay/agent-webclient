import React, { memo } from "react";
import Style from "./index.module.css";

export interface DotLoadingProps {
  /** 圆点颜色，支持 'default' | 'primary' 或自定义 CSS 颜色值 */
  color?: "default" | "primary" | string;
  height?: React.CSSProperties["height"];
  className?: string;
}

const colorMap: Record<string, string> = {
  default: "var(--text-sub, #999)",
  primary: "var(--accent, #1677ff)",
};

export const DotLoading = memo<DotLoadingProps>(
  ({ color = "default", height = "18px", className }) => {
    const resolvedColor = colorMap[color] ?? color;

    return (
      <span
        className={`${Style.DotLoading} ${className}`}
        style={{ color: resolvedColor }}
        role="img"
        aria-label="加载中"
      >
        <svg height={height} viewBox="0 0 84 40" className={Style.Svg}>
          {[0, 1, 2].map((i) => (
            <circle key={i} fill="currentColor" cx={22 + i * 20} cy="22" r="6">
              <animate
                attributeName="cy"
                from="22"
                to="22"
                dur="2s"
                begin={`${i * 0.2}s`}
                repeatCount="indefinite"
                values="22; 12; 32; 22; 22"
                keyTimes="0; 0.1; 0.3; 0.4; 1"
              />
            </circle>
          ))}
        </svg>
      </span>
    );
  },
);

DotLoading.displayName = "DotLoading";
