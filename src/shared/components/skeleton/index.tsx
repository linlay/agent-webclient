import React from 'react';
import Style from './index.module.css';

const SKELETON_CLASS_NAME = [
  Style.Skeleton,
  "tw:inline-block",
  "tw:text-[var(--colorTextTertiary,rgba(0,0,0,0.45))]",
  "tw:bg-[linear-gradient(90deg,var(--colorTextTertiary,rgba(0,0,0,0.45))_25%,var(--colorText,rgba(0,0,0,0.88))_50%,var(--colorTextTertiary,rgba(0,0,0,0.45))_75%)]",
  "tw:bg-[length:200%_100%]",
  "tw:bg-clip-text",
  "tw:[-webkit-text-fill-color:transparent]",
].join(" ");

interface SkeletonProps {
  active?: boolean;
  text: string;
  style?: React.CSSProperties;
}
export const Skeleton: React.FC<SkeletonProps> = ({ active, text, style }) => {
  return active ? (
    <div className={SKELETON_CLASS_NAME} style={style}>
      {text}
    </div>
  ) : null;
};
