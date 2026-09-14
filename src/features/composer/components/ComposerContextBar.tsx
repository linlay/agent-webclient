import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import { MaterialIcon } from "@/shared/icons/material";
import { useI18n } from "@/shared/i18n";
import { AgentSwitcherPopover } from "@/features/workers/components/AgentSwitcherPopover";
import { buildTimelineAgentOptions } from "@/features/workers/lib/agentSelection";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import { useProjectGit } from "@/features/composer/hooks/useProjectGit";
import styles from "./ComposerContextBar.module.css";

interface ComposerContextBarProps {
  agents: readonly Agent[];
  workerRows?: WorkerRow[];
  currentAgentKey: string;
  currentWorkerName?: string;
  isCoder: boolean;
  isKbase?: boolean;
  disabled?: boolean;
  onSelectAgent: (agentKey: string) => void;
}

export function ComposerContextBar({
  agents,
  workerRows = [],
  currentAgentKey,
  currentWorkerName,
  isCoder,
  isKbase = false,
  disabled = false,
  onSelectAgent,
}: ComposerContextBarProps) {
  const { t } = useI18n();
  const currentAgent = agents.find((agent) => agent.key === currentAgentKey);
  const git = useProjectGit(currentAgentKey, currentAgent?.workspaceDir);
  const branchLabel = !git || git.status === "no_workspace" ? null
    : git.status === "branch" ? git.branch
    : git.status === "detached" ? `${t("composer.context.detachedHead")} · ${git.commit?.slice(0, 8)}`
    : git.status === "not_repository" ? t("composer.context.notRepository")
    : git.status === "loading" ? t("composer.context.branchLoading")
    : t("composer.context.branchUnavailable");
  const displayName = currentAgent?.name || currentWorkerName || currentAgentKey || t("composer.context.selectAgent");
  const currentWorker = currentAgentKey ? {
    type: "agent" as const, sourceId: currentAgentKey, displayName,
    role: currentAgent?.role || "",
  } : null;
  const options = buildTimelineAgentOptions({ agents: [...agents], workerRows, currentWorker });
  const selectionDisabled = disabled || options.length === 0;
  return (
    <div className={styles.bar} role="group" aria-label={t("composer.context.label")}>
      <AgentSwitcherPopover
        currentWorker={currentWorker}
        options={options}
        disabled={selectionDisabled}
        containerClassName={styles.switcher}
        onSelectAgent={(key) => { if (key !== currentAgentKey) onSelectAgent(key); }}
        renderTrigger={(open) => (
          <button
            type="button"
            className={styles.agent}
            disabled={selectionDisabled}
            aria-label={t("composer.context.selectAgent")}
            aria-haspopup="listbox"
            aria-expanded={open}
            title={displayName}
          >
            {isKbase ? (
              <span className={styles.kbaseIcon} data-agent-type-icon="kbase" aria-hidden="true" />
            ) : isCoder ? (
              <MaterialIcon name="code" className={styles.typeIcon} />
            ) : (
              <MaterialIcon name="agent_type" className={styles.typeIcon} />
            )}
            <span className={styles.agentLabel}>{displayName}</span>
            <MaterialIcon name="expand_more" />
          </button>
        )}
      />
      <span className={styles.local}>
        <MaterialIcon name="terminal" />
        {t("composer.context.local")}
      </span>
      {branchLabel && (
        <span className={styles.branch} title={git?.commit ? `${branchLabel} · ${git.commit}` : branchLabel} aria-live="polite" aria-busy={git?.status === "loading"}>
          <MaterialIcon name="branches" />
          <span className={styles.branchLabel}>{branchLabel}</span>
        </span>
      )}
    </div>
  );
}
