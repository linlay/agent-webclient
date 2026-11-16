import React, { useMemo } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";

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

const TRIGGER_CLASS_NAME =
  "archive-filter-trigger archive-agent-filter-trigger";

export interface ArchiveAgentFilterProps {
  agents: Agent[];
  value: string;
  onChange: (agentKey: string) => void;
}

/**
 * Agent scope picker. The trigger stays a compact `agent_type` icon so the
 * toolbar keeps a single row; the dropdown lists "all agents" plus every
 * agent with its avatar and name.
 */
export const ArchiveAgentFilter: React.FC<ArchiveAgentFilterProps> = ({
  agents,
  value,
  onChange,
}) => {
  const selectedKey = String(value || "").trim();
  const selectedName = useMemo(() => {
    if (!selectedKey) return t("archive.filter.agentAll");
    const agent = agents.find(
      (item) => String(item.key || "").trim() === selectedKey,
    );
    return String(agent?.name || "").trim() || selectedKey;
  }, [agents, selectedKey]);

  const menu = useMemo<MenuProps>(
    () => ({
      selectable: true,
      selectedKeys: [selectedKey],
      items: [
        { key: "", label: t("archive.filter.agentAll") },
        { type: "divider" },
        ...agents.map((agent) => {
          const key = String(agent.key || "");
          const name = agent.name || key;
          return {
            key,
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
      ],
      onClick: ({ key }) => onChange(String(key || "")),
    }),
    [agents, onChange, selectedKey],
  );

  return (
    <Dropdown menu={menu} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        className={`${TRIGGER_CLASS_NAME}${selectedKey ? " is-active" : ""}`}
        aria-label={t("archive.filter.agent")}
        aria-haspopup="menu"
        title={selectedName}
      >
        <MaterialIcon name="agent_type" className="archive-filter-icon" />
      </button>
    </Dropdown>
  );
};
