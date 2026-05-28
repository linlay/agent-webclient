import React from 'react';
import Style from './index.module.css';

interface SkeletonProps {
  active?: boolean;
  text: string;
  style?: React.CSSProperties;
}
export const Skeleton: React.FC<SkeletonProps> = ({ active, text, style }) => {
  return active ? (
    <div className={Style.Skeleton} style={style}>
      {text}
    </div>
  ) : null;
};
