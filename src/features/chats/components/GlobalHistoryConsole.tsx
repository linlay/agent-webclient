import React from "react";
import { Button, DatePicker, Input, Select, Spin } from "antd";
import type { Chat } from "@/app/state/types";
import {
  ALL_HISTORY_OWNERS,
  resolveGlobalHistoryRowText,
  type HistoryOwnerKey,
} from "@/features/chats/lib/globalHistory";
import { useGlobalHistoryRuntime } from "@/features/chats/hooks/useGlobalHistoryRuntime";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

function chatAgentKey(chat: Chat): string {
  return String(chat.agentKey || chat.firstAgentKey || "").trim();
}

interface GlobalHistoryConsoleProps {
  initialOwnerKey: HistoryOwnerKey;
  onOpenChat: (chat: Chat) => void;
}

export const GlobalHistoryConsole: React.FC<GlobalHistoryConsoleProps> = ({
  initialOwnerKey,
  onOpenChat,
}) => {
  const { t } = useI18n();
  const runtime = useGlobalHistoryRuntime(initialOwnerKey);
  const {
    chats, dateRange, error, hasFilters, loading, ownerKey, ownerOptions,
    query, resetFilters, rows, setDateRange, setOwnerKey, setQuery,
  } = runtime;

  return (
    <main className="tw:flex tw:h-screen tw:flex-col tw:bg-bg-base tw:text-ink-1">
      <header className="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-line-soft tw:px-5 tw:py-4">
        <MaterialIcon name="history" />
        <strong>{t("leftSidebar.historyTitle")}</strong>
        <span className="tw:text-xs tw:text-ink-muted">
          {t("history.global.count", { filtered: rows.length, total: chats.length })}
        </span>
      </header>
      <div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:border-b tw:border-line-soft tw:p-4 tw:md:grid-cols-[minmax(220px,1fr)_minmax(220px,320px)_minmax(260px,340px)_auto]">
        <Input
          value={query}
          allowClear
          placeholder={t("history.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          value={ownerKey}
          aria-label={t("history.global.owner.ariaLabel")}
          options={[
            {
              value: ALL_HISTORY_OWNERS,
              label: t("history.global.owner.all"),
            },
            ...ownerOptions.map((option) => ({
              value: option.key,
              label: `${t(`worker.kindLabel.${option.type}`)} · ${option.label}`,
            })),
          ]}
          onChange={(value) => setOwnerKey(value as HistoryOwnerKey)}
        />
        <DatePicker.RangePicker
          value={dateRange}
          allowClear
          format="YYYY-MM-DD"
          aria-label={t("history.global.date.ariaLabel")}
          placeholder={[
            t("history.global.date.start"),
            t("history.global.date.end"),
          ]}
          onChange={(value) =>
            setDateRange(value ? [value[0], value[1]] : null)
          }
        />
        <Button disabled={!hasFilters} onClick={resetFilters}>
          {t("history.global.reset")}
        </Button>
      </div>
      <section className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-4 tw:py-4">
        {loading ? (
          <div className="tw:grid tw:h-full tw:place-items-center">
            <Spin />
          </div>
        ) : null}
        {error ? (
          <div className="system-alert" role="alert">
            {error}
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="command-empty-state">{t("history.global.empty")}</div>
        ) : null}
        <div className="tw:flex tw:flex-col tw:gap-2">
          {rows.map((chat) => {
            const agentKey = chatAgentKey(chat);
            const rowText = resolveGlobalHistoryRowText(chat, {
              title: t("leftSidebar.titleUntitled"),
              lastContent: t("history.noPreview"),
            });
            return (
              <button
                key={chat.chatId}
                type="button"
                disabled={!agentKey}
                className="tw:flex tw:w-full tw:flex-col tw:gap-1 tw:rounded-xl tw:border tw:border-line-soft tw:bg-bg-card tw:px-4 tw:py-3 tw:text-left tw:hover:border-accent tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
                onClick={() => onOpenChat(chat)}
              >
                <strong className="tw:block tw:w-full tw:truncate">
                  {rowText.title}
                </strong>
                <span className="tw:block tw:w-full tw:truncate tw:text-xs tw:text-ink-muted">
                  {rowText.lastContent}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
