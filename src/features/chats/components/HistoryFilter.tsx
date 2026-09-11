import React, { useMemo, useState } from "react";
import { DatePicker, Flex, Popover, Select } from "antd";
import type { Dayjs } from "dayjs";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

export type HistoryDateRange = [Dayjs | null, Dayjs | null] | null;

interface HistoryFilterProps {
  agentKey: string;
  agents: Agent[];
  dateRange: HistoryDateRange;
  filteredCount: number;
  totalCount: number;
  onAgentChange: (agentKey: string) => void;
  onDateRangeChange: (range: HistoryDateRange) => void;
  onReset: () => void;
}

const AGENT_ICON_PROPS = {
  icon: {
    className: "history-filter-agent-icon",
    width: 18,
    height: 18,
  },
  avatar: {
    className: "history-filter-agent-icon",
    size: 18,
  },
};

export const HistoryFilter: React.FC<HistoryFilterProps> = ({
  agentKey,
  agents,
  dateRange,
  filteredCount,
  totalCount,
  onAgentChange,
  onDateRangeChange,
  onReset,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const active = Boolean(agentKey) || Boolean(dateRange?.[0] || dateRange?.[1]);

  const updateStartDate = (value: Dayjs | null) => {
    const end = dateRange?.[1] ?? null;
    onDateRangeChange(value || end ? [value, end] : null);
  };

  const updateEndDate = (value: Dayjs | null) => {
    const start = dateRange?.[0] ?? null;
    onDateRangeChange(start || value ? [start, value] : null);
  };

  const agentOptions = useMemo(() => {
    const options = agents.map((agent) => ({
      value: String(agent.key || ""),
      label: (
        <span className="history-filter-agent-option">
          <AgentIcon icon={agent.icon} type="agent" props={AGENT_ICON_PROPS} />
          <span
            className="history-filter-agent-name"
            title={agent.name || agent.key}
          >
            {agent.name || agent.key}
          </span>
        </span>
      ),
    }));
    return [{ value: "", label: t("history.agentSelector.all") }, ...options];
  }, [agents, t]);

  const content = (
    <div
      className="history-filter-popover"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="history-filter-field">
        <span className="history-filter-label">
          {t("history.filter.agent")}
        </span>
        <Select
          value={agentKey || undefined}
          placeholder={t("history.agentSelector.all")}
          options={agentOptions}
          aria-label={t("history.filter.agent")}
          onChange={(value) => onAgentChange(value ?? "")}
        />
      </div>
      <Flex gap={10} justify="space-between">
        <div className="history-filter-field" style={{ flex: 1 }}>
          <span className="history-filter-label">
            {t("history.filter.dateStart")}
          </span>
          <DatePicker
            value={dateRange?.[0] ?? null}
            allowClear
            format="YYYY-MM-DD"
            aria-label={t("history.filter.dateStart")}
            placeholder={t("history.filter.dateStart")}
            onChange={updateStartDate}
          />
        </div>
        <div className="history-filter-field" style={{ flex: 1 }}>
          <span className="history-filter-label">
            {t("history.filter.dateEnd")}
          </span>
          <DatePicker
            value={dateRange?.[1] ?? null}
            allowClear
            format="YYYY-MM-DD"
            aria-label={t("history.filter.dateEnd")}
            placeholder={t("history.filter.dateEnd")}
            onChange={updateEndDate}
          />
        </div>
      </Flex>
      <div className="history-filter-actions">
        <UiButton
          variant="ghost"
          size="sm"
          disabled={!active}
          onClick={onReset}
        >
          {t("history.filter.reset")}
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
      classNames={{
        root: "history-filter-popover-overlay",
      }}
      arrow={false}
      content={content}
    >
      <button
        type="button"
        className={`history-filter-trigger${active ? " is-active" : ""}`}
        aria-label={t("history.filter.ariaLabel")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("history.filter.ariaLabel")}
      >
        <MaterialIcon name="filter_list" className="history-filter-icon" />
        <span className="history-filter-name">{t("history.filter.label")}</span>
        <span className="history-filter-count">
          {t("history.filter.count", {
            filtered: filteredCount,
            total: totalCount,
          })}
        </span>
      </button>
    </Popover>
  );
};
