import React, { useMemo } from 'react';
import Style from './index.module.css';
import { Flex } from 'antd';

interface SourceScoreProps {
  score: number;
}
export const SourceScore: React.FC<SourceScoreProps> = (props) => {
  const { score } = props;
  const scoreMemo = useMemo(() => {
    const val = score || 0;
    return Math.round(val * 100) / 100;
  }, [score]);
  return (
    <Flex className={Style.host} align="center" justify="center">
      <div className={Style.progress} style={{ width: scoreMemo * 100 + '%' }}></div>
      <strong className={Style.text}>SCORE {scoreMemo?.toFixed(2)}</strong>
    </Flex>
  );
};
