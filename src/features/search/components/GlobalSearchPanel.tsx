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
    return GROUP_KINDS
      .map((kind) => {
        const groupRows = rows.filter((r) => r.kind === kind);
        return {
          kind,
          label: t(GROUP_LABEL_KEYS[kind]),
          rows: groupRows,
        };
      })
      .filter((entry) => entry.rows.length > 0);
  }, [rows, t]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <div
      ref={hostRef}
      className="global-search-panel"
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
      <div className="global-search-box">
        <input
          ref={searchInputRef}
          className="global-search-input"
          type="text"
          placeholder={placeholder}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={placeholder}
        />
      </div>
      {rows.length === 0 ? (
        <div className="global-search-empty">{emptyText}</div>
      ) : (
        <div className="global-search-list">
          {(() => {
            let globalIndex = 0;
            return groupEntries.map(({ kind, label, rows: groupRows }) => (
              <div key={kind} className="global-search-group">
                <div className="global-search-group-label">{label}</div>
                {groupRows.map((row) => {
                  const index = globalIndex;
                  globalIndex += 1;
                  if (row.kind === "action") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className="global-search-row global-search-action"
                        onClick={() => onSelectRow(row)}
                      >
                        <span className="global-search-icon" aria-hidden="true">
                          <MaterialIcon name={row.icon} />
                        </span>
                        <span className="global-search-label">{row.label}</span>
                      </button>
                    );
                  }
                  if (row.kind === "worker") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className="global-search-row global-search-worker"
                        onClick={() => onSelectRow(row)}
                      >
                        <span className="global-search-icon" aria-hidden="true">
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
                        <span className="global-search-label">{row.label}</span>
                        <span className="global-search-role">{row.role}</span>
                      </button>
                    );
                  }
                  if (row.kind === "history") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className="global-search-row global-search-history"
                        onClick={() => onSelectRow(row)}
                      >
                        {row.isUnread ? (
                          <Tag color="blue">{t("globalSearch.row.unread")}</Tag>
                        ) : (
                          <span
                            className="global-search-icon"
                            aria-hidden="true"
                          >
                            <MaterialIcon name="history" />
                          </span>
                        )}
                        <span className="global-search-label">{row.label}</span>
                        {row.snippet ? (
                          <span className="global-search-snippet">
                            {row.snippet}
                          </span>
                        ) : null}
                        {row.statusLabel ? (
                          <span className="global-search-awaiting">
                            {row.statusLabel}
                          </span>
                        ) : null}
                        {row.hasActiveRun ? (
                          <MaterialIcon
                            name="progress_activity"
                            className="global-search-loading"
                          />
                        ) : (
                          <span className="global-search-time">
                            {formatChatTimeLabel(row.updatedAt)}
                          </span>
                        )}
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};
