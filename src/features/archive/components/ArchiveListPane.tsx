import React, { useMemo, useState } from "react";
import { Dropdown, Input, Spin, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type { ArchivedSummaryResponse } from "@/shared/data";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  formatArchiveTimestamp,
  groupArchivesByAgent,
  type ArchiveDateRange,
} from "@/features/archive/lib/archiveViewModel";
import { ArchiveFilter } from "@/features/archive/components/ArchiveFilter";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { RowMoreMenu } from "@/shared/ui/RowMoreMenu";
import { BottomSheet } from "@/shared/ui/BottomSheet";
import { LongPressable } from "@/shared/ui/LongPressable";
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
  onRefresh: () => void;
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
  /** 移动端：行操作改用底部动作面板。 */
  mobile?: boolean;
}

const GROUP_AGENT_ICON_PROPS = {
  icon: {
    className: "archive-group-agent-icon",
    width: 18,
    height: 18,
  },
  avatar: {
    className: "archive-group-agent-icon",
    size: 18,
  },
};

const GROUP_ACTION_CLASS_NAME =
  "archive-group-action tw:flex tw:h-6 tw:w-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-control tw:border-0 tw:bg-transparent tw:text-ink-muted tw:opacity-60 tw:hover:bg-bg-hover tw:hover:text-ink-1 tw:hover:opacity-100";

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

  const [actionsItem, setActionsItem] = useState<ArchivedSummaryResponse | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const buildItemMenu = (item: ArchivedSummaryResponse): NonNullable<MenuProps["items"]> => [
    {
      key: "restore",
      icon: <MaterialIcon name="undo" />,
      label: t("archive.action.restore"),
    },
    ...(props.canRestoreAndOpen
      ? [
          {
            key: "restoreAndOpen",
            icon: <MaterialIcon name="open_in_new" />,
            label: t("archive.action.restoreAndOpen"),
          },
        ]
      : []),
    { type: "divider" as const },
    {
      key: "delete",
      icon: <MaterialIcon name="delete" />,
      label: t("archive.action.delete"),
      danger: true,
    },
  ];
  const handleItemAction = (key: string, item: ArchivedSummaryResponse) => {
    if (key === "restore") props.onRestore(item.chatId, false);
    else if (key === "restoreAndOpen") props.onRestore(item.chatId, true);
    else if (key === "delete") props.onDelete(item.chatId);
  };
  const openItemActions = (item: ArchivedSummaryResponse) => {
    setActionsItem(item);
    setActionsOpen(true);
  };

  const [groupActions, setGroupActions] = useState<{ key: string; name: string } | null>(null);
  const [groupActionsOpen, setGroupActionsOpen] = useState(false);
  const buildGroupMenu = (groupKey: string): NonNullable<MenuProps["items"]> => [
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
  const handleGroupAction = (key: string, groupKey: string) => {
    if (key === "restoreAll") props.onRestoreGroup(groupKey);
    else if (key === "deleteAll") props.onDeleteGroup(groupKey);
  };
  const openGroupActions = (groupKey: string, groupName: string) => {
    setGroupActions({ key: groupKey, name: groupName });
    setGroupActionsOpen(true);
  };

  return (
    <section className="archive-list-pane tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
      <div className="archive-toolbar tw:flex tw:items-center tw:gap-2 tw:px-1.5 tw:py-1.5">
        <div className="archive-toolbar-search tw:min-w-0 tw:grow tw:shrink">
          <Input
            prefix={<MaterialIcon name="search" />}
            suffix={
              <ArchiveFilter
                showAgentFilter={props.showAgentFilter}
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
            }
            value={props.query}
            variant="filled"
            placeholder={t("archive.search.placeholder")}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
        </div>
        <Tooltip title={t("archive.action.refresh")}>
          <UiButton
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={t("archive.action.refresh")}
            loading={props.loading}
            onClick={props.onRefresh}
          >
            <MaterialIcon name="refresh" />
          </UiButton>
        </Tooltip>
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
              const groupMenuItems = buildGroupMenu(group.key);
              const handleGroupMenuClick: MenuProps["onClick"] = ({ key }) => {
                handleGroupAction(String(key), group.key);
              };
              return (
                <section
                  key={group.key || "archive-group-unassigned"}
                  className="archive-group tw:flex tw:flex-col"
                >
                  <header className="archive-group-head tw:flex tw:items-center tw:gap-2 tw:px-1.5 tw:py-1">
                    <div className="archive-group-identity tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5">
                      <AgentIcon
                        icon={agent?.icon}
                        mode={agent?.mode}
                        type="agent"
                        props={GROUP_AGENT_ICON_PROPS}
                      />
                      <span className="archive-group-name tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[12px] tw:font-medium tw:text-ink-muted">
                        {groupName}
                      </span>
                    </div>
                    <div className="archive-group-actions tw:flex tw:flex-none tw:items-center tw:gap-1">
                      <span className="archive-group-count tw:flex-none tw:text-[11px] tw:text-ink-muted tw:opacity-60">
                        {t("archive.group.count", { count: group.count })}
                      </span>
                      {props.mobile ? (
                        <UiButton
                          size="mini"
                          variant="ghost"
                          iconOnly
                          className="archive-group-more"
                          aria-label={t("archive.group.more")}
                          title={t("archive.group.more")}
                          onClick={() => openGroupActions(group.key, groupName)}
                        >
                          <MaterialIcon name="more_horiz" />
                        </UiButton>
                      ) : (
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
                      )}
                    </div>
                  </header>
                  <div
                    role="listbox"
                    aria-label={`${groupName} · ${t("archive.list.ariaLabel")}`}
                    className="archive-list tw:flex tw:flex-col"
                  >
                    {group.items.map((item) => {
                      const itemMenuItems = buildItemMenu(item);
                      const onItemMenuClick: MenuProps["onClick"] = ({
                        key,
                        domEvent,
                      }) => {
                        domEvent.stopPropagation();
                        handleItemAction(String(key), item);
                      };
                      return (
                        <LongPressable
                          key={item.chatId}
                          onLongPress={
                            props.mobile ? () => openItemActions(item) : undefined
                          }
                        >
                          {(gesture) => (
                        <RowMoreMenu
                          className={`archive-list-item tw:flex tw:w-full tw:cursor-pointer tw:flex-col tw:rounded-none tw:border-0 tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:bg-bg-hover tw:[&.is-active]:bg-[var(--bg-selected)] tw:[&.is-active]:text-[var(--nav-selected-text)] ${item.chatId === props.selectedChatId ? "is-active" : ""}`}
                          rowProps={{
                            role: "option",
                            "aria-selected": item.chatId === props.selectedChatId,
                            tabIndex: 0,
                            onClick: () => {
                              if (gesture.consumeClick()) return;
                              props.onSelect(item.chatId);
                            },
                            onKeyDown: (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                props.onSelect(item.chatId);
                              }
                            },
                            ...gesture.longPressProps,
                          }}
                          items={itemMenuItems}
                          onSelect={onItemMenuClick}
                          label={t("archive.item.more")}
                          ariaLabel={`${item.chatName || item.chatId}: ${t("archive.item.more")}`}
                          onMoreClick={
                            props.mobile ? () => openItemActions(item) : undefined
                          }
                        >
                          <span className="archive-list-item-head tw:flex tw:min-w-0 tw:items-center">
                            <strong className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px]">
                              {item.chatName || item.chatId}
                            </strong>
                          </span>
                          <span className="archive-list-meta tw:mt-1 tw:flex tw:flex-wrap tw:gap-x-1.5 tw:gap-y-1">
                            <span className="archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">
                              {formatArchiveTimestamp(item.lastRunAt)}
                            </span>
                          </span>
                        </RowMoreMenu>
                          )}
                        </LongPressable>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </Spin>
        )}
      </div>
      {props.mobile ? (
        <BottomSheet
          open={groupActionsOpen}
          onClose={() => setGroupActionsOpen(false)}
          ariaLabel={t("archive.group.more")}
          getContainer=".layout-mobile"
        >
          <div className="archive-actions-list">
            <div className="archive-actions-sheet-title">
              {groupActions?.name || ""}
            </div>
            {(groupActions ? buildGroupMenu(groupActions.key) : [])
              .filter(Boolean)
              .filter((entry) => (entry as { type?: string }).type !== "divider")
              .map((entry) => {
                const row = entry as {
                  key?: React.Key;
                  icon?: React.ReactNode;
                  label?: React.ReactNode;
                  danger?: boolean;
                };
                const key = String(row.key ?? "");
                return (
                  <button
                    key={key}
                    type="button"
                    className={`archive-actions-row${row.danger ? " is-danger" : ""}`}
                    onClick={() => {
                      setGroupActionsOpen(false);
                      if (groupActions) handleGroupAction(key, groupActions.key);
                    }}
                  >
                    {row.icon}
                    <span>{row.label}</span>
                  </button>
                );
              })}
          </div>
        </BottomSheet>
      ) : null}
      {props.mobile ? (
        <BottomSheet
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
          ariaLabel={t("archive.item.more")}
          getContainer=".layout-mobile"
        >
          <div className="archive-actions-list">
            <div className="archive-actions-sheet-title">
              {actionsItem?.chatName || actionsItem?.chatId || ""}
            </div>
            {(actionsItem ? buildItemMenu(actionsItem) : [])
              .filter(Boolean)
              .filter((entry) => (entry as { type?: string }).type !== "divider")
              .map((entry) => {
                const row = entry as {
                  key?: React.Key;
                  icon?: React.ReactNode;
                  label?: React.ReactNode;
                  danger?: boolean;
                };
                const key = String(row.key ?? "");
                return (
                  <button
                    key={key}
                    type="button"
                    className={`archive-actions-row${row.danger ? " is-danger" : ""}`}
                    onClick={() => {
                      setActionsOpen(false);
                      if (actionsItem) handleItemAction(key, actionsItem);
                    }}
                  >
                    {row.icon}
                    <span>{row.label}</span>
                  </button>
                );
              })}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
};
