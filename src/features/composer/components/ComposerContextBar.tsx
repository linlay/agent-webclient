import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import { MaterialIcon } from "@/shared/icons/material";
import { useI18n } from "@/shared/i18n";
import { AgentSwitcherPopover } from "@/features/workers/components/AgentSwitcherPopover";
import { buildTimelineAgentOptions } from "@/features/workers/lib/agentSelection";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import styles from "./ComposerContextBar.module.css";

interface ComposerContextBarProps {
  agents: readonly Agent[];
  workerRows?: WorkerRow[];
  currentAgentKey: string;
  currentWorkerName?: string;
  isCoder: boolean;
  disabled?: boolean;
  onSelectAgent: (agentKey: string) => void;
}

export function ComposerContextBar({
  agents,
  workerRows = [],
  currentAgentKey,
  currentWorkerName,
  isCoder,
  disabled = false,
  onSelectAgent,
}: ComposerContextBarProps) {
  const { t } = useI18n();
  const currentAgent = agents.find((agent) => agent.key === currentAgentKey);
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
            <MaterialIcon name={isCoder ? "code" : "smart_toy"} />
            <span className={styles.agentLabel}>{displayName}</span>
            <MaterialIcon name="expand_more" />
          </button>
        )}
      />
      <span className={styles.local}>
        <MaterialIcon name="terminal" />
        {t("composer.context.local")}
      </span>
      {isCoder && (
        <span className={styles.branch} title={t("composer.context.branchPending")}>
          <MaterialIcon name="branches" />
          <span className={styles.branchLabel}>{t("composer.context.branchUnavailable")}</span>
        </span>
      )}
    </div>
  );
}
