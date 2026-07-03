import React, { useEffect, useMemo, useRef } from "react";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { useI18n } from "@/shared/i18n";
import { Tag } from "antd";

interface GlobalSearchPanelProps {
  searchText: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  placeholder: string;
  emptyText: string;
  rows: GlobalRow[];
  onSearchChange: (value: string) => void;
  onSelectRow: (row: GlobalRow) => void;
}

const GROUP_KINDS: GlobalRow["kind"][] = ["action", "worker", "history"];

function clampIndex(nextIndex: number, length: number): number {
  if (length <= 0) return 0;
  if (nextIndex < 0) {
    return length - 1;
  }
  if (nextIndex >= length) {
    return 0;
  }
  return nextIndex;
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  action: "globalSearch.group.recommended",
  worker: "globalSearch.group.agents",
  history: "globalSearch.group.conversations",
};

const GLOBAL_SEARCH_PANEL_CLASS =
  "global-search-panel tw:flex tw:flex-col";
const GLOBAL_SEARCH_BOX_CLASS = "global-search-box tw:flex-none";
const GLOBAL_SEARCH_INPUT_CLASS =
  "global-search-input tw:w-full tw:border-0 tw:bg-transparent tw:p-2.5 tw:text-sm tw:text-ink-1 tw:outline-none tw:placeholder:text-ink-muted";
const GLOBAL_SEARCH_EMPTY_CLASS =
  "global-search-empty tw:px-4 tw:py-6 tw:text-center tw:text-[13px] tw:text-ink-muted";
const GLOBAL_SEARCH_LIST_CLASS =
  "global-search-list tw:flex tw:max-h-[60vh] tw:flex-col tw:gap-0.5 tw:overflow-auto";
const GLOBAL_SEARCH_GROUP_CLASS =
  "global-search-group tw:flex tw:flex-col tw:gap-0.5";
const GLOBAL_SEARCH_GROUP_LABEL_CLASS =
  "global-search-group-label tw:px-2 tw:py-1 tw:text-ink-muted";
const GLOBAL_SEARCH_ROW_CLASS =
  "global-search-row tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:rounded-2xl tw:border-0 tw:bg-transparent tw:p-1 tw:text-left tw:text-[13px] tw:leading-[1.35] tw:text-ink-1 tw:outline-none tw:hover:bg-bg-hover tw:focus:bg-[color-mix(in_srgb,var(--accent-soft)_30%,var(--bg-hover))]";
const GLOBAL_SEARCH_ICON_CLASS =
  "global-search-icon tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:text-ink-muted";
const GLOBAL_SEARCH_LABEL_CLASS =
  "global-search-label tw:min-w-0 tw:flex-auto tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap";
const GLOBAL_SEARCH_ROLE_CLASS =
  "global-search-role tw:max-w-[36%] tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted tw:max-[640px]:hidden";
const GLOBAL_SEARCH_SNIPPET_CLASS =
  "global-search-snippet tw:max-w-[52%] tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-text-muted tw:max-[640px]:hidden";
const GLOBAL_SEARCH_AWAITING_CLASS =
  "global-search-awaiting tw:flex-none tw:whitespace-nowrap tw:rounded tw:bg-[color-mix(in_srgb,var(--accent-warn)_10%,transparent)] tw:px-1.5 tw:py-px tw:text-[10px] tw:leading-[1.4] tw:text-accent-warn tw:max-[640px]:hidden";
const GLOBAL_SEARCH_LOADING_CLASS =
  "global-search-loading tw:flex-none tw:animate-ui-spin tw:text-xs tw:text-text-sub";
const GLOBAL_SEARCH_TIME_CLASS =
  "global-search-time tw:ml-auto tw:flex-none tw:pl-1 tw:font-code tw:text-[10px] tw:text-ink-muted tw:max-[640px]:hidden";

