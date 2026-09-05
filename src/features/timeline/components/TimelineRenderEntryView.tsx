import React from "react";
import { Flex } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { TimelineRow } from "./TimelineRow";

const TASK_GROUP_CLASS_NAME = "timeline-task-group tw:flex tw:flex-col tw:gap-2";
const TASK_GROUP_HEADER_CLASS_NAME =
  "timeline-task-group-header tw:group tw:cursor-pointer tw:appearance-none tw:py-[5px]";
const TASK_GROUP_HEADER_EXPANDED_CLASS_NAME = "is-expanded";
const TASK_GROUP_AGENT_CLASS_NAME =
  "timeline-task-group-agent tw:inline-flex tw:max-w-[160px] tw:shrink-0 tw:items-center tw:gap-[5px] tw:min-w-0";
const TASK_GROUP_AGENT_AVATAR_CLASS_NAME =
  "timeline-task-group-agent-avatar tw:shrink-0";
const TASK_GROUP_AGENT_NAME_CLASS_NAME =
  "timeline-task-group-agent-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-semibold";
const TASK_GROUP_TITLE_CLASS_NAME =
  "timeline-task-group-title tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-semibold";
const TASK_GROUP_STATUS_BASE_CLASS_NAME =
  "timeline-task-group-status tw:h-[7px] tw:w-[7px] tw:shrink-0 tw:rounded-full tw:bg-[color-mix(in_srgb,var(--ink-muted)_84%,transparent)]";
const TASK_GROUP_STATUS_CLASS_BY_STATUS: Record<string, string> = {
  running:
    "tw:animate-[timeline-task-status-flash_1s_infinite] tw:bg-accent-electric",
  completed: "tw:bg-accent-lime",
  success: "tw:bg-accent-lime",
  failed: "tw:bg-accent-danger",
  error: "tw:bg-accent-danger",
  canceled: "tw:bg-accent-warn",
};
const TASK_GROUP_DURATION_CLASS_NAME =
  "timeline-task-group-duration tw:shrink-0 tw:text-[11px] tw:leading-none tw:text-ink-muted";
const TASK_GROUP_ICON_CLASS_NAME =
  "tw:shrink-0 tw:text-lg tw:opacity-0 tw:group-hover:opacity-100";
const TASK_GROUP_ICON_EXPANDED_CLASS_NAME = "tw:opacity-100";
const TASK_GROUP_ERROR_CLASS_NAME =
  "timeline-task-group-error tw:ml-[34px] tw:break-words tw:text-xs tw:leading-[1.45] tw:text-[color-mix(in_srgb,var(--accent-danger)_82%,var(--ink-1))]";
const TASK_GROUP_BODY_CLASS_NAME =
  "timeline-task-group-body tw:flex tw:flex-col tw:gap-2";

function formatTaskStatus(
  status: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (status) {
    case "running":
      return t("timeline.taskStatus.running");
    case "completed":
      return t("timeline.taskStatus.completed");
    case "failed":
      return t("timeline.taskStatus.failed");
    case "canceled":
      return t("timeline.taskStatus.canceled");
    default:
      return status || t("timeline.taskStatus.default");
  }
}

function resolveTaskGroupAgent(
  entry: Extract<TimelineRenderEntry, { kind: "task-group" }>,
  agents: Agent[],
  fallbackAgentKey: string,
): Agent | null {
  const agentKey = String(entry.subAgentKey || fallbackAgentKey || "").trim();
  if (!agentKey) return null;

  return (
    agents.find((agent) => String(agent?.key || "").trim() === agentKey) || {
      key: agentKey,
      name: agentKey,
    }
  );
}

export interface TimelineRenderEntryViewProps {
  entry: TimelineRenderEntry;
  agents: Agent[];
  fallbackAgentKey?: string;
  expandedTaskGroups: Record<string, boolean>;
  onToggleTaskGroup: (key: string) => void;
}

export const TimelineRenderEntryView: React.FC<
  TimelineRenderEntryViewProps
> = ({
  entry,
  agents,
  fallbackAgentKey = "",
  expandedTaskGroups,
  onToggleTaskGroup,
}) => {
  const { t } = useI18n();

  if (entry.kind === "node") {
    if (entry.node.kind === "agent-group") return null;
    return <TimelineRow node={entry.node} />;
  }

  if (entry.kind === "tool-group") {
    return <TimelineRow toolGroup={entry} />;
  }

  const expanded = Boolean(expandedTaskGroups[entry.key]);
  const taskDuration = formatResponseDuration(entry.durationMs, t);
  const statusText = formatTaskStatus(entry.status, t);
  const taskAgent = resolveTaskGroupAgent(
    entry,
    agents,
    fallbackAgentKey,
  );

  return (
    <section className={TASK_GROUP_CLASS_NAME}>
      <Flex
        className={[
          TASK_GROUP_HEADER_CLASS_NAME,
          expanded ? TASK_GROUP_HEADER_EXPANDED_CLASS_NAME : "",
        ]
          .filter(Boolean)
          .join(" ")}
        align="center"
        gap={8}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => onToggleTaskGroup(entry.key)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggleTaskGroup(entry.key);
        }}
      >
        {taskAgent ? (
          <span className={TASK_GROUP_AGENT_CLASS_NAME}>
            <AgentIcon
              icon={taskAgent.icon}
              type="agent"
              props={{
                icon: {
                  className: TASK_GROUP_AGENT_AVATAR_CLASS_NAME,
                  width: 20,
                  height: 20,
                },
                avatar: {
                  className: TASK_GROUP_AGENT_AVATAR_CLASS_NAME,
                  size: 20,
                },
              }}
            />
            <span className={TASK_GROUP_AGENT_NAME_CLASS_NAME}>
              {taskAgent.name || taskAgent.key}
            </span>
          </span>
        ) : null}
        <span className={TASK_GROUP_TITLE_CLASS_NAME}>
          {entry.taskName || entry.taskId}
        </span>
        <span
          className={[
            TASK_GROUP_STATUS_BASE_CLASS_NAME,
            TASK_GROUP_STATUS_CLASS_BY_STATUS[entry.status || "unknown"] || "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={statusText}
          title={statusText}
        />
        {taskDuration ? (
          <span className={TASK_GROUP_DURATION_CLASS_NAME}>{taskDuration}</span>
        ) : null}
        <MaterialIcon
          className={[
            TASK_GROUP_ICON_CLASS_NAME,
            expanded ? TASK_GROUP_ICON_EXPANDED_CLASS_NAME : "",
          ]
            .filter(Boolean)
            .join(" ")}
          name={expanded ? "expand_more" : "chevron_right"}
        />
      </Flex>
      {entry.error ? (
        <div className={TASK_GROUP_ERROR_CLASS_NAME}>{entry.error}</div>
      ) : null}
      {expanded ? (
        <div className={TASK_GROUP_BODY_CLASS_NAME}>
          {entry.renderEntries.map((childEntry) => (
            <TimelineRenderEntryView
              key={childEntry.key}
              entry={childEntry}
              agents={agents}
              fallbackAgentKey={fallbackAgentKey}
              expandedTaskGroups={expandedTaskGroups}
              onToggleTaskGroup={onToggleTaskGroup}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
};
