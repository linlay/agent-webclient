import React from "react";
import { Button, Flex, Input, InputNumber, Popover, Select, Spin } from "antd";
import type { ArchivedSummaryResponse } from "@/shared/data";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

const BULK_DAY_OPTIONS = [7, 30, 90, 180, 365];

export interface ArchiveListPaneProps {
  query: string;
  onQueryChange: (value: string) => void;
  showAgentFilter: boolean;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  bulkDays: number;
  onBulkDaysChange: (value: number) => void;
  bulkCandidateCount: number;
  onBulkArchive: () => void;
  resultText: string;
  loading: boolean;
  items: ArchivedSummaryResponse[];
  selectedChatId: string;
  onSelect: (chatId: string) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
}

export const ArchiveListPane: React.FC<ArchiveListPaneProps> = (props) => (
  <section className="archive-modal-list-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3">
    <div className="archive-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:[&_.ant-input-affix-wrapper]:min-w-0 tw:[&_.ant-input-prefix]:mr-1.5 tw:[&_.ant-input-prefix]:text-ink-muted">
      <Input
        prefix={<MaterialIcon name="search" />}
        value={props.query}
        placeholder={t("archive.search.placeholder")}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      {props.showAgentFilter ? (
        <Input
          prefix={<MaterialIcon name="person_search" />}
          value={props.agentFilter}
          placeholder={t("archive.filter.agentPlaceholder")}
          onChange={(event) => props.onAgentFilterChange(event.target.value)}
          allowClear
          className="archive-agent-filter-input tw:w-40 tw:flex-none"
        />
      ) : null}
      <Popover
        trigger="click"
        placement="bottomRight"
        content={(
          <div className="archive-bulk-panel tw:min-w-80 tw:py-1">
            <Flex gap={8} align="center" wrap="wrap">
              <span className="archive-bulk-label tw:text-xs tw:text-ink-muted">{t("archive.bulk.label")}</span>
              <Select
                value={props.bulkDays}
                style={{ width: 116 }}
                options={BULK_DAY_OPTIONS.map((days) => ({
                  value: days,
                  label: t("archive.bulk.days", { days }),
                }))}
                onChange={props.onBulkDaysChange}
              />
              <InputNumber
                min={1}
                max={3650}
                value={props.bulkDays}
                onChange={(value) => props.onBulkDaysChange(Number(value) || 30)}
                addonAfter={t("archive.bulk.dayUnit")}
                style={{ width: 132 }}
              />
              <UiButton
                size="sm"
                variant="primary"
                disabled={props.bulkCandidateCount === 0}
                onClick={props.onBulkArchive}
              >
                {t("archive.bulk.button", { count: props.bulkCandidateCount })}
              </UiButton>
            </Flex>
          </div>
        )}
      >
        <button type="button" className="archive-bulk-trigger tw:relative tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-1 tw:rounded-control tw:border tw:px-2 tw:py-1 tw:text-lg tw:text-text-muted tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:hover:bg-[color-mix(in_srgb,var(--bg-hover)_60%,transparent)] tw:hover:text-ink-1">
          <MaterialIcon name="archive" />
          {props.bulkCandidateCount > 0 ? (
            <span className="archive-bulk-badge tw:absolute tw:-right-1.5 tw:-top-1 tw:flex tw:h-4 tw:min-w-4 tw:items-center tw:justify-center tw:rounded-pill tw:bg-accent-electric tw:px-1 tw:text-[10px] tw:font-bold tw:leading-none tw:text-white">
              {props.bulkCandidateCount}
            </span>
          ) : null}
        </button>
      </Popover>
    </div>
    {props.resultText ? (
      <div className="archive-result-bar tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-ink-muted">
        {props.resultText}
      </div>
    ) : null}
    <Spin spinning={props.loading}>
      <div className="archive-list tw:flex tw:min-h-0 tw:max-h-[430px] tw:flex-col tw:gap-1 tw:overflow-auto tw:pr-1" role="listbox" aria-label={t("archive.list.ariaLabel")}>
        {props.items.length === 0 ? (
          <div className="command-empty-state">{t("archive.empty.list")}</div>
        ) : props.items.map((item) => (
          <button
            key={item.chatId}
            type="button"
            className={`archive-list-item tw:w-full tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:px-3 tw:py-[11px] tw:text-left tw:text-ink-1 tw:hover:bg-bg-base tw:[&.is-active]:bg-bg-base ${item.chatId === props.selectedChatId ? "is-active" : ""}`}
            onClick={() => props.onSelect(item.chatId)}
          >
            <span className="archive-list-item-head tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:[&>span]:flex-none tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:whitespace-nowrap tw:[&>strong]:text-[13px]">
              <strong>{item.chatName || item.chatId}</strong>
            </span>
            <span className="archive-list-meta tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-1.5 tw:gap-y-1.5">
              {item.agentKey ? <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{item.agentKey}</span> : null}
              <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.item.created")}: {formatChatTimeLabel(item.createdAt)}</span>
              <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.item.lastRun")}: {formatChatTimeLabel(item.lastRunAt)}</span>
              <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.detail.archivedAt", { time: formatChatTimeLabel(item.archivedAt) })}</span>
            </span>
          </button>
        ))}
      </div>
    </Spin>
    {props.canLoadMore ? (
      <Button block onClick={props.onLoadMore}>{t("archive.action.loadMore")}</Button>
    ) : null}
  </section>
);