export const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  searchText,
  searchInputRef,
  placeholder,
  emptyText,
  rows,
  onSearchChange,
  onSelectRow,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const groupEntries = useMemo(() => {
    return GROUP_KINDS.map((kind) => {
      const groupRows = rows.filter((r) => r.kind === kind);
      return {
        kind,
        label: t(GROUP_LABEL_KEYS[kind]),
        rows: groupRows,
      };
    }).filter((entry) => entry.rows.length > 0);
  }, [rows, t]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <div
      ref={hostRef}
      className={GLOBAL_SEARCH_PANEL_CLASS}
      onKeyDown={(event) => {
        if (!rows.length) return;
        const liArr: HTMLElement[] = Array.from(
          hostRef.current?.querySelectorAll(".global-search-row") || [],
        );
        const activeElement = document.activeElement as HTMLButtonElement;
        const currentIndex = activeElement ? liArr.indexOf(activeElement) : 0;
        searchInputRef.current?.focus();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          liArr[clampIndex(currentIndex + 1, rows.length)].focus();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          liArr[clampIndex(currentIndex - 1, rows.length)].focus();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          activeElement?.click();
          return;
        }
      }}
    >
      <div className={GLOBAL_SEARCH_BOX_CLASS}>
        <input
          ref={searchInputRef}
          className={GLOBAL_SEARCH_INPUT_CLASS}
          type="text"
          placeholder={placeholder}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={placeholder}
        />
      </div>
      {rows.length === 0 ? (
        <div className={GLOBAL_SEARCH_EMPTY_CLASS}>{emptyText}</div>
      ) : (
        <div className={GLOBAL_SEARCH_LIST_CLASS}>
          {groupEntries.map(({ kind, label, rows: groupRows }) => (
            <div key={kind} className={GLOBAL_SEARCH_GROUP_CLASS}>
              <div className={GLOBAL_SEARCH_GROUP_LABEL_CLASS}>{label}</div>
              {groupRows.map((row) => {
                if (row.kind === "action") {
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`${GLOBAL_SEARCH_ROW_CLASS} global-search-action`}
                      onClick={() => onSelectRow(row)}
                    >
                      <span className={GLOBAL_SEARCH_ICON_CLASS} aria-hidden="true">
                        <MaterialIcon name={row.icon} />
                      </span>
                      <span className={GLOBAL_SEARCH_LABEL_CLASS}>{row.label}</span>
                    </button>
                  );
                }
                if (row.kind === "worker") {
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`${GLOBAL_SEARCH_ROW_CLASS} global-search-worker`}
                      onClick={() => onSelectRow(row)}
                    >
                      <span className={GLOBAL_SEARCH_ICON_CLASS} aria-hidden="true">
                        <AgentIcon
                          icon={row.icon}
                          type={row.type}
                          props={{
                            icon: {
                              width: 18,
                              height: 18,
                            },
                            avatar: {
                              size: 18,
                            },
                          }}
                        />
                      </span>
                      <span className={GLOBAL_SEARCH_LABEL_CLASS}>{row.label}</span>
                      <span className={GLOBAL_SEARCH_ROLE_CLASS}>{row.role}</span>
                    </button>
                  );
                }
                if (row.kind === "history") {
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`${GLOBAL_SEARCH_ROW_CLASS} global-search-history`}
                      onClick={() => onSelectRow(row)}
                    >
                      {row.isUnread ? (
                        <Tag color="blue">{t("globalSearch.row.unread")}</Tag>
                      ) : (
                        <span className={GLOBAL_SEARCH_ICON_CLASS} aria-hidden="true">
                          <MaterialIcon name="history" />
                        </span>
                      )}
                      <span className={GLOBAL_SEARCH_LABEL_CLASS}>{row.label}</span>
                      {row.snippet ? (
                        <span className={GLOBAL_SEARCH_SNIPPET_CLASS}>
                          {row.snippet}
                        </span>
                      ) : null}
                      {row.statusLabel ? (
                        <span className={GLOBAL_SEARCH_AWAITING_CLASS}>
                          {row.statusLabel}
                        </span>
                      ) : null}
                      {row.hasActiveRun ? (
                        <MaterialIcon
                          name="progress_activity"
                          className={GLOBAL_SEARCH_LOADING_CLASS}
                        />
                      ) : (
                        <span className={GLOBAL_SEARCH_TIME_CLASS}>
                          {formatChatTimeLabel(row.updatedAt)}
                        </span>
                      )}
                    </button>
                  );
                }
                return null;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
