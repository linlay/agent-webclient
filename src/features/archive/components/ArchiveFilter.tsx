import React, { useMemo, useState } from "react";
import { DatePicker, Popover, Select } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { Agent } from "@/features/agents/lib/agentState";
import type { ArchiveDateRange } from "@/features/archive/lib/archiveViewModel";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

/**
 * Keep every nested dropdown (date panels, agent select) inside the filter
 * popover so picking a value does not count as an outside click.
 */
const popupInsidePopover = (trigger: HTMLElement) =>
  trigger.parentElement || document.body;

interface DateRangeFieldProps {
  label: string;
  range: ArchiveDateRange;
  onChange: (range: ArchiveDateRange) => void;
}

const DateRangeField: React.FC<DateRangeFieldProps> = ({ label, range, onChange }) => {
  const start = range?.[0] ?? null;
  const end = range?.[1] ?? null;

  const updateStart = (value: Dayjs | null) => {
    const nextStart = value ? value.startOf("day").valueOf() : null;
    onChange(nextStart == null && end == null ? null : [nextStart, end]);
  };

  const updateEnd = (value: Dayjs | null) => {
    const nextEnd = value ? value.endOf("day").valueOf() : null;
    onChange(start == null && nextEnd == null ? null : [start, nextEnd]);
  };

  return (
    <div className="archive-filter-field">
      <span className="archive-filter-label">{label}</span>
      <div className="archive-filter-date-range">
        <DatePicker
          value={start != null ? dayjs(start) : null}
          allowClear
          format="YYYY-MM-DD"
          aria-label={`${label} ${t("archive.filter.dateStart")}`}
          placeholder={t("archive.filter.dateStart")}
          onChange={updateStart}
          getPopupContainer={popupInsidePopover}
        />
        <DatePicker
          value={end != null ? dayjs(end) : null}
          allowClear
          format="YYYY-MM-DD"
          aria-label={`${label} ${t("archive.filter.dateEnd")}`}
          placeholder={t("archive.filter.dateEnd")}
          onChange={updateEnd}
          getPopupContainer={popupInsidePopover}
        />
      </div>
    </div>
  );
};

const AGENT_ICON_PROPS = {
  icon: {
    className: "archive-filter-agent-icon",
    width: 18,
    height: 18,
  },
  avatar: {
    className: "archive-filter-agent-icon",
    size: 18,
  },
};

export interface ArchiveFilterProps {
  showAgentFilter: boolean;
  agents: Agent[];
  agentFilter: string;
  onAgentFilterChange: (agentKey: string) => void;
  archivedRange: ArchiveDateRange;
  onArchivedRangeChange: (range: ArchiveDateRange) => void;
  createdRange: ArchiveDateRange;
  onCreatedRangeChange: (range: ArchiveDateRange) => void;
  lastRunRange: ArchiveDateRange;
  onLastRunRangeChange: (range: ArchiveDateRange) => void;
  filteredCount: number;
  totalCount: number;
  onReset: () => void;
}

/**
 * Single filter entry merged into the search input suffix. The popover owns
 * the agent scope picker, the three date ranges and the reset action, so the
 * toolbar only keeps a search box plus the refresh button.
 */
export const ArchiveFilter: React.FC<ArchiveFilterProps> = ({
  showAgentFilter,
  agents,
  agentFilter,
  onAgentFilterChange,
  archivedRange,
  onArchivedRangeChange,
  createdRange,
  onCreatedRangeChange,
  lastRunRange,
  onLastRunRangeChange,
  filteredCount,
  totalCount,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const active = Boolean(
    agentFilter || archivedRange || createdRange || lastRunRange,
  );

  const agentOptions = useMemo(
    () =>
      agents.map((agent) => {
        const key = String(agent.key || "");
        const name = agent.name || key;
        return {
          value: key,
          label: (
            <span
              data-agent-identity=""
              className="archive-filter-agent-option"
              title={name}
            >
              <AgentIcon
                icon={agent.icon}
                mode={agent.mode}
                type="agent"
                props={AGENT_ICON_PROPS}
              />
              <span className="archive-filter-agent-name">{name}</span>
            </span>
          ),
        };
      }),
    [agents],
  );

  const content = (
    <div
      className="archive-filter-popover"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="archive-filter-summary">
        {t("archive.filter.count", {
          filtered: filteredCount,
          total: totalCount,
        })}
      </div>
      {showAgentFilter ? (
        <div className="archive-filter-field">
          <span className="archive-filter-label">
            {t("archive.filter.agent")}
          </span>
          <Select
            value={agentFilter || undefined}
            allowClear
            placeholder={t("archive.filter.agentAll")}
            options={agentOptions}
            onChange={(value) => onAgentFilterChange(String(value || ""))}
            popupMatchSelectWidth={false}
            getPopupContainer={popupInsidePopover}
            aria-label={t("archive.filter.agent")}
          />
        </div>
      ) : null}
      <DateRangeField
        label={t("archive.filter.archivedDate")}
        range={archivedRange}
        onChange={onArchivedRangeChange}
      />
      <DateRangeField
        label={t("archive.filter.createdDate")}
        range={createdRange}
        onChange={onCreatedRangeChange}
      />
      <DateRangeField
        label={t("archive.filter.lastRunDate")}
        range={lastRunRange}
        onChange={onLastRunRangeChange}
      />
      <div className="archive-filter-actions">
        <UiButton
          variant="ghost"
          size="sm"
          disabled={!active}
          onClick={onReset}
        >
          {t("archive.filter.reset")}
        </UiButton>
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={["click"]}
      placement="bottomRight"
      arrow={false}
      content={content}
    >
      <button
        type="button"
        className={`archive-filter-trigger${active ? " is-active" : ""}`}
        aria-label={t("archive.filter.ariaLabel")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("archive.filter.ariaLabel")}
      >
        <MaterialIcon name="filter_list" className="archive-filter-icon" />
        {active ? <span className="archive-filter-dot" aria-hidden="true" /> : null}
      </button>
    </Popover>
  );
};
