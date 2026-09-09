import React, { useMemo, useState } from "react";
import { Dropdown } from "antd";
import { useAppContext } from "@/app/state/provider";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";

const ICON_PROPS = {
  icon: {
    className: "history-worker-option-icon",
    width: 20,
    height: 20,
  },
  avatar: {
    className: "history-worker-option-icon",
    size: 20,
  },
};

export const AgentSelector: React.FC<{
  value?: string;
  onChange: (agentKey: string) => void;
}> = ({ value = "", onChange }) => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const [open, setOpen] = useState(false);
  const agents = useMemo(
    () => (Array.isArray(state.agents) ? state.agents : []),
    [state.agents],
  );
  const selectedAgent = agents.find((agent) => agent.key === value);
  const triggerLabel = value
    ? selectedAgent?.name || value
    : t("history.agentSelector.all");
  const menuItems = useMemo(
    () => [
      {
        key: "all",
        label: (
          <span className="history-worker-option">
            <MaterialIcon name="smart_toy" className="history-worker-option-icon" />
            <span className="history-worker-option-name">
              {t("history.agentSelector.all")}
            </span>
            {!value ? <MaterialIcon name="check" className="history-worker-option-check" /> : null}
          </span>
        ),
      },
      { type: "divider" as const },
      ...agents.map((agent) => ({
        key: `agent:${agent.key}`,
        label: (
          <span className="history-worker-option">
            <AgentIcon icon={agent.icon} type="agent" props={ICON_PROPS} />
            <span className="history-worker-option-name" title={agent.name || agent.key}>
              {agent.name || agent.key}
            </span>
            {value === agent.key ? (
              <MaterialIcon
                name="check"
                className="history-worker-option-check"
              />
            ) : null}
          </span>
        ),
      })),
    ],
    [agents, t, value],
  );

  return (
    <Dropdown
      autoFocus
      open={open}
      onOpenChange={setOpen}
      overlayClassName="history-agent-menu"
      menu={{
        items: menuItems,
        selectable: true,
        selectedKeys: [value ? `agent:${value}` : "all"],
        onClick: ({ key }) => {
          onChange(key === "all" ? "" : key.slice("agent:".length));
          setOpen(false);
        },
      }}
      trigger={["click"]}
      placement="bottomRight"
    >
      <button
        type="button"
        className={`history-worker-selector${value ? " is-filtered" : ""}`}
        aria-label={t("history.workerSelector.ariaLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={triggerLabel}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selectedAgent ? (
          <AgentIcon
            icon={selectedAgent.icon}
            type="agent"
            props={{
              icon: {
                className: "history-worker-selector-icon",
                width: 20,
                height: 20,
              },
              avatar: {
                className: "history-worker-selector-icon",
                size: 20,
              },
            }}
          />
        ) : <MaterialIcon name="smart_toy" className="history-worker-selector-icon" />}
        <span className="history-worker-selector-name">{triggerLabel}</span>
        <MaterialIcon
          name="expand_more"
          className="history-worker-selector-chevron"
        />
      </button>
    </Dropdown>
  );
};
