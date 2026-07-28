import React from 'react';
import Style from './index.module.css';

const SKELETON_CLASS_NAME = [
  Style.Skeleton,
  "tw:inline-block",
  "tw:text-text-muted",
  "tw:bg-[linear-gradient(90deg,var(--text-muted)_25%,var(--text-main)_50%,var(--text-muted)_75%)]",
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
