import React, { useMemo } from 'react';
import { Flex } from 'antd';
import { useI18n } from '@/shared/i18n';

interface SourceScoreProps {
  score: number;
}
export const SourceScore: React.FC<SourceScoreProps> = (props) => {
  const { t } = useI18n();
  const { score } = props;
  const scoreMemo = useMemo(() => {
    const val = score || 0;
    return Math.round(val * 100) / 100;
  }, [score]);
  return (
    <Flex
      className="tw:relative tw:min-w-[82px] tw:overflow-hidden tw:whitespace-nowrap tw:rounded-[4px] tw:border tw:border-[var(--colorPrimaryBgHover,#d4ebff)] tw:px-1 tw:leading-[20px] tw:text-[var(--colorPrimaryActive,#1e66d9)]"
      align="center"
      justify="center"
    >
      <div
        className="tw:absolute tw:inset-y-0 tw:left-0 tw:border-r tw:border-[var(--colorPrimary,#3087ff)] tw:bg-[var(--colorPrimaryBgHover,#d4ebff)]"
        style={{ width: scoreMemo * 100 + '%' }}
      ></div>
      <strong className="tw:relative tw:z-10 tw:text-xs">{t("timeline.source.score", { score: scoreMemo?.toFixed(2) })}</strong>
    </Flex>
  );
};
