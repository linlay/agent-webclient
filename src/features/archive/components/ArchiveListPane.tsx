import React from "react";
import { Dropdown, Input, Spin } from "antd";
import type { MenuProps } from "antd";
import type { ArchivedSummaryResponse } from "@/shared/data";
import type { Agent } from "@/features/agents/lib/agentState";
import type { ArchiveDateRange } from "@/features/archive/lib/archiveViewModel";
import { ArchiveFilter } from "@/features/archive/components/ArchiveFilter";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";

export interface ArchiveListPaneProps {
  query: string;
  onQueryChange: (value: string) => void;
  agents: Agent[];
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  archivedRange: ArchiveDateRange;
  onArchivedRangeChange: (range: ArchiveDateRange) => void;
  createdRange: ArchiveDateRange;
  onCreatedRangeChange: (range: ArchiveDateRange) => void;
  lastRunRange: ArchiveDateRange;
  onLastRunRangeChange: (range: ArchiveDateRange) => void;
  filteredCount: number;
  totalCount: number;
  onResetFilters: () => void;
  resultText: string;
  loading: boolean;
  items: ArchivedSummaryResponse[];
  selectedChatId: string;
  onSelect: (chatId: string) => void;
  canRestoreAndOpen: boolean;
  onRestore: (chatId: string, openAfterRestore: boolean) => void;
  onDelete: (chatId: string) => void;
}

export const ArchiveListPane: React.FC<ArchiveListPaneProps> = (props) => (
  <section className="archive-modal-list-pane tw:flex tw:min-h-0 tw:flex-col">
    <div className="archive-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-2 tw:[&_.ant-input-affix-wrapper]:min-w-0 tw:[&_.ant-input-prefix]:mr-1.5 tw:[&_.ant-input-prefix]:text-ink-muted tw:px-[6px] tw:h-[45px]">
      <Input
        prefix={<MaterialIcon name="search" />}
        value={props.query}
        variant="filled"
        placeholder={t("archive.search.placeholder")}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      <ArchiveFilter
        agents={props.agents}
        agentFilter={props.agentFilter}
        onAgentFilterChange={props.onAgentFilterChange}
        archivedRange={props.archivedRange}
        onArchivedRangeChange={props.onArchivedRangeChange}
        createdRange={props.createdRange}
        onCreatedRangeChange={props.onCreatedRangeChange}
        lastRunRange={props.lastRunRange}
        onLastRunRangeChange={props.onLastRunRangeChange}
        filteredCount={props.filteredCount}
        totalCount={props.totalCount}
        onReset={props.onResetFilters}
      />
    </div>
    {props.resultText ? (
      <div className="archive-result-bar tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-ink-muted">
        {props.resultText}
      </div>
    ) : null}
    <Spin spinning={props.loading}>
      <div className="archive-list tw:flex tw:min-h-0 tw:max-h-[430px] tw:flex-col tw:overflow-auto" role="listbox" aria-label={t("archive.list.ariaLabel")}>
        {props.items.length === 0 ? (
          <div className="command-empty-state">{t("archive.empty.list")}</div>
        ) : props.items.map((item) => {
          const menuItems: MenuProps["items"] = [
            {
              key: "restore",
              label: t("archive.action.restore"),
              icon: <MaterialIcon name="unarchive" />,
            },
            ...(props.canRestoreAndOpen
              ? [{
                  key: "restoreAndOpen",
                  label: t("archive.action.restoreAndOpen"),
                  icon: <MaterialIcon name="open_in_new" />,
                }]
              : []),
            { type: "divider" },
            {
              key: "delete",
              label: t("archive.action.delete"),
              icon: <MaterialIcon name="delete" />,
              danger: true,
            },
          ];
          const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
            if (key === "restore") props.onRestore(item.chatId, false);
            else if (key === "restoreAndOpen") props.onRestore(item.chatId, true);
            else if (key === "delete") props.onDelete(item.chatId);
          };
          return (
            <div
              key={item.chatId}
              role="option"
              aria-selected={item.chatId === props.selectedChatId}
              tabIndex={0}
              className={`archive-list-item tw:flex tw:w-full tw:cursor-pointer tw:flex-col tw:rounded-none tw:border-0 tw:bg-transparent tw:px-3 tw:py-[11px] tw:text-left tw:text-ink-1 tw:hover:bg-bg-hover tw:[&.is-active]:bg-[var(--bg-selected)] tw:[&.is-active]:text-[var(--nav-selected-text)] ${item.chatId === props.selectedChatId ? "is-active" : ""}`}
              onClick={() => props.onSelect(item.chatId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onSelect(item.chatId);
                }
              }}
            >
              <span className="archive-list-item-head tw:flex tw:items-center tw:justify-between tw:gap-2.5">
                <strong className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px]">
                  {item.chatName || item.chatId}
                </strong>
                <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={["click"]} placement="bottomRight">
                  <button
                    type="button"
                    className="archive-list-item-more tw:flex tw:h-6 tw:w-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-control tw:border-0 tw:bg-transparent tw:text-ink-muted tw:hover:bg-bg-hover tw:hover:text-ink-1"
                    aria-label={t("archive.item.more")}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MaterialIcon name="more_horiz" />
                  </button>
                </Dropdown>
              </span>
              <span className="archive-list-meta tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-1.5 tw:gap-y-1.5">
                {item.agentKey ? <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{item.agentKey}</span> : null}
                <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.item.created")}: {formatChatTimeLabel(item.createdAt)}</span>
                <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.item.lastRun")}: {formatChatTimeLabel(item.lastRunAt)}</span>
                <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">{t("archive.detail.archivedAt", { time: formatChatTimeLabel(item.archivedAt) })}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Spin>
  </section>
);
