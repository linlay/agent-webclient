import React, { useMemo, useState } from "react";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiInput } from "@/shared/ui/UiInput";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiTag } from "@/shared/ui/UiTag";
import { useI18n } from "@/shared/i18n";
import type { Agent } from "@/app/state/types";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildAgentSearchText(agent: Agent): string {
  return [
    agent.name,
    agent.key,
    agent.role,
    ...(Array.isArray(agent.wonders) ? agent.wonders : []),
  ]
    .map((value) => toText(value).toLowerCase())
    .join(" ");
}

export interface AgentListProps {
  agents: Agent[];
  selectedAgentKey?: string;
  className?: string;
  compact?: boolean;
  searchable?: boolean;
  emptyText?: string;
  searchPlaceholder?: string;
  onSelectAgent?: (agent: Agent) => void;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  selectedAgentKey = "",
  className = "",
  compact = false,
  searchable = true,
  emptyText,
  searchPlaceholder,
  onSelectAgent,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const normalizedAgents = Array.isArray(agents) ? agents : [];
    const visibleAgents = query
      ? normalizedAgents.filter((agent) =>
          buildAgentSearchText(agent).includes(query),
        )
      : normalizedAgents;

    return visibleAgents;
  }, [agents, search]);

  return (
    <section
      className={[
        "agent-list",
        compact ? "agent-list-compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {searchable ? (
        <label className="agent-list-search">
          <MaterialIcon name="search" className="agent-list-search-icon" />
          <UiInput
            value={search}
            placeholder={
              searchPlaceholder || t("agents.list.searchPlaceholder")
            }
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      ) : null}

      <div className="agent-list-body" role="list">
        {filteredAgents.length === 0 ? (
          <div className="agent-list-empty">
            {emptyText || t("agents.list.empty")}
          </div>
        ) : (
          filteredAgents.map((agent, index) => {
            const agentKey = toText(agent.key);
            const agentName = toText(agent.name) || agentKey;
            const role = toText(agent.role) || "--";
            const wonders = Array.isArray(agent.wonders) ? agent.wonders : [];
            const unreadCount = toNumber(agent?.stats?.unreadCount);
            const totalCount = toNumber(agent?.stats?.totalCount);
            const isInteractive = Boolean(onSelectAgent);

            return (
              <UiListItem
                key={agentKey || `${agentName}-${index}`}
                className="agent-list-item"
                selected={Boolean(agentKey && agentKey === selectedAgentKey)}
                dense={compact}
                role={isInteractive ? "button" : "listitem"}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={() => onSelectAgent?.(agent)}
                onKeyDown={(event) => {
                  if (!isInteractive) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectAgent?.(agent);
                }}
              >
                <AgentIcon
                  icon={agent.icon}
                  type="agent"
                  props={{
                    icon: {
                      className: "agent-list-item-icon",
                      width: 36,
                      height: 36,
                    },
                    avatar: {
                      className: "agent-list-item-icon",
                      size: 36,
                    },
                  }}
                />
                <div className="agent-list-item-main">
                  <div className="agent-list-item-head">
                    <span className="agent-list-item-name">{agentName}</span>
                    {unreadCount > 0 ? (
                      <UiTag tone="accent">
                        {t("agents.list.unreadCount", { count: unreadCount })}
                      </UiTag>
                    ) : null}
                  </div>
                  <div className="agent-list-item-meta">
                    <span>{role}</span>
                    {agentKey ? <span>{agentKey}</span> : null}
                    {totalCount > 0 ? (
                      <span>
                        {t("agents.list.conversationCount", {
                          count: totalCount,
                        })}
                      </span>
                    ) : null}
                  </div>
                  {wonders.length > 0 ? (
                    <div className="agent-list-item-wonders">
                      {wonders
                        .slice(0, compact ? 2 : 4)
                        .map((wonder, wonderIndex) => (
                          <UiTag
                            key={`${toText(wonder)}-${wonderIndex}`}
                            tone="muted"
                          >
                            {toText(wonder)}
                          </UiTag>
                        ))}
                    </div>
                  ) : null}
                </div>
              </UiListItem>
            );
          })
        )}
      </div>
    </section>
  );
};
