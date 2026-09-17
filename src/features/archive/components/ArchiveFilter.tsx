import React, { useMemo, useState } from "react";
import { DatePicker, Popover, Select } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { Agent } from "@/features/agents/lib/agentState";
import type { ArchiveDateRange } from "@/features/archive/lib/archiveViewModel";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

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
        />
        <DatePicker
          value={end != null ? dayjs(end) : null}
          allowClear
          format="YYYY-MM-DD"
          aria-label={`${label} ${t("archive.filter.dateEnd")}`}
          placeholder={t("archive.filter.dateEnd")}
          onChange={updateEnd}
        />
      </div>
    </div>
  );
};

export interface ArchiveFilterProps {
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

export const ArchiveFilter: React.FC<ArchiveFilterProps> = ({
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
  const active = Boolean(agentFilter || archivedRange || createdRange || lastRunRange);

  const agentOptions = useMemo(() => {
    const options = agents.map((agent) => ({
      value: String(agent.key || ""),
      label: agent.name || agent.key,
    }));
    return [{ value: "", label: t("archive.filter.agentAll") }, ...options];
  }, [agents, t]);

  const content = (
    <div
      className="archive-filter-popover"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="archive-filter-field">
        <span className="archive-filter-label">{t("archive.filter.agent")}</span>
        <Select
          value={agentFilter || undefined}
          placeholder={t("archive.filter.agentAll")}
          options={agentOptions}
          aria-label={t("archive.filter.agent")}
          onChange={(value) => onAgentFilterChange(value ?? "")}
        />
      </div>
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
        <span className="archive-filter-name">{t("archive.filter.label")}</span>
        <span className="archive-filter-count">
          {t("archive.filter.count", { filtered: filteredCount, total: totalCount })}
        </span>
      </button>
    </Popover>
  );
};
