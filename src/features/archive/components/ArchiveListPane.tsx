import React, { useMemo } from "react";
import { Dropdown, Input, Spin, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type { ArchivedSummaryResponse } from "@/shared/data";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  formatArchiveTimestamp,
  groupArchivesByAgent,
  type ArchiveDateRange,
} from "@/features/archive/lib/archiveViewModel";
import { ArchiveAgentFilter } from "@/features/archive/components/ArchiveAgentFilter";
import { ArchiveFilter } from "@/features/archive/components/ArchiveFilter";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

export interface ArchiveListPaneProps {
  query: string;
  onQueryChange: (value: string) => void;
  agents: Agent[];
  showAgentFilter: boolean;
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
  onRestoreGroup: (agentKey: string) => void;
  onDeleteGroup: (agentKey: string) => void;
}

const GROUP_AGENT_ICON_PROPS = {
  icon: {
    className: "archive-group-agent-icon",
    width: 24,
    height: 24,
  },
  avatar: {
    className: "archive-group-agent-icon",
    size: 24,
  },
};

const GROUP_ACTION_CLASS_NAME =
  "archive-group-action tw:flex tw:h-7 tw:w-7 tw:flex-none tw:items-center tw:justify-center tw:rounded-control tw:border-0 tw:bg-transparent tw:text-ink-muted tw:hover:bg-bg-hover tw:hover:text-ink-1";

export const ArchiveListPane: React.FC<ArchiveListPaneProps> = (props) => {
  const agentByKey = useMemo(() => {
    const map = new Map<string, Agent>();
    props.agents.forEach((agent) => {
      const key = String(agent.key || "").trim();
      if (key) map.set(key, agent);
    });
    return map;
  }, [props.agents]);

  const groups = useMemo(
    () => groupArchivesByAgent(props.items),
    [props.items],
  );

  const resolveGroupName = (groupKey: string) => {
    const agentName = String(agentByKey.get(groupKey)?.name || "").trim();
    if (agentName) return agentName;
    return groupKey || t("archive.group.unknown");
  };

  return (
    <section className="archive-list-pane tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
      <div className="archive-toolbar tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:px-1.5 tw:py-1.5">
        <div className="archive-toolbar-search tw:min-w-0 tw:grow tw:shrink tw:basis-[140px]">
          <Input
            prefix={<MaterialIcon name="search" />}
            value={props.query}
            variant="filled"
            placeholder={t("archive.search.placeholder")}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
        </div>
        <ArchiveFilter
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
        {props.showAgentFilter ? (
          <ArchiveAgentFilter
            agents={props.agents}
            value={props.agentFilter}
            onChange={props.onAgentFilterChange}
          />
        ) : null}
      </div>
      {props.resultText ? (
        <div className="archive-result-bar tw:flex tw:items-center tw:gap-3 tw:px-2 tw:pb-2 tw:text-xs tw:text-ink-muted">
          {props.resultText}
        </div>
      ) : null}
      <div className="archive-groups-scroll tw:min-h-0 tw:flex-1 tw:overflow-auto tw:pb-4">
        {groups.length === 0 ? (
          <div className="archive-empty-state">
            {props.loading ? (
              <Spin />
            ) : (
              <>
                <span className="archive-empty-state-icon" aria-hidden="true">
                  <MaterialIcon name="archive" />
                </span>
                <strong className="archive-empty-state-title">
                  {t("archive.empty.list")}
                </strong>
                <p className="archive-empty-state-hint">
                  {t("archive.empty.listHint")}
                </p>
              </>
            )}
          </div>
        ) : (
          <Spin spinning={props.loading}>
            {groups.map((group) => {
              const agent = agentByKey.get(group.key);
              const groupName = resolveGroupName(group.key);
              const groupMenuItems: MenuProps["items"] = [
                {
                  key: "restoreAll",
                  label: t("archive.group.restoreAll"),
                  icon: <MaterialIcon name="unarchive" />,
                },
                { type: "divider" },
                {
                  key: "deleteAll",
                  label: t("archive.group.deleteAll"),
                  icon: <MaterialIcon name="delete" />,
                  danger: true,
                },
              ];
              const handleGroupMenuClick: MenuProps["onClick"] = ({ key }) => {
                if (key === "restoreAll") props.onRestoreGroup(group.key);
                else if (key === "deleteAll") props.onDeleteGroup(group.key);
              };
              return (
                <section
                  key={group.key || "archive-group-unassigned"}
                  className="archive-group tw:flex tw:flex-col"
                >
                  <header className="archive-group-head tw:flex tw:items-center tw:gap-2 tw:px-[6px] tw:py-[6px]">
                    <div className="archive-group-identity tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5">
                      <AgentIcon
                        icon={agent?.icon}
                        mode={agent?.mode}
                        type="agent"
                        props={GROUP_AGENT_ICON_PROPS}
                      />
                      <span className="archive-group-name tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-medium">
                        {groupName}
                      </span>
                    </div>
                    <div className="archive-group-actions tw:flex tw:flex-none tw:items-center tw:gap-1">
                      <span className="archive-group-count tw:flex-none tw:rounded-full tw:bg-bg-hover tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:text-ink-muted">
                        {t("archive.group.count", { count: group.count })}
                      </span>
                      <Dropdown
                        menu={{
                          items: groupMenuItems,
                          onClick: handleGroupMenuClick,
                        }}
                        trigger={["click"]}
                        placement="bottomRight"
                      >
                        <button
                          type="button"
                          className={GROUP_ACTION_CLASS_NAME}
                          aria-label={t("archive.group.more")}
                          title={t("archive.group.more")}
                        >
                          <MaterialIcon name="more_horiz" />
                        </button>
                      </Dropdown>
                    </div>
                  </header>
                  <div
                    role="listbox"
                    aria-label={`${groupName} · ${t("archive.list.ariaLabel")}`}
                    className="archive-list tw:flex tw:flex-col"
                  >
                    {group.items.map((item) => (
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
                        <span className="archive-list-item-head tw:flex tw:min-w-0 tw:items-center">
                          <strong className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px]">
                            {item.chatName || item.chatId}
                          </strong>
                        </span>
                        <span className="archive-list-meta tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-1.5 tw:gap-y-1.5">
                          <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">
                            {formatArchiveTimestamp(item.lastRunAt)}
                          </span>
                        </span>
                        <span
                          className="archive-list-item-actions"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Tooltip title={t("archive.action.restore")}>
                            <UiButton
                              size="mini"
                              variant="ghost"
                              iconOnly
                              aria-label={t("archive.action.restore")}
                              onClick={() =>
                                props.onRestore(item.chatId, false)
                              }
                            >
                              <MaterialIcon name="unarchive" />
                            </UiButton>
                          </Tooltip>
                          {props.canRestoreAndOpen ? (
                            <Tooltip
                              title={t("archive.action.restoreAndOpen")}
                            >
                              <UiButton
                                size="mini"
                                variant="ghost"
                                iconOnly
                                aria-label={t("archive.action.restoreAndOpen")}
                                onClick={() =>
                                  props.onRestore(item.chatId, true)
                                }
                              >
                                <MaterialIcon name="open_in_new" />
                              </UiButton>
                            </Tooltip>
                          ) : null}
                          <Tooltip title={t("archive.action.delete")}>
                            <UiButton
                              size="mini"
                              variant="ghost"
                              iconOnly
                              color="danger"
                              aria-label={t("archive.action.delete")}
                              onClick={() => props.onDelete(item.chatId)}
                            >
                              <MaterialIcon name="delete" />
                            </UiButton>
                          </Tooltip>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </Spin>
        )}
      </div>
    </section>
  );
};
